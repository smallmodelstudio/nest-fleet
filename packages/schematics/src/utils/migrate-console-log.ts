import type { Tree } from '@angular-devkit/schematics';
import { basename, extname } from 'node:path';
import ts from 'typescript';

import { applyInsertions, hasLoggerMember, type Insertion, namedImportInsertions } from './add-logger';

/**
 * Rewrites `console.log(...)` calls in the given file to go through a Nest
 * `Logger` instead: `this.logger.log(...)` inside a class (adding a
 * `logger` field, and the `Logger` import, if the class doesn't have one
 * yet), or a module-scoped `logger` for calls outside any class. No-ops if
 * the file has no `console.log` calls, so it is safe to run more than
 * once. Returns whether the file changed.
 */
export function migrateConsoleLogToLogger(tree: Tree, path: string): boolean {
  const source = tree.readText(path);
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);

  const calls = findConsoleLogCalls(sourceFile);
  if (calls.length === 0) {
    return false;
  }

  const insertions: Insertion[] = [];
  const classesNeedingField = new Map<string, ts.ClassDeclaration>();
  let needsModuleLogger = false;

  for (const call of calls) {
    const callee = call.expression as ts.PropertyAccessExpression;
    const enclosingClass = findEnclosingClass(call);

    if (enclosingClass?.name) {
      insertions.push({ pos: callee.getStart(sourceFile), end: callee.getEnd(), text: 'this.logger.log' });
      if (!hasLoggerMember(enclosingClass)) {
        classesNeedingField.set(enclosingClass.name.text, enclosingClass);
      }
    } else {
      insertions.push({ pos: callee.getStart(sourceFile), end: callee.getEnd(), text: 'logger.log' });
      needsModuleLogger = true;
    }
  }

  for (const classDeclaration of classesNeedingField.values()) {
    insertions.push({
      pos: classDeclaration.members.pos,
      text: `\n  private readonly logger = new Logger(${classDeclaration.name!.text}.name);\n`,
    });
  }

  const needsModuleLoggerDeclaration = needsModuleLogger && !hasModuleLogger(sourceFile);
  if (needsModuleLoggerDeclaration) {
    insertions.push(moduleLoggerInsertion(sourceFile, path));
  }

  if (classesNeedingField.size > 0 || needsModuleLoggerDeclaration) {
    insertions.push(...namedImportInsertions(sourceFile, '@nestjs/common', 'Logger'));
  }

  tree.overwrite(path, applyInsertions(source, insertions));
  return true;
}

function findConsoleLogCalls(sourceFile: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'console' &&
      node.expression.name.text === 'log'
    ) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return calls;
}

/**
 * The nearest enclosing class, if `this` inside `node` would refer to an
 * instance of it. Stops (and returns `undefined`) at a plain `function`
 * boundary crossed before reaching a class, since a plain function
 * rebinds `this`; arrow functions and class members don't, so the walk
 * continues through them.
 */
function findEnclosingClass(node: ts.Node): ts.ClassDeclaration | undefined {
  let current = node.parent;
  while (current) {
    if (ts.isClassDeclaration(current)) {
      return current;
    }
    if (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current)) {
      return undefined;
    }
    current = current.parent;
  }
  return undefined;
}

function hasModuleLogger(sourceFile: ts.SourceFile): boolean {
  return sourceFile.statements.some(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === 'logger',
      ),
  );
}

function moduleLoggerInsertion(sourceFile: ts.SourceFile, path: string): Insertion {
  const context = basename(path, extname(path));
  const lastImport = [...sourceFile.statements].reverse().find(ts.isImportDeclaration);

  return lastImport
    ? { pos: lastImport.getEnd(), text: `\nconst logger = new Logger('${context}');` }
    : { pos: 0, text: `const logger = new Logger('${context}');\n\n` };
}

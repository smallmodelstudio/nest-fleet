import type { Tree } from '@angular-devkit/schematics';
import ts from 'typescript';

interface Insertion {
  pos: number;
  text: string;
}

/**
 * Adds a `private readonly logger = new Logger(<className>.name);` field to
 * the named class in the given file, importing `Logger` from
 * `@nestjs/common` if needed. No-ops if the class already has a `logger`
 * member, so it is safe to run more than once.
 */
export function addLoggerToClass(tree: Tree, path: string, className: string): void {
  const source = tree.readText(path);
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);

  const classDeclaration = sourceFile.statements.find(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) && statement.name?.text === className,
  );
  if (!classDeclaration) {
    return;
  }

  const hasLogger = classDeclaration.members.some(
    (member) => member.name && ts.isIdentifier(member.name) && member.name.text === 'logger',
  );
  if (hasLogger) {
    return;
  }

  const insertions: Insertion[] = [
    {
      pos: classDeclaration.members.pos,
      text: `\n  private readonly logger = new Logger(${className}.name);\n`,
    },
    ...loggerImportInsertion(sourceFile),
  ];

  tree.overwrite(path, applyInsertions(source, insertions));
}

function loggerImportInsertion(sourceFile: ts.SourceFile): Insertion[] {
  const importDeclaration = sourceFile.statements.find(
    (statement): statement is ts.ImportDeclaration =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === '@nestjs/common',
  );

  const namedBindings = importDeclaration?.importClause?.namedBindings;
  if (!importDeclaration || !namedBindings || !ts.isNamedImports(namedBindings)) {
    return [{ pos: 0, text: "import { Logger } from '@nestjs/common';\n" }];
  }

  const alreadyImported = namedBindings.elements.some((element) => element.name.text === 'Logger');
  if (alreadyImported) {
    return [];
  }

  const lastElement = namedBindings.elements[namedBindings.elements.length - 1];
  if (!lastElement) {
    return [{ pos: namedBindings.getStart(sourceFile) + 1, text: 'Logger' }];
  }

  return [{ pos: lastElement.getEnd(), text: ', Logger' }];
}

function applyInsertions(source: string, insertions: Insertion[]): string {
  return [...insertions]
    .sort((a, b) => b.pos - a.pos)
    .reduce((text, insertion) => text.slice(0, insertion.pos) + insertion.text + text.slice(insertion.pos), source);
}

import type { Tree } from '@angular-devkit/schematics';
import ts from 'typescript';

interface Insertion {
  pos: number;
  text: string;
}

type ModuleProperty = 'imports' | 'controllers' | 'providers' | 'exports';

/**
 * Registers `className` in the `property` array of the `@Module({ ... })`
 * decorator in the given file, adding an import for it from `importPath` if
 * needed. No-ops if the class is already listed, so it is safe to run more
 * than once.
 */
export function registerInModule(
  tree: Tree,
  modulePath: string,
  property: ModuleProperty,
  className: string,
  importPath: string,
): void {
  const source = tree.readText(modulePath);
  const sourceFile = ts.createSourceFile(modulePath, source, ts.ScriptTarget.Latest, true);

  const moduleOptions = findModuleOptions(sourceFile);
  if (!moduleOptions) {
    return;
  }

  const propertyAssignment = moduleOptions.properties.find(
    (member): member is ts.PropertyAssignment =>
      ts.isPropertyAssignment(member) && member.name.getText(sourceFile) === property,
  );

  const insertions: Insertion[] = [];

  if (propertyAssignment && ts.isArrayLiteralExpression(propertyAssignment.initializer)) {
    const elements = propertyAssignment.initializer.elements;
    const alreadyPresent = elements.some((element) => element.getText(sourceFile) === className);
    if (alreadyPresent) {
      return;
    }
    const lastElement = elements[elements.length - 1];
    insertions.push(
      lastElement
        ? { pos: lastElement.getEnd(), text: `, ${className}` }
        : { pos: elements.end, text: className },
    );
  } else if (!propertyAssignment) {
    const separator = moduleOptions.properties.length > 0 ? ',\n  ' : '\n  ';
    insertions.push({
      pos: moduleOptions.properties.end,
      text: `${separator}${property}: [${className}]`,
    });
  } else {
    return;
  }

  insertions.push(...importInsertion(sourceFile, className, importPath));

  tree.overwrite(modulePath, applyInsertions(source, insertions));
}

function findModuleOptions(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression | undefined {
  const classDeclaration = sourceFile.statements.find(ts.isClassDeclaration);
  if (!classDeclaration) {
    return undefined;
  }

  const moduleDecorator = ts.getDecorators(classDeclaration)?.find((decorator) => {
    return ts.isCallExpression(decorator.expression) && decorator.expression.expression.getText(sourceFile) === 'Module';
  });
  const call = moduleDecorator?.expression;
  const options = call && ts.isCallExpression(call) ? call.arguments[0] : undefined;

  return options && ts.isObjectLiteralExpression(options) ? options : undefined;
}

function importInsertion(sourceFile: ts.SourceFile, className: string, importPath: string): Insertion[] {
  const existing = sourceFile.statements.find(
    (statement): statement is ts.ImportDeclaration =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === importPath,
  );
  if (existing) {
    return [];
  }

  return [{ pos: 0, text: `import { ${className} } from '${importPath}';\n` }];
}

function applyInsertions(source: string, insertions: Insertion[]): string {
  return [...insertions]
    .sort((a, b) => b.pos - a.pos)
    .reduce((text, insertion) => text.slice(0, insertion.pos) + insertion.text + text.slice(insertion.pos), source);
}

import type { Tree } from '@angular-devkit/schematics';
import ts from 'typescript';

export interface Insertion {
  pos: number;
  text: string;
  /** End of the range to replace, exclusive. Defaults to `pos` (a pure insertion, nothing removed). */
  end?: number;
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
  if (!classDeclaration || hasLoggerMember(classDeclaration)) {
    return;
  }

  const insertions: Insertion[] = [
    {
      pos: classDeclaration.members.pos,
      text: `\n  private readonly logger = new Logger(${className}.name);\n`,
    },
    ...namedImportInsertions(sourceFile, '@nestjs/common', 'Logger'),
  ];

  tree.overwrite(path, applyInsertions(source, insertions));
}

/** True if the class already declares a member named `logger`. */
export function hasLoggerMember(classDeclaration: ts.ClassDeclaration): boolean {
  return classDeclaration.members.some(
    (member) => member.name && ts.isIdentifier(member.name) && member.name.text === 'logger',
  );
}

/**
 * Insertions that add `name` to the named imports of `moduleSpecifier`,
 * merging into an existing import statement or adding a new one. Empty if
 * `name` is already imported from that module.
 */
export function namedImportInsertions(sourceFile: ts.SourceFile, moduleSpecifier: string, name: string): Insertion[] {
  const importDeclaration = sourceFile.statements.find(
    (statement): statement is ts.ImportDeclaration =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === moduleSpecifier,
  );

  const namedBindings = importDeclaration?.importClause?.namedBindings;
  if (!importDeclaration || !namedBindings || !ts.isNamedImports(namedBindings)) {
    return [{ pos: 0, text: `import { ${name} } from '${moduleSpecifier}';\n` }];
  }

  const alreadyImported = namedBindings.elements.some((element) => element.name.text === name);
  if (alreadyImported) {
    return [];
  }

  const lastElement = namedBindings.elements[namedBindings.elements.length - 1];
  if (!lastElement) {
    return [{ pos: namedBindings.getStart(sourceFile) + 1, text: name }];
  }

  return [{ pos: lastElement.getEnd(), text: `, ${name}` }];
}

export function applyInsertions(source: string, insertions: Insertion[]): string {
  return [...insertions]
    .sort((a, b) => b.pos - a.pos)
    .reduce(
      (text, insertion) =>
        text.slice(0, insertion.pos) + insertion.text + text.slice(insertion.end ?? insertion.pos),
      source,
    );
}

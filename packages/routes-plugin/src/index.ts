import { writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import ts from 'typescript';

export interface RoutesPluginOptions {
  /** Where to write the route list, relative to the current working directory. Defaults to 'routes.json'. */
  outputFile?: string;
}

export interface RouteEntry {
  controller: string;
  handler: string;
  method: string;
  path: string;
  file: string;
}

const NEST_COMMON_MODULE = '@nestjs/common';
const CONTROLLER_DECORATOR = 'Controller';
const HTTP_METHOD_DECORATORS = ['Get', 'Post', 'Put', 'Delete', 'Patch', 'Options', 'Head', 'All'];

/**
 * A `nest build` compiler plugin (`compilerOptions.plugins` in `nest-cli.json`).
 * Reads the whole program on every compile and writes a `routes.json` listing
 * every `@Controller` route, keyed off `@nestjs/common`'s own decorators so a
 * renamed import (`import { Get as HttpGet }`) is still recognised. It makes
 * no AST changes, so the returned transformer is a no-op passthrough.
 */
export function before(options: RoutesPluginOptions = {}, program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
  writeRoutesFile(collectRoutes(program), options);
  return () => (sourceFile) => sourceFile;
}

export function collectRoutes(program: ts.Program): RouteEntry[] {
  const cwd = program.getCurrentDirectory();
  const routes: RouteEntry[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile || sourceFile.fileName.includes('/node_modules/')) {
      continue;
    }
    routes.push(...collectRoutesInFile(sourceFile, cwd));
  }

  return routes.sort((a, b) => a.controller.localeCompare(b.controller) || a.path.localeCompare(b.path));
}

function collectRoutesInFile(sourceFile: ts.SourceFile, cwd: string): RouteEntry[] {
  const nestCommonLocalNames = importedLocalNames(sourceFile, NEST_COMMON_MODULE);
  const routes: RouteEntry[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement) || !statement.name) {
      continue;
    }

    const controllerDecorator = findDecorator(statement, nestCommonLocalNames, CONTROLLER_DECORATOR);
    if (!controllerDecorator) {
      continue;
    }

    const controllerName = statement.name.text;
    const controllerPath = decoratorPath(controllerDecorator);

    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member) || !member.name || !ts.isIdentifier(member.name)) {
        continue;
      }

      for (const httpMethod of HTTP_METHOD_DECORATORS) {
        const methodDecorator = findDecorator(member, nestCommonLocalNames, httpMethod);
        if (!methodDecorator) {
          continue;
        }

        routes.push({
          controller: controllerName,
          handler: member.name.text,
          method: httpMethod.toUpperCase(),
          path: joinRoutePaths(controllerPath, decoratorPath(methodDecorator)),
          file: relative(cwd, sourceFile.fileName),
        });
      }
    }
  }

  return routes;
}

/** Maps each name `@nestjs/common` exports to the local name it was imported as, following aliases. */
function importedLocalNames(sourceFile: ts.SourceFile, moduleSpecifier: string): Map<string, string> {
  const localNames = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== moduleSpecifier
    ) {
      continue;
    }

    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) {
      continue;
    }

    for (const element of namedBindings.elements) {
      const exportedName = (element.propertyName ?? element.name).text;
      localNames.set(exportedName, element.name.text);
    }
  }

  return localNames;
}

function findDecorator(
  node: ts.ClassDeclaration | ts.MethodDeclaration,
  localNames: Map<string, string>,
  exportedName: string,
): ts.Decorator | undefined {
  const localName = localNames.get(exportedName);
  if (!localName || !ts.canHaveDecorators(node)) {
    return undefined;
  }

  return ts.getDecorators(node)?.find((decorator) => decoratorCalleeName(decorator) === localName);
}

function decoratorCalleeName(decorator: ts.Decorator): string | undefined {
  const expression = decorator.expression;
  const identifier = ts.isCallExpression(expression) ? expression.expression : expression;
  return ts.isIdentifier(identifier) ? identifier.text : undefined;
}

/** The string a `@Controller`/HTTP-method decorator was called with, from either a string or a `{ path }` object. Empty if none. */
function decoratorPath(decorator: ts.Decorator): string {
  if (!ts.isCallExpression(decorator.expression)) {
    return '';
  }

  const [firstArg] = decorator.expression.arguments;
  if (!firstArg) {
    return '';
  }

  if (ts.isStringLiteralLike(firstArg)) {
    return firstArg.text;
  }

  if (ts.isObjectLiteralExpression(firstArg)) {
    const pathProperty = firstArg.properties.find(
      (property): property is ts.PropertyAssignment =>
        ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === 'path',
    );
    if (pathProperty && ts.isStringLiteralLike(pathProperty.initializer)) {
      return pathProperty.initializer.text;
    }
  }

  return '';
}

function joinRoutePaths(...segments: string[]): string {
  const combined = segments
    .flatMap((segment) => segment.split('/'))
    .filter((part) => part.length > 0)
    .join('/');

  return `/${combined}`;
}

function writeRoutesFile(routes: RouteEntry[], options: RoutesPluginOptions): void {
  const outputFile = resolve(process.cwd(), options.outputFile ?? 'routes.json');
  writeFileSync(outputFile, `${JSON.stringify(routes, null, 2)}\n`);
}

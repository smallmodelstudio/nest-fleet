import { strings } from '@angular-devkit/core';
import {
  apply,
  applyTemplates,
  chain,
  mergeWith,
  MergeStrategy,
  move,
  type Rule,
  type SchematicContext,
  type Tree,
  url,
} from '@angular-devkit/schematics';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';

import { registerInModule } from '../utils/register-in-module';
import type { Schema } from './schema';

const TERMINUS_VERSION = '^12.1.0';

interface PackageJson {
  dependencies?: Record<string, string>;
}

/**
 * `nest add @smallmodelstudio/health`: adds `@nestjs/terminus` as a dependency,
 * generates a HealthModule with a /health endpoint, registers it in
 * AppModule, and installs the new dependency.
 */
export function teamHealthAdd(options: Schema): Rule {
  const sourceRoot = normalizeSourceRoot(options.sourceRoot);

  return chain([
    addTerminusDependency,
    (tree: Tree) => {
      registerInModule(tree, `/${sourceRoot}/app.module.ts`, 'imports', 'HealthModule', './health/health.module.js');
    },
    mergeWith(
      apply(url('./files'), [applyTemplates({ ...strings, ...options }), move(`${sourceRoot}/health`)]),
      MergeStrategy.Overwrite,
    ),
    (_tree: Tree, context: SchematicContext) => {
      context.addTask(new NodePackageInstallTask());
    },
  ]);
}

function normalizeSourceRoot(sourceRoot: string | undefined): string {
  return (sourceRoot ?? 'src').replace(/^\/+/, '');
}

function addTerminusDependency(tree: Tree): void {
  const packageJson = JSON.parse(tree.readText('/package.json')) as PackageJson;

  packageJson.dependencies ??= {};
  packageJson.dependencies['@nestjs/terminus'] ??= TERMINUS_VERSION;

  tree.overwrite('/package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
}

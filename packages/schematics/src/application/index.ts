import { strings } from '@angular-devkit/core';
import {
  apply,
  applyTemplates,
  chain,
  externalSchematic,
  mergeWith,
  MergeStrategy,
  move,
  type Rule,
  type Tree,
  url,
} from '@angular-devkit/schematics';
import { readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';

import { registerInModule } from '../utils/register-in-module';
import type { Schema } from './schema';

// The package root of @smallmodelstudio/schematics itself: dist/application -> dist -> package root.
const OWN_PACKAGE_ROOT = resolvePath(__dirname, '..', '..');

interface PackageJson {
  devDependencies?: Record<string, string>;
}

interface OwnPackageJson {
  version: string;
}

/**
 * Extends Nest's built-in `application` schematic: once the standard
 * project is generated, it overlays our defaults (collection, Dockerfile,
 * CI workflow) and wires up a starter `/health` endpoint, so `nest new`
 * produces a service that's ready to build, lint and ship.
 */
export function teamApplication(options: Schema): Rule {
  return (tree, context) => {
    const filesBefore = listFiles(tree);

    return chain([
      externalSchematic('@nestjs/schematics', 'application', options),
      (tree2: Tree): Rule => {
        const projectPath = findProjectPath(tree2, filesBefore);

        registerInModule(
          tree2,
          `${projectPath}/src/app.module.ts`,
          'controllers',
          'HealthController',
          './health/health.controller.js',
        );

        return chain([
          mergeWith(
            apply(url('./files'), [applyTemplates({ ...strings, ...options }), move(projectPath)]),
            MergeStrategy.Overwrite,
          ),
          (tree3: Tree) => {
            linkPublishedPackage(tree3, projectPath);
            return tree3;
          },
        ]);
      },
    ])(tree, context);
  };
}

/**
 * `nest-cli.json`'s `"collection": "@smallmodelstudio/schematics"` is
 * unresolvable unless the generated project depends on it: every `nest`
 * command loads the generate command's schematics up front, so even
 * `nest build` fails outright without this. Depend on whatever version of
 * ourselves is actually running, so this always matches what got published.
 */
function linkPublishedPackage(tree: Tree, projectPath: string): void {
  const packageJsonPath = `${projectPath}/package.json`;
  const packageJson = JSON.parse(tree.readText(packageJsonPath)) as PackageJson;

  const ownPackageJson = JSON.parse(readFileSync(join(OWN_PACKAGE_ROOT, 'package.json'), 'utf8')) as OwnPackageJson;

  packageJson.devDependencies ??= {};
  packageJson.devDependencies['@smallmodelstudio/schematics'] = `^${ownPackageJson.version}`;

  tree.overwrite(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function listFiles(tree: Tree): Set<string> {
  const files = new Set<string>();
  tree.visit((path) => files.add(path));
  return files;
}

function findProjectPath(tree: Tree, filesBefore: Set<string>): string {
  const suffix = '/nest-cli.json';
  const newNestCliJson = [...listFiles(tree)].find((file) => !filesBefore.has(file) && file.endsWith(suffix));
  if (!newNestCliJson) {
    throw new Error('Could not find the generated nest-cli.json to determine the project path.');
  }
  return newNestCliJson.slice(0, -suffix.length);
}

import { strings } from '@angular-devkit/core';
import { chain, externalSchematic, type Rule, type Tree } from '@angular-devkit/schematics';

import { addLoggerToClass } from '../utils/add-logger';
import type { Schema } from './schema';

/**
 * Overrides Nest's built-in `controller` schematic: the spec is always
 * generated (a team rule that survives `--no-spec`), and the generated
 * controller gets a `Logger` field.
 */
export function teamController(options: Schema): Rule {
  return (tree, context) => {
    const filesBefore = listFiles(tree);
    const className = `${strings.classify(options.name)}Controller`;

    return chain([
      externalSchematic('@nestjs/schematics', 'controller', { ...options, spec: true }),
      (tree2: Tree) => {
        for (const file of listFiles(tree2)) {
          if (!filesBefore.has(file) && file.endsWith('.controller.ts')) {
            addLoggerToClass(tree2, file, className);
          }
        }
        return tree2;
      },
    ])(tree, context);
  };
}

function listFiles(tree: Tree): Set<string> {
  const files = new Set<string>();
  tree.visit((path) => files.add(path));
  return files;
}

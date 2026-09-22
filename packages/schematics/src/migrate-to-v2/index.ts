import type { Rule, Tree } from '@angular-devkit/schematics';

import { migrateConsoleLogToLogger } from '../utils/migrate-console-log';
import type { Schema } from './schema';

/**
 * Moves every `console.log` under the project to the Nest `Logger`. Safe
 * to run more than once: once a file has no `console.log` calls left, it
 * is untouched, so a second run changes nothing.
 */
export function migrateToV2(options: Schema): Rule {
  return (tree: Tree) => {
    const root = normalizePath(options.path ?? 'src');

    tree.visit((path) => {
      if (path.endsWith('.d.ts') || !path.endsWith('.ts') || !path.startsWith(root)) {
        return;
      }
      migrateConsoleLogToLogger(tree, path);
    });

    return tree;
  };
}

function normalizePath(path: string): string {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

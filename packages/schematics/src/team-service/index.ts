import { strings } from '@angular-devkit/core';
import { apply, applyTemplates, mergeWith, move, type Rule, url } from '@angular-devkit/schematics';

import type { Schema } from './schema';

export function teamService(options: Schema): Rule {
  return mergeWith(
    apply(url('./files'), [applyTemplates({ ...strings, ...options }), move(options.path ?? 'src')]),
  );
}

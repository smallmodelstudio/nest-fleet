import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readNestProject } from './nest-project';

describe('readNestProject', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nest-project-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads nest version, collection and spec defaults off a golden-path repo', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        dependencies: { '@nestjs/core': '^12.0.1', '@team/schematics': '1.2.0' },
        devDependencies: { '@nestjs/cli': '^12.0.0' },
      }),
    );
    writeFileSync(
      join(dir, 'nest-cli.json'),
      JSON.stringify({ collection: '@team/schematics', generateOptions: { spec: true } }),
    );

    const info = readNestProject(dir);

    expect(info).toEqual({
      nestVersion: '^12.0.1',
      collection: '@team/schematics',
      localNestCli: true,
      teamSchematicsVersion: '1.2.0',
      specDefaultsEnforced: true,
    });
  });

  it('tolerates a repo with no nest-cli.json', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({}));

    const info = readNestProject(dir);

    expect(info.collection).toBeUndefined();
    expect(info.specDefaultsEnforced).toBe(false);
  });
});

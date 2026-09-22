import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runSchematic } from './schematic-runner';

// The DevKit resolves collections through node module resolution from `root`, so the fixture
// gets a symlink to the built @team/schematics package — the same package sandbox links to.
const schematicsPackageDir = resolve(__dirname, '../../../schematics');

describe('runSchematic', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'schematic-runner-'));
    mkdirSync(join(root, 'node_modules', '@team'), { recursive: true });
    symlinkSync(schematicsPackageDir, join(root, 'node_modules', '@team', 'schematics'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports what would change without writing files, in a dry run', async () => {
    const { changes } = await runSchematic({
      root,
      collectionName: '@team/schematics',
      schematicName: 'team-service',
      schematicOptions: { name: 'billing' },
      dryRun: true,
    });

    expect(changes.map((change) => change.path)).toContain('/src/billing/billing.service.ts');
    expect(existsSync(join(root, 'src/billing/billing.service.ts'))).toBe(false);
  });

  it('writes files for real when not a dry run', async () => {
    const { changes } = await runSchematic({
      root,
      collectionName: '@team/schematics',
      schematicName: 'team-service',
      schematicOptions: { name: 'billing' },
      dryRun: false,
    });

    expect(changes.map((change) => change.path)).toContain('/src/billing/billing.service.ts');
    const content = readFileSync(join(root, 'src/billing/billing.service.ts'), 'utf8');
    expect(content).toContain('export class BillingService');
  });

  it('runs the idempotent migrate-to-v2 schematic and reports no changes the second time', async () => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(
      join(root, 'src/main.ts'),
      "async function bootstrap() {\n  console.log('starting');\n}\nbootstrap();\n",
    );

    const first = await runSchematic({
      root,
      collectionName: '@team/schematics',
      schematicName: 'migrate-to-v2',
      schematicOptions: {},
      dryRun: false,
    });
    expect(first.changes.length).toBeGreaterThan(0);

    const second = await runSchematic({
      root,
      collectionName: '@team/schematics',
      schematicName: 'migrate-to-v2',
      schematicOptions: {},
      dryRun: false,
    });
    expect(second.changes).toEqual([]);
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FleetConfig } from '../fleet-config';
import { run as gitRun } from '../lib/exec';
import { runCommand } from './run';

const schematicsPackageDir = resolve(__dirname, '../../../schematics');

const createPullRequest = vi.fn(async (_dir: string, _options: { title: string; body: string }) => {
  return 'https://github.com/team/fixture/pull/1';
});
vi.mock('../lib/gh', () => ({
  createPullRequest: (dir: string, options: { title: string; body: string }) => createPullRequest(dir, options),
}));

describe('runCommand', () => {
  let sourceDir: string;
  let config: FleetConfig;

  beforeEach(async () => {
    sourceDir = mkdtempSync(join(tmpdir(), 'run-command-source-'));
    mkdirSync(join(sourceDir, 'src'));
    writeFileSync(
      join(sourceDir, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        version: '0.0.1',
        private: true,
        scripts: { test: 'node -e "process.exit(0)"' },
        dependencies: { '@team/schematics': `file:${schematicsPackageDir}` },
      }),
    );
    writeFileSync(join(sourceDir, 'nest-cli.json'), JSON.stringify({ collection: '@team/schematics' }));
    writeFileSync(join(sourceDir, 'src/app.module.ts'), 'export class AppModule {}\n');

    await gitRun('git', ['init', '--quiet', '-b', 'main'], { cwd: sourceDir });
    await gitRun('git', ['add', '-A'], { cwd: sourceDir });
    await gitRun(
      'git',
      ['-c', 'user.email=fixture@example.com', '-c', 'user.name=fixture', 'commit', '--quiet', '-m', 'init'],
      { cwd: sourceDir },
    );

    config = {
      standardsVersion: '0.0.0',
      repos: [{ name: 'fixture', gitUrl: sourceDir }],
    };

    createPullRequest.mockClear();
  }, 30_000);

  afterEach(() => {
    rmSync(sourceDir, { recursive: true, force: true });
  });

  it('dry-runs a schematic without touching the source repo', async () => {
    const [result] = await runCommand(config, {
      schematic: 'team-service',
      schematicOptions: { name: 'billing' },
      apply: false,
    });

    expect(result?.status).toBe('dry-run');
    expect(result?.filesChanged).toContain('create /src/billing/billing.service.ts');
    expect(createPullRequest).not.toHaveBeenCalled();

    const { stdout } = await gitRun('git', ['branch', '--list', 'fleet/*'], { cwd: sourceDir });
    expect(stdout.trim()).toBe('');
  }, 30_000);

  it('applies a schematic, runs tests, and opens a PR when told to apply', async () => {
    const [result] = await runCommand(config, {
      schematic: 'team-service',
      schematicOptions: { name: 'billing' },
      apply: true,
    });

    expect(result?.status).toBe('pr-opened');
    expect(result?.prUrl).toBe('https://github.com/team/fixture/pull/1');
    expect(createPullRequest).toHaveBeenCalledOnce();

    const { stdout } = await gitRun('git', ['branch', '--list', 'fleet/team-service-*'], { cwd: sourceDir });
    expect(stdout.trim()).not.toBe('');
  }, 30_000);

  it('reports no-changes and never opens a PR when the schematic has nothing to do', async () => {
    const [result] = await runCommand(config, {
      schematic: 'migrate-to-v2',
      schematicOptions: {},
      apply: true,
    });

    expect(result?.status).toBe('no-changes');
    expect(createPullRequest).not.toHaveBeenCalled();
  }, 30_000);

  it('refuses --apply on a repo with only a local path, instead of failing later at push', async () => {
    const localOnlyConfig: FleetConfig = {
      standardsVersion: '0.0.0',
      repos: [{ name: 'fixture', path: sourceDir, localPath: sourceDir }],
    };

    const [result] = await runCommand(localOnlyConfig, {
      schematic: 'team-service',
      schematicOptions: { name: 'billing' },
      apply: true,
    });

    expect(result?.status).toBe('failed');
    expect(result?.detail).toContain('gitUrl');
    expect(createPullRequest).not.toHaveBeenCalled();
  }, 30_000);

  it('restricts to the named repos', async () => {
    const results = await runCommand(config, {
      schematic: 'team-service',
      schematicOptions: { name: 'billing' },
      apply: false,
      repoNames: ['does-not-exist'],
    }).catch((error: Error) => error);

    expect(results).toBeInstanceOf(Error);
    expect((results as Error).message).toContain('does-not-exist');
  });
});

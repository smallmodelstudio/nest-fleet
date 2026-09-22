import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkoutNewBranch, clone, commitAll, hasUncommittedChanges, push } from './git';
import { run } from './exec';

describe('git', () => {
  let sourceDir: string;
  let cloneDir: string;

  beforeEach(async () => {
    sourceDir = mkdtempSync(join(tmpdir(), 'git-source-'));
    await run('git', ['init', '--quiet', '-b', 'main'], { cwd: sourceDir });
    writeFileSync(join(sourceDir, 'README.md'), '# fixture\n');
    await run('git', ['add', '-A'], { cwd: sourceDir });
    await run('git', ['-c', 'user.email=fixture@example.com', '-c', 'user.name=fixture', 'commit', '--quiet', '-m', 'init'], {
      cwd: sourceDir,
    });

    cloneDir = join(mkdtempSync(join(tmpdir(), 'git-clone-')), 'repo');
  });

  afterEach(() => {
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(cloneDir, { recursive: true, force: true });
  });

  it('clones a local repo', async () => {
    await clone(sourceDir, cloneDir);

    expect(existsSync(join(cloneDir, 'README.md'))).toBe(true);
  });

  it('detects uncommitted changes, commits them and reports clean afterwards', async () => {
    await clone(sourceDir, cloneDir);
    expect(await hasUncommittedChanges(cloneDir)).toBe(false);

    writeFileSync(join(cloneDir, 'new-file.txt'), 'content\n');
    expect(await hasUncommittedChanges(cloneDir)).toBe(true);

    await commitAll(cloneDir, 'add new-file.txt');
    expect(await hasUncommittedChanges(cloneDir)).toBe(false);
  });

  it('branches and pushes back to the source repo', async () => {
    await clone(sourceDir, cloneDir);
    await checkoutNewBranch(cloneDir, 'fleet/test-branch');
    writeFileSync(join(cloneDir, 'new-file.txt'), 'content\n');
    await commitAll(cloneDir, 'add new-file.txt');

    await push(cloneDir, 'fleet/test-branch');

    const { stdout } = await run('git', ['branch', '--list', 'fleet/test-branch'], { cwd: sourceDir });
    expect(stdout).toContain('fleet/test-branch');
  });
});

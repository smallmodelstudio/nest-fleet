import { run } from './exec';

/** Clones `source` (a path or a git URL) into `destination`, which must not exist yet. */
export async function clone(source: string, destination: string): Promise<void> {
  await run('git', ['clone', '--quiet', '--depth', '1', source, destination]);
}

export async function checkoutNewBranch(dir: string, branch: string): Promise<void> {
  await run('git', ['checkout', '-b', branch], { cwd: dir });
}

export async function hasUncommittedChanges(dir: string): Promise<boolean> {
  const { stdout } = await run('git', ['status', '--porcelain'], { cwd: dir });
  return stdout.trim().length > 0;
}

export async function commitAll(dir: string, message: string): Promise<void> {
  await run('git', ['add', '-A'], { cwd: dir });
  await run('git', ['commit', '--quiet', '-m', message], { cwd: dir });
}

export async function push(dir: string, branch: string): Promise<void> {
  await run('git', ['push', '--quiet', '-u', 'origin', branch], { cwd: dir });
}

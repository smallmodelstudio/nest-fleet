import { run } from './exec';

export interface CiRun {
  status: string;
  conclusion: string | null;
  updatedAt: string;
}

let ghAvailable: boolean | undefined;

/** Cached check for whether `gh` is installed and on PATH. */
export async function isGhAvailable(): Promise<boolean> {
  if (ghAvailable === undefined) {
    ghAvailable = await run('gh', ['--version'])
      .then(() => true)
      .catch(() => false);
  }
  return ghAvailable;
}

/** Parses "owner/name" out of an https or ssh git URL, or `<owner override>/name`. */
export function repoSlug(gitUrl: string, ownerOverride?: string): string {
  const withoutGitSuffix = gitUrl.replace(/\.git$/, '');
  const match = /[/:]([^/]+)\/([^/]+)$/.exec(withoutGitSuffix);
  if (!match) {
    throw new Error(`Cannot parse an owner/name slug out of git URL "${gitUrl}"`);
  }
  const [, owner, name] = match;
  return `${ownerOverride ?? owner}/${name}`;
}

export async function lastCiRun(slug: string): Promise<CiRun | undefined> {
  const { stdout } = await run('gh', [
    'run',
    'list',
    '--repo',
    slug,
    '--limit',
    '1',
    '--json',
    'status,conclusion,updatedAt',
  ]);
  const runs = JSON.parse(stdout) as CiRun[];
  return runs[0];
}

export async function createPullRequest(
  dir: string,
  options: { title: string; body: string; base?: string },
): Promise<string> {
  const args = ['pr', 'create', '--title', options.title, '--body', options.body];
  if (options.base) {
    args.push('--base', options.base);
  }
  const { stdout } = await run('gh', args, { cwd: dir });
  return stdout.trim();
}

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ExecError, run } from './exec';

type PackageManager = 'pnpm' | 'npm';

function detect(dir: string): PackageManager {
  return existsSync(join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm';
}

export async function install(dir: string): Promise<void> {
  const packageManager = detect(dir);
  const hasLockfile =
    packageManager === 'pnpm' ? existsSync(join(dir, 'pnpm-lock.yaml')) : existsSync(join(dir, 'package-lock.json'));
  const args =
    packageManager === 'pnpm'
      ? ['install', ...(hasLockfile ? ['--frozen-lockfile'] : [])]
      : [hasLockfile ? 'ci' : 'install', '--no-audit', '--no-fund'];
  await run(packageManager, args, { cwd: dir });
}

export interface TestOutcome {
  passed: boolean;
  detail: string;
}

export async function test(dir: string): Promise<TestOutcome> {
  const packageJson = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  if (!packageJson.scripts?.['test']) {
    return { passed: true, detail: 'no "test" script — skipped' };
  }

  const packageManager = detect(dir);
  try {
    await run(packageManager, ['run', 'test'], { cwd: dir });
    return { passed: true, detail: 'tests passed' };
  } catch (error) {
    const detail = error instanceof ExecError ? error.message : String(error);
    return { passed: false, detail };
  }
}

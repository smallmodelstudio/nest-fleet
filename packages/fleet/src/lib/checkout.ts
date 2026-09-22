import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ResolvedFleetRepo } from '../fleet-config';
import { clone } from './git';

export interface Checkout {
  dir: string;
  cleanup: () => Promise<void>;
}

/**
 * Resolves a repo to a directory to read from. A local `path` is used directly (and never
 * cleaned up); a `gitUrl`-only repo is shallow-cloned to a temp dir that `cleanup` removes.
 */
export async function checkoutForReading(repo: ResolvedFleetRepo): Promise<Checkout> {
  if (repo.localPath) {
    return { dir: repo.localPath, cleanup: async () => {} };
  }

  if (!repo.gitUrl) {
    throw new Error(`Repo "${repo.name}" has neither a "path" nor a "gitUrl".`);
  }

  const dir = await mkdtemp(join(tmpdir(), 'fleet-'));
  await clone(repo.gitUrl, dir);
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

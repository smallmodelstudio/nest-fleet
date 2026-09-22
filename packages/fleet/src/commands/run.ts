import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FleetConfig, ResolvedFleetRepo } from '../fleet-config';
import { createPullRequest } from '../lib/gh';
import { checkoutNewBranch, clone, commitAll, push } from '../lib/git';
import { install, test } from '../lib/package-manager';
import { runSchematic } from '../lib/schematic-runner';

export interface RunOptions {
  schematic: string;
  schematicOptions: Record<string, unknown>;
  /** Repo names to restrict to. Every repo in the config when omitted. */
  repoNames?: string[];
  /** When false (the default), everything up to "what would change" runs, and nothing is pushed. */
  apply: boolean;
  collectionName?: string;
}

export type RunStatus = 'dry-run' | 'no-changes' | 'tests-failed' | 'pr-opened' | 'failed';

export interface RunResult {
  repo: string;
  status: RunStatus;
  filesChanged?: string[];
  detail?: string;
  prUrl?: string;
}

export async function runCommand(config: FleetConfig, options: RunOptions): Promise<RunResult[]> {
  const targets = selectRepos(config, options.repoNames);
  const results: RunResult[] = [];
  for (const repo of targets) {
    results.push(await runOnRepo(repo, options));
  }
  return results;
}

function selectRepos(config: FleetConfig, repoNames: string[] | undefined): ResolvedFleetRepo[] {
  if (!repoNames || repoNames.length === 0) {
    return config.repos;
  }
  const byName = new Map(config.repos.map((repo) => [repo.name, repo]));
  return repoNames.map((name) => {
    const repo = byName.get(name);
    if (!repo) {
      throw new Error(`No repo named "${name}" in the fleet config.`);
    }
    return repo;
  });
}

async function runOnRepo(repo: ResolvedFleetRepo, options: RunOptions): Promise<RunResult> {
  const source = repo.gitUrl ?? repo.localPath;
  if (!source) {
    return { repo: repo.name, status: 'failed', detail: 'no "path" or "gitUrl" to clone from' };
  }
  // A repo without a gitUrl has nowhere for --apply to push a branch to: catch that here rather
  // than failing later at `git push`, after the schematic has already run and tests have passed.
  if (options.apply && !repo.gitUrl) {
    return { repo: repo.name, status: 'failed', detail: '--apply needs a "gitUrl" to push a branch to' };
  }

  const workDir = await mkdtemp(join(tmpdir(), 'fleet-run-'));
  try {
    await clone(source, workDir);

    const branch = `fleet/${options.schematic}-${Date.now()}`;
    if (options.apply) {
      await checkoutNewBranch(workDir, branch);
    }

    await install(workDir);

    const { changes } = await runSchematic({
      root: workDir,
      collectionName: options.collectionName ?? '@team/schematics',
      schematicName: options.schematic,
      schematicOptions: options.schematicOptions,
      dryRun: !options.apply,
    });
    const filesChanged = changes.map((change) => `${change.kind} ${change.path}`);

    if (!options.apply) {
      return { repo: repo.name, status: 'dry-run', filesChanged };
    }

    // Checked against the schematic's own report, not `git status`: installing dependencies can
    // itself dirty the tree (a freshly generated package-lock.json) even when nothing else did.
    if (changes.length === 0) {
      return { repo: repo.name, status: 'no-changes' };
    }

    const testOutcome = await test(workDir);
    if (!testOutcome.passed) {
      return { repo: repo.name, status: 'tests-failed', detail: testOutcome.detail, filesChanged };
    }

    await commitAll(workDir, `fleet: run ${options.schematic}`);
    await push(workDir, branch);
    const prUrl = await createPullRequest(workDir, {
      title: `fleet: run ${options.schematic}`,
      body: `Opened by \`fleet run ${options.schematic}\`.`,
    });

    return { repo: repo.name, status: 'pr-opened', filesChanged, prUrl };
  } catch (error) {
    return { repo: repo.name, status: 'failed', detail: error instanceof Error ? error.message : String(error) };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export function formatRunResults(results: RunResult[], apply: boolean): string {
  const lines = results.map((result) => {
    const header = `${result.repo}: ${result.status}`;
    const detail = result.detail ? `\n  ${result.detail}` : '';
    const files = result.filesChanged?.length ? `\n  ${result.filesChanged.join('\n  ')}` : '';
    const pr = result.prUrl ? `\n  ${result.prUrl}` : '';
    return `${header}${detail}${files}${pr}`;
  });

  if (!apply) {
    lines.push('(dry run — pass --apply to open real PRs)');
  }

  return lines.join('\n');
}

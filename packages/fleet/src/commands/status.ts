import type { FleetConfig, ResolvedFleetRepo } from '../fleet-config';
import { checkoutForReading } from '../lib/checkout';
import { isGhAvailable, lastCiRun, repoSlug } from '../lib/gh';
import { readNestProject } from '../lib/nest-project';
import { renderTable } from '../lib/table';

export interface StatusRow {
  repo: string;
  nestVersion: string;
  collection: string;
  ci: string;
}

export async function collectStatus(config: FleetConfig): Promise<StatusRow[]> {
  return Promise.all(config.repos.map(statusForRepo));
}

async function statusForRepo(repo: ResolvedFleetRepo): Promise<StatusRow> {
  const checkout = await checkoutForReading(repo);
  try {
    const info = readNestProject(checkout.dir);
    return {
      repo: repo.name,
      nestVersion: info.nestVersion ?? 'unknown',
      collection: info.collection ?? '@nestjs/schematics (default)',
      ci: await ciStatus(repo),
    };
  } finally {
    await checkout.cleanup();
  }
}

async function ciStatus(repo: ResolvedFleetRepo): Promise<string> {
  if (!repo.gitUrl) {
    return 'local (no remote)';
  }
  if (!(await isGhAvailable())) {
    return 'gh not available';
  }
  try {
    const run = await lastCiRun(repoSlug(repo.gitUrl, repo.owner));
    if (!run) {
      return 'no runs';
    }
    return `${run.status}/${run.conclusion ?? 'pending'}`;
  } catch (error) {
    return `error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function formatStatus(rows: StatusRow[]): string {
  return renderTable(
    ['REPO', 'NEST', 'COLLECTION', 'LAST CI'],
    rows.map((row) => [row.repo, row.nestVersion, row.collection, row.ci]),
  ).join('\n');
}

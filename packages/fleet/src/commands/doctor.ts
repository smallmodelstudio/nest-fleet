import type { FleetConfig } from '../fleet-config';
import { checkoutForReading } from '../lib/checkout';
import { diagnose, type DoctorReport } from '../lib/doctor';
import { readNestProject } from '../lib/nest-project';
import { renderTable } from '../lib/table';

export async function collectDoctorReports(config: FleetConfig): Promise<DoctorReport[]> {
  return Promise.all(
    config.repos.map(async (repo) => {
      const checkout = await checkoutForReading(repo);
      try {
        const info = readNestProject(checkout.dir);
        return diagnose(repo.name, info, config.standardsVersion);
      } finally {
        await checkout.cleanup();
      }
    }),
  );
}

export function formatDoctorReports(reports: DoctorReport[], { verbose }: { verbose: boolean } = { verbose: false }): string {
  const summary = renderTable(
    ['REPO', 'STATUS', 'FAILING'],
    reports.map((report) => [
      report.repo,
      report.ok ? 'OK' : 'DRIFT',
      report.checks
        .filter((check) => !check.ok)
        .map((check) => check.name)
        .join(', ') || '-',
    ]),
  ).join('\n');

  if (!verbose) {
    return summary;
  }

  const details = reports
    .map((report) =>
      [
        `${report.repo}:`,
        ...report.checks.map((check) => `  [${check.ok ? 'ok' : check.severity}] ${check.name} — ${check.detail}`),
      ].join('\n'),
    )
    .join('\n\n');

  return `${summary}\n\n${details}`;
}

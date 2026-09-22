import type { NestProjectInfo } from './nest-project';

export interface DoctorCheck {
  name: string;
  severity: 'error' | 'warn';
  ok: boolean;
  detail: string;
}

export interface DoctorReport {
  repo: string;
  checks: DoctorCheck[];
  ok: boolean;
}

/** Diagnoses a repo's drift from the team standard. `currentVersion` is the fleet's `standardsVersion`. */
export function diagnose(repoName: string, info: NestProjectInfo, currentVersion: string): DoctorReport {
  const checks: DoctorCheck[] = [
    {
      name: 'local nest CLI',
      severity: 'error',
      ok: info.localNestCli,
      detail: info.localNestCli
        ? '@nestjs/cli is a devDependency'
        : '@nestjs/cli is missing from devDependencies — a global `nest` cannot resolve @team/schematics',
    },
    {
      name: 'collection',
      severity: 'error',
      ok: info.collection === '@team/schematics',
      detail: info.collection
        ? `nest-cli.json "collection" is "${info.collection}"`
        : 'nest-cli.json has no "collection" set',
    },
    {
      name: '@team/schematics version',
      severity: 'error',
      ok: isOnVersion(info.teamSchematicsVersion, currentVersion),
      detail: describeVersion(info.teamSchematicsVersion, currentVersion),
    },
    {
      name: 'spec defaults',
      severity: 'warn',
      ok: info.specDefaultsEnforced,
      detail: info.specDefaultsEnforced
        ? 'nest-cli.json "generateOptions.spec" is true'
        : 'nest-cli.json "generateOptions.spec" is not set to true',
    },
  ];

  return {
    repo: repoName,
    checks,
    ok: checks.filter((check) => check.severity === 'error').every((check) => check.ok),
  };
}

function isOnVersion(declared: string | undefined, current: string): boolean {
  if (!declared) {
    return false;
  }
  if (declared.startsWith('link:') || declared.startsWith('workspace:')) {
    return true;
  }
  return declared.replace(/^[\^~]/, '') === current;
}

function describeVersion(declared: string | undefined, current: string): string {
  if (!declared) {
    return '@team/schematics is not a dependency';
  }
  if (declared.startsWith('link:') || declared.startsWith('workspace:')) {
    return `linked locally (${declared})`;
  }
  return declared.replace(/^[\^~]/, '') === current
    ? `on ${declared}, matches fleet standard`
    : `on ${declared}, fleet standard is ${current}`;
}

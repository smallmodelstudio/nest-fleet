import { describe, expect, it } from 'vitest';

import { diagnose } from './doctor';
import type { NestProjectInfo } from './nest-project';

const compliant: NestProjectInfo = {
  nestVersion: '^12.0.1',
  collection: '@smallmodelstudio/schematics',
  localNestCli: true,
  teamSchematicsVersion: '1.2.0',
  specDefaultsEnforced: true,
};

describe('diagnose', () => {
  it('reports ok when every check passes', () => {
    const report = diagnose('billing', compliant, '1.2.0');

    expect(report.ok).toBe(true);
    expect(report.checks.every((check) => check.ok)).toBe(true);
  });

  it('flags a repo without @smallmodelstudio/schematics as the collection', () => {
    const report = diagnose('billing', { ...compliant, collection: '@nestjs/schematics' }, '1.2.0');

    expect(report.ok).toBe(false);
    const check = report.checks.find((c) => c.name === 'collection');
    expect(check?.ok).toBe(false);
  });

  it('flags a repo on an old @smallmodelstudio/schematics version', () => {
    const report = diagnose('billing', { ...compliant, teamSchematicsVersion: '1.0.0' }, '1.2.0');

    expect(report.ok).toBe(false);
    const check = report.checks.find((c) => c.name === '@smallmodelstudio/schematics version');
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('1.2.0');
  });

  it('treats a caret range against the current version as up to date', () => {
    const report = diagnose('billing', { ...compliant, teamSchematicsVersion: '^1.2.0' }, '1.2.0');

    expect(report.checks.find((c) => c.name === '@smallmodelstudio/schematics version')?.ok).toBe(true);
  });

  it('treats a workspace/link dependency as always current', () => {
    const report = diagnose('sandbox', { ...compliant, teamSchematicsVersion: 'link:../schematics' }, '1.2.0');

    expect(report.checks.find((c) => c.name === '@smallmodelstudio/schematics version')?.ok).toBe(true);
  });

  it('treats a file: dependency as always current, as the golden-path app generates', () => {
    const report = diagnose(
      'demo',
      { ...compliant, teamSchematicsVersion: 'file:../../packages/schematics' },
      '1.2.0',
    );

    expect(report.checks.find((c) => c.name === '@smallmodelstudio/schematics version')?.ok).toBe(true);
  });

  it('flags a missing local CLI as an error, not just a warning', () => {
    const report = diagnose('billing', { ...compliant, localNestCli: false }, '1.2.0');

    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'local nest CLI')?.severity).toBe('error');
  });

  it('does not fail the repo over spec defaults alone, since that is only a warning', () => {
    const report = diagnose('billing', { ...compliant, specDefaultsEnforced: false }, '1.2.0');

    expect(report.ok).toBe(true);
    expect(report.checks.find((c) => c.name === 'spec defaults')?.ok).toBe(false);
  });
});

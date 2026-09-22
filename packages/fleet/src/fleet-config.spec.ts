import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FleetConfigError, loadFleetConfig } from './fleet-config';

describe('loadFleetConfig', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fleet-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeConfig(content: unknown): string {
    const path = join(dir, 'fleet.json');
    writeFileSync(path, JSON.stringify(content));
    return path;
  }

  it('loads a valid config and resolves local paths against the config file', () => {
    const path = writeConfig({
      standardsVersion: '1.2.0',
      repos: [{ name: 'sandbox', path: 'sandbox' }],
    });

    const config = loadFleetConfig(path);

    expect(config.standardsVersion).toBe('1.2.0');
    expect(config.repos).toEqual([
      { name: 'sandbox', path: 'sandbox', gitUrl: undefined, owner: undefined, localPath: join(dir, 'sandbox') },
    ]);
  });

  it('accepts a repo with only a gitUrl', () => {
    const path = writeConfig({
      standardsVersion: '1.2.0',
      repos: [{ name: 'billing', gitUrl: 'git@github.com:team/billing.git' }],
    });

    const config = loadFleetConfig(path);

    expect(config.repos[0]?.localPath).toBeUndefined();
    expect(config.repos[0]?.gitUrl).toBe('git@github.com:team/billing.git');
  });

  it('rejects a missing file', () => {
    expect(() => loadFleetConfig(join(dir, 'missing.json'))).toThrow(FleetConfigError);
  });

  it('rejects invalid JSON', () => {
    const path = join(dir, 'fleet.json');
    writeFileSync(path, '{not json');

    expect(() => loadFleetConfig(path)).toThrow(FleetConfigError);
  });

  it('rejects a config without standardsVersion', () => {
    const path = writeConfig({ repos: [] });

    expect(() => loadFleetConfig(path)).toThrow(/standardsVersion/);
  });

  it('rejects a repo with neither a path nor a gitUrl', () => {
    const path = writeConfig({ standardsVersion: '1.0.0', repos: [{ name: 'orphan' }] });

    expect(() => loadFleetConfig(path)).toThrow(/path.*gitUrl|gitUrl.*path/);
  });

  it('rejects a repo without a name', () => {
    const path = writeConfig({ standardsVersion: '1.0.0', repos: [{ path: 'x' }] });

    expect(() => loadFleetConfig(path)).toThrow(/name/);
  });
});

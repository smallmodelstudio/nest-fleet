import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface FleetRepoConfig {
  name: string;
  /** Local checkout, relative to fleet.json. Used directly by status/doctor; cloned from by `run`. */
  path?: string | undefined;
  /** Git URL. Required for `fleet run` (which needs somewhere to push a branch) and for CI status. */
  gitUrl?: string | undefined;
  /** GitHub owner/org, if it differs from the one in `gitUrl`. */
  owner?: string | undefined;
}

export interface ResolvedFleetRepo extends FleetRepoConfig {
  /** `path`, resolved to an absolute path. */
  localPath?: string | undefined;
}

export interface FleetConfig {
  /** The @team/schematics version every repo is expected to be on. */
  standardsVersion: string;
  repos: ResolvedFleetRepo[];
}

export class FleetConfigError extends Error {}

export function loadFleetConfig(configPath: string): FleetConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (error) {
    throw new FleetConfigError(
      `Cannot read fleet config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new FleetConfigError(
      `${configPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return validate(parsed, configPath);
}

function validate(value: unknown, configPath: string): FleetConfig {
  if (typeof value !== 'object' || value === null) {
    throw new FleetConfigError(`${configPath}: expected a JSON object.`);
  }
  const config = value as Record<string, unknown>;

  if (typeof config['standardsVersion'] !== 'string' || config['standardsVersion'].length === 0) {
    throw new FleetConfigError(`${configPath}: "standardsVersion" must be a non-empty string.`);
  }

  if (!Array.isArray(config['repos'])) {
    throw new FleetConfigError(`${configPath}: "repos" must be an array.`);
  }

  const configDir = dirname(configPath);
  const repos = config['repos'].map((entry, index) => validateRepo(entry, index, configDir, configPath));

  return { standardsVersion: config['standardsVersion'], repos };
}

function validateRepo(value: unknown, index: number, configDir: string, configPath: string): ResolvedFleetRepo {
  if (typeof value !== 'object' || value === null) {
    throw new FleetConfigError(`${configPath}: repos[${index}] must be an object.`);
  }
  const repo = value as Record<string, unknown>;

  if (typeof repo['name'] !== 'string' || repo['name'].length === 0) {
    throw new FleetConfigError(`${configPath}: repos[${index}] is missing a "name".`);
  }

  const path = optionalString(repo['path'], `repos[${index}].path`, configPath);
  const gitUrl = optionalString(repo['gitUrl'], `repos[${index}].gitUrl`, configPath);
  const owner = optionalString(repo['owner'], `repos[${index}].owner`, configPath);

  if (!path && !gitUrl) {
    throw new FleetConfigError(`${configPath}: repos[${index}] ("${repo['name']}") needs a "path" or a "gitUrl".`);
  }

  return {
    name: repo['name'],
    path,
    gitUrl,
    owner,
    localPath: path ? resolve(configDir, path) : undefined,
  };
}

function optionalString(value: unknown, field: string, configPath: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new FleetConfigError(`${configPath}: "${field}" must be a non-empty string.`);
  }
  return value;
}

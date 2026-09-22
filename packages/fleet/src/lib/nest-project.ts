import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface NestCliJson {
  collection?: string;
  generateOptions?: { spec?: boolean };
}

export interface NestProjectInfo {
  nestVersion?: string | undefined;
  collection?: string | undefined;
  localNestCli: boolean;
  teamSchematicsVersion?: string | undefined;
  specDefaultsEnforced: boolean;
}

/** Reads what a repo checkout says about itself, from package.json and nest-cli.json. */
export function readNestProject(dir: string): NestProjectInfo {
  const packageJson = readJson<PackageJson>(join(dir, 'package.json'));
  const nestCliJson = readJson<NestCliJson>(join(dir, 'nest-cli.json'));

  return {
    nestVersion: packageJson?.dependencies?.['@nestjs/core'],
    collection: nestCliJson?.collection,
    localNestCli: Boolean(packageJson?.devDependencies?.['@nestjs/cli']),
    teamSchematicsVersion: packageJson?.dependencies?.['@team/schematics'],
    specDefaultsEnforced: nestCliJson?.generateOptions?.spec === true,
  };
}

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

import { Command, Option } from 'commander';

import { collectDoctorReports, formatDoctorReports } from './commands/doctor';
import { formatRunResults, runCommand } from './commands/run';
import { collectStatus, formatStatus } from './commands/status';
import { loadFleetConfig } from './fleet-config';

export interface CliIO {
  log: (line: string) => void;
  error: (line: string) => void;
}

function configOption(): Option {
  return new Option('-c, --config <path>', 'path to fleet.json').default('fleet.json');
}

export function buildCli(io: CliIO): Command {
  const program = new Command();

  program.name('fleet').description('Manage every repo on the @smallmodelstudio/schematics standard.');

  program
    .command('status')
    .description('Nest version, collection and last CI result per repo.')
    .addOption(configOption())
    .action(async (options: { config: string }) => {
      const config = loadFleetConfig(options.config);
      io.log(formatStatus(await collectStatus(config)));
    });

  program
    .command('doctor')
    .description('Check each repo against the team standard.')
    .addOption(configOption())
    .option('-v, --verbose', 'show every check, not just the failing ones', false)
    .action(async (options: { config: string; verbose: boolean }) => {
      const config = loadFleetConfig(options.config);
      const reports = await collectDoctorReports(config);
      io.log(formatDoctorReports(reports, { verbose: options.verbose }));
      if (reports.some((report) => !report.ok)) {
        process.exitCode = 1;
      }
    });

  program
    .command('run')
    .description('Run a schematic across the fleet. Dry run unless --apply is given.')
    .argument('<schematic>', 'schematic name, e.g. migrate-to-v2')
    .addOption(configOption())
    .option('-r, --repo <name>', 'restrict to this repo (repeatable)', collectRepeatable, [] as string[])
    .option('-o, --option <key=value>', 'schematic option (repeatable)', collectRepeatable, [] as string[])
    .option('--collection <name>', 'collection to run the schematic from', '@smallmodelstudio/schematics')
    .addOption(new Option('--apply', 'push a branch and open a PR instead of a dry run').default(false))
    .action(
      async (
        schematic: string,
        options: { config: string; repo: string[]; option: string[]; collection: string; apply: boolean },
      ) => {
        const config = loadFleetConfig(options.config);
        const results = await runCommand(config, {
          schematic,
          schematicOptions: parseOptionFlags(options.option),
          repoNames: options.repo,
          apply: options.apply,
          collectionName: options.collection,
        });
        io.log(formatRunResults(results, options.apply));
        if (results.some((result) => result.status === 'failed' || result.status === 'tests-failed')) {
          process.exitCode = 1;
        }
      },
    );

  program.exitOverride();
  program.configureOutput({
    writeOut: io.log,
    writeErr: io.error,
  });

  return program;
}

function collectRepeatable(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseOptionFlags(flags: string[]): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  for (const flag of flags) {
    const separatorIndex = flag.indexOf('=');
    if (separatorIndex === -1) {
      throw new Error(`--option "${flag}" must be in the form key=value`);
    }
    options[flag.slice(0, separatorIndex)] = flag.slice(separatorIndex + 1);
  }
  return options;
}

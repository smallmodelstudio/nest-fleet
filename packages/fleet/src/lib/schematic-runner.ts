import { logging } from '@angular-devkit/core';
import { NodeWorkflow } from '@angular-devkit/schematics/tools';
import { firstValueFrom } from 'rxjs';

export interface RunSchematicOptions {
  /** Directory to run the schematic against; must have `collectionName` resolvable from its node_modules. */
  root: string;
  collectionName: string;
  schematicName: string;
  schematicOptions: Record<string, unknown>;
  dryRun: boolean;
  logger?: logging.Logger;
}

export interface FileChange {
  kind: 'create' | 'update' | 'delete' | 'rename';
  path: string;
}

export interface SchematicRunResult {
  changes: FileChange[];
}

/** Runs one schematic from an installed collection against a checkout, via the DevKit's NodeWorkflow. */
export async function runSchematic(options: RunSchematicOptions): Promise<SchematicRunResult> {
  const logger = options.logger ?? new logging.NullLogger();
  const workflow = new NodeWorkflow(options.root, {
    dryRun: options.dryRun,
    force: false,
    packageManager: 'npm',
  });

  const changes: FileChange[] = [];
  workflow.reporter.subscribe((event) => {
    if (event.kind !== 'error') {
      changes.push({ kind: event.kind, path: event.path });
    }
  });

  await firstValueFrom(
    workflow.execute({
      collection: options.collectionName,
      schematic: options.schematicName,
      options: options.schematicOptions,
      logger,
    }),
    { defaultValue: undefined },
  );

  return { changes };
}

#!/usr/bin/env node
import { CommanderError } from 'commander';

import { buildCli } from './cli';

const program = buildCli({
  log: (line) => console.log(line),
  error: (line) => console.error(line),
});

program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode;
    return;
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

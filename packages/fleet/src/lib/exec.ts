import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export class ExecError extends Error {
  constructor(
    public readonly command: string,
    public readonly args: string[],
    sourceError: unknown,
  ) {
    const detail = sourceError instanceof Error ? sourceError.message : String(sourceError);
    super(`${command} ${args.join(' ')} failed: ${detail}`, { cause: sourceError });
  }
}

/** Runs a command and rejects with an {@link ExecError} on a non-zero exit. */
export async function run(command: string, args: string[], options: { cwd?: string } = {}): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      encoding: 'utf8',
    });
    return { stdout, stderr };
  } catch (error) {
    throw new ExecError(command, args, error);
  }
}

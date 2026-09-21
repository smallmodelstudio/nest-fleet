import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

cpSync(`${packageRoot}/src`, `${packageRoot}/dist`, {
  recursive: true,
  filter: (source) => !source.endsWith('.ts'),
});

import { resolve } from 'node:path';

import { SchematicTestRunner } from '@angular-devkit/schematics/testing';
import { describe, expect, it } from 'vitest';

// The DevKit loads factories with `require`, so it needs the compiled collection.
const collectionPath = resolve(__dirname, '../../dist/collection.json');

describe('controller', () => {
  const runner = new SchematicTestRunner('@team/schematics', collectionPath);

  it('still generates a spec when --no-spec is passed (team rule beats the flag)', async () => {
    const tree = await runner.runSchematic('controller', { name: 'users', spec: false });

    expect(tree.files).toContain('/users/users.controller.spec.ts');
  });

  it('adds a Logger to the generated controller', async () => {
    const tree = await runner.runSchematic('controller', { name: 'users' });

    const content = tree.readContent('/users/users.controller.ts');
    expect(content).toContain("import { Controller, Logger } from '@nestjs/common';");
    expect(content).toContain('private readonly logger = new Logger(UsersController.name);');
  });

  it('is available through its alias', async () => {
    const tree = await runner.runSchematic('co', { name: 'users' });

    expect(tree.files).toContain('/users/users.controller.ts');
  });
});

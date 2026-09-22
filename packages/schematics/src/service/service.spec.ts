import { resolve } from 'node:path';

import { SchematicTestRunner } from '@angular-devkit/schematics/testing';
import { describe, expect, it } from 'vitest';

// The DevKit loads factories with `require`, so it needs the compiled collection.
const collectionPath = resolve(__dirname, '../../dist/collection.json');

describe('service', () => {
  const runner = new SchematicTestRunner('@team/schematics', collectionPath);

  it('still generates a spec when --no-spec is passed (team rule beats the flag)', async () => {
    const tree = await runner.runSchematic('service', { name: 'users', spec: false });

    expect(tree.files).toContain('/users/users.service.spec.ts');
  });

  it('adds a Logger to the generated service', async () => {
    const tree = await runner.runSchematic('service', { name: 'users' });

    const content = tree.readContent('/users/users.service.ts');
    expect(content).toContain("import { Injectable, Logger } from '@nestjs/common';");
    expect(content).toContain('private readonly logger = new Logger(UsersService.name);');
  });

  it('is available through its alias', async () => {
    const tree = await runner.runSchematic('s', { name: 'users' });

    expect(tree.files).toContain('/users/users.service.ts');
  });
});

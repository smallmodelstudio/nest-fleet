import { resolve } from 'node:path';

import { SchematicTestRunner } from '@angular-devkit/schematics/testing';
import { describe, expect, it } from 'vitest';

// The DevKit loads factories with `require`, so it needs the compiled collection.
const collectionPath = resolve(__dirname, '../../dist/collection.json');

describe('team-service', () => {
  const runner = new SchematicTestRunner('@smallmodelstudio/schematics', collectionPath);

  it('creates the service in a dasherized folder under src by default', async () => {
    const tree = await runner.runSchematic('team-service', { name: 'billing' });

    expect(tree.files).toEqual(['/src/billing/billing.service.ts']);
  });

  it('puts a Logger on the class', async () => {
    const tree = await runner.runSchematic('team-service', { name: 'billing' });

    const content = tree.readContent('/src/billing/billing.service.ts');
    expect(content).toContain("import { Injectable, Logger } from '@nestjs/common';");
    expect(content).toContain('export class BillingService {');
    expect(content).toContain('private readonly logger = new Logger(BillingService.name);');
  });

  it('dasherizes and classifies multi-word names', async () => {
    const tree = await runner.runSchematic('team-service', { name: 'userProfile' });

    expect(tree.files).toEqual(['/src/user-profile/user-profile.service.ts']);
    expect(tree.readContent('/src/user-profile/user-profile.service.ts')).toContain(
      'export class UserProfileService {',
    );
  });

  it('honours the path option', async () => {
    const tree = await runner.runSchematic('team-service', { name: 'billing', path: 'src/modules' });

    expect(tree.files).toEqual(['/src/modules/billing/billing.service.ts']);
  });

  it('is available through its alias', async () => {
    const tree = await runner.runSchematic('ts', { name: 'billing' });

    expect(tree.files).toEqual(['/src/billing/billing.service.ts']);
  });

  it('still exposes Nest built-ins through extends', () => {
    expect(runner.engine.createCollection('@smallmodelstudio/schematics').description.extends).toEqual([
      '@nestjs/schematics',
    ]);
  });
});

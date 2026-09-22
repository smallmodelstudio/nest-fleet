import { resolve } from 'node:path';

import { SchematicTestRunner } from '@angular-devkit/schematics/testing';
import { describe, expect, it } from 'vitest';

// The DevKit loads factories with `require`, so it needs the compiled collection.
const collectionPath = resolve(__dirname, '../../dist/collection.json');

describe('application', () => {
  const runner = new SchematicTestRunner('@team/schematics', collectionPath);

  it('generates the standard Nest project layout', async () => {
    const tree = await runner.runSchematic('application', { name: 'demo' });

    expect(tree.files).toContain('/demo/src/main.ts');
    expect(tree.files).toContain('/demo/src/app.module.ts');
    expect(tree.files).toContain('/demo/package.json');
  });

  it('sets our collection and spec default in nest-cli.json', async () => {
    const tree = await runner.runSchematic('application', { name: 'demo' });

    const nestCliJson = JSON.parse(tree.readContent('/demo/nest-cli.json'));
    expect(nestCliJson.collection).toBe('@team/schematics');
    expect(nestCliJson.generateOptions.spec).toBe(true);
  });

  it('adds a Dockerfile and a CI workflow', async () => {
    const tree = await runner.runSchematic('application', { name: 'demo' });

    expect(tree.files).toContain('/demo/Dockerfile');
    expect(tree.files).toContain('/demo/.github/workflows/ci.yml');
  });

  it('adds a /health endpoint and registers it in AppModule', async () => {
    const tree = await runner.runSchematic('application', { name: 'demo' });

    expect(tree.files).toContain('/demo/src/health/health.controller.ts');
    expect(tree.files).toContain('/demo/src/health/health.controller.spec.ts');

    const appModule = tree.readContent('/demo/src/app.module.ts');
    expect(appModule).toContain("import { HealthController } from './health/health.controller.js';");
    expect(appModule).toContain('controllers: [AppController, HealthController]');
  });

  it('honours the directory option', async () => {
    const tree = await runner.runSchematic('application', { name: 'demo', directory: 'apps/demo' });

    expect(tree.files).toContain('/apps/demo/src/main.ts');
    expect(tree.files).toContain('/apps/demo/Dockerfile');

    const nestCliJson = JSON.parse(tree.readContent('/apps/demo/nest-cli.json'));
    expect(nestCliJson.collection).toBe('@team/schematics');
  });
});

import { resolve } from 'node:path';

import { EmptyTree, type Tree } from '@angular-devkit/schematics';
import { SchematicTestRunner } from '@angular-devkit/schematics/testing';
import { beforeEach, describe, expect, it } from 'vitest';

// The DevKit loads factories with `require`, so it needs the compiled collection.
const collectionPath = resolve(__dirname, '../../dist/collection.json');

function appTree(): Tree {
  const tree = new EmptyTree();
  tree.create('/package.json', `${JSON.stringify({ name: 'demo', dependencies: { '@nestjs/common': '^12.0.1' } }, null, 2)}\n`);
  tree.create(
    '/src/app.module.ts',
    "import { Module } from '@nestjs/common';\nimport { AppController } from './app.controller.js';\nimport { AppService } from './app.service.js';\n\n@Module({\n  imports: [],\n  controllers: [AppController],\n  providers: [AppService],\n})\nexport class AppModule {}\n",
  );
  return tree;
}

describe('nest-add', () => {
  let runner: SchematicTestRunner;

  beforeEach(() => {
    runner = new SchematicTestRunner('@team/health', collectionPath);
  });

  it('generates a HealthModule and controller under src/health', async () => {
    const tree = await runner.runSchematic('nest-add', {}, appTree());

    expect(tree.files).toContain('/src/health/health.module.ts');
    expect(tree.files).toContain('/src/health/health.controller.ts');
    expect(tree.files).toContain('/src/health/health.controller.spec.ts');

    const module = tree.readContent('/src/health/health.module.ts');
    expect(module).toContain("import { TerminusModule } from '@nestjs/terminus';");
    expect(module).toContain('controllers: [HealthController]');
  });

  it('registers HealthModule in AppModule', async () => {
    const tree = await runner.runSchematic('nest-add', {}, appTree());

    const appModule = tree.readContent('/src/app.module.ts');
    expect(appModule).toContain("import { HealthModule } from './health/health.module.js';");
    expect(appModule).toContain('imports: [HealthModule]');
  });

  it('adds @nestjs/terminus to package.json', async () => {
    const tree = await runner.runSchematic('nest-add', {}, appTree());

    const packageJson = JSON.parse(tree.readContent('/package.json'));
    expect(packageJson.dependencies['@nestjs/terminus']).toBeDefined();
  });

  it('queues a package install', async () => {
    await runner.runSchematic('nest-add', {}, appTree());

    expect(runner.tasks.some((task) => task.name === 'node-package')).toBe(true);
  });

  it('honours the sourceRoot option', async () => {
    const tree = appTree();
    tree.rename('/src/app.module.ts', '/lib/app.module.ts');

    const result = await runner.runSchematic('nest-add', { sourceRoot: 'lib' }, tree);

    expect(result.files).toContain('/lib/health/health.module.ts');
    expect(result.readContent('/lib/app.module.ts')).toContain('imports: [HealthModule]');
  });

  it('is idempotent: running it twice does not duplicate the dependency or the import', async () => {
    const once = await runner.runSchematic('nest-add', {}, appTree());
    const twice = await runner.runSchematic('nest-add', {}, once);

    const appModule = twice.readContent('/src/app.module.ts');
    expect(appModule.match(/import { HealthModule }/g)).toHaveLength(1);
    expect(appModule).toContain('imports: [HealthModule]');

    const packageJson = JSON.parse(twice.readContent('/package.json'));
    expect(packageJson.dependencies['@nestjs/terminus']).toBe(
      JSON.parse(once.readContent('/package.json')).dependencies['@nestjs/terminus'],
    );
  });
});

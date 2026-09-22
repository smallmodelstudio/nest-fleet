import { EmptyTree } from '@angular-devkit/schematics';
import { describe, expect, it } from 'vitest';

import { registerInModule } from './register-in-module';

describe('registerInModule', () => {
  it('adds a class to an existing array property and imports it', () => {
    const tree = new EmptyTree();
    tree.create(
      '/app.module.ts',
      "import { Module } from '@nestjs/common';\nimport { AppController } from './app.controller.js';\n\n@Module({\n  imports: [],\n  controllers: [AppController],\n  providers: [],\n})\nexport class AppModule {}\n",
    );

    registerInModule(tree, '/app.module.ts', 'controllers', 'HealthController', './health/health.controller.js');

    const content = tree.readText('/app.module.ts');
    expect(content).toContain("import { HealthController } from './health/health.controller.js';");
    expect(content).toContain('controllers: [AppController, HealthController]');
  });

  it('adds a missing array property when it is not declared', () => {
    const tree = new EmptyTree();
    tree.create(
      '/app.module.ts',
      "import { Module } from '@nestjs/common';\n\n@Module({\n  providers: [],\n})\nexport class AppModule {}\n",
    );

    registerInModule(tree, '/app.module.ts', 'controllers', 'HealthController', './health/health.controller.js');

    const content = tree.readText('/app.module.ts');
    expect(content).toContain("import { HealthController } from './health/health.controller.js';");
    expect(content).toContain('controllers: [HealthController]');
  });

  it('adds to an empty array without a leading comma', () => {
    const tree = new EmptyTree();
    tree.create(
      '/app.module.ts',
      "import { Module } from '@nestjs/common';\n\n@Module({\n  controllers: [],\n})\nexport class AppModule {}\n",
    );

    registerInModule(tree, '/app.module.ts', 'controllers', 'HealthController', './health/health.controller.js');

    expect(tree.readText('/app.module.ts')).toContain('controllers: [HealthController]');
  });

  it('is idempotent: does nothing if the class is already registered', () => {
    const tree = new EmptyTree();
    const original =
      "import { Module } from '@nestjs/common';\nimport { HealthController } from './health/health.controller.js';\n\n@Module({\n  controllers: [HealthController],\n})\nexport class AppModule {}\n";
    tree.create('/app.module.ts', original);

    registerInModule(tree, '/app.module.ts', 'controllers', 'HealthController', './health/health.controller.js');

    expect(tree.readText('/app.module.ts')).toBe(original);
  });

  it('does not duplicate the import if the module is already imported under that path', () => {
    const tree = new EmptyTree();
    tree.create(
      '/app.module.ts',
      "import { Module } from '@nestjs/common';\nimport { HealthController } from './health/health.controller.js';\n\n@Module({\n  controllers: [],\n})\nexport class AppModule {}\n",
    );

    registerInModule(tree, '/app.module.ts', 'controllers', 'HealthController', './health/health.controller.js');

    const content = tree.readText('/app.module.ts');
    expect(content.match(/import { HealthController }/g)).toHaveLength(1);
  });

  it('does nothing if there is no @Module decorator', () => {
    const tree = new EmptyTree();
    const original = 'export class NotAModule {}\n';
    tree.create('/app.module.ts', original);

    registerInModule(tree, '/app.module.ts', 'controllers', 'HealthController', './health/health.controller.js');

    expect(tree.readText('/app.module.ts')).toBe(original);
  });
});

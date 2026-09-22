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

    registerInModule(tree, '/app.module.ts', 'imports', 'HealthModule', './health/health.module.js');

    const content = tree.readText('/app.module.ts');
    expect(content).toContain("import { HealthModule } from './health/health.module.js';");
    expect(content).toContain('imports: [HealthModule]');
  });

  it('adds a missing array property when it is not declared', () => {
    const tree = new EmptyTree();
    tree.create(
      '/app.module.ts',
      "import { Module } from '@nestjs/common';\n\n@Module({\n  providers: [],\n})\nexport class AppModule {}\n",
    );

    registerInModule(tree, '/app.module.ts', 'imports', 'HealthModule', './health/health.module.js');

    const content = tree.readText('/app.module.ts');
    expect(content).toContain("import { HealthModule } from './health/health.module.js';");
    expect(content).toContain('imports: [HealthModule]');
  });

  it('is idempotent: does nothing if the class is already registered', () => {
    const tree = new EmptyTree();
    const original =
      "import { Module } from '@nestjs/common';\nimport { HealthModule } from './health/health.module.js';\n\n@Module({\n  imports: [HealthModule],\n})\nexport class AppModule {}\n";
    tree.create('/app.module.ts', original);

    registerInModule(tree, '/app.module.ts', 'imports', 'HealthModule', './health/health.module.js');

    expect(tree.readText('/app.module.ts')).toBe(original);
  });

  it('does not duplicate the import if the module is already imported under that path', () => {
    const tree = new EmptyTree();
    tree.create(
      '/app.module.ts',
      "import { Module } from '@nestjs/common';\nimport { HealthModule } from './health/health.module.js';\n\n@Module({\n  imports: [],\n})\nexport class AppModule {}\n",
    );

    registerInModule(tree, '/app.module.ts', 'imports', 'HealthModule', './health/health.module.js');

    const content = tree.readText('/app.module.ts');
    expect(content.match(/import { HealthModule }/g)).toHaveLength(1);
  });
});

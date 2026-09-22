import { resolve } from 'node:path';

import { EmptyTree, type Tree } from '@angular-devkit/schematics';
import { SchematicTestRunner } from '@angular-devkit/schematics/testing';
import { describe, expect, it } from 'vitest';

// The DevKit loads factories with `require`, so it needs the compiled collection.
const collectionPath = resolve(__dirname, '../../dist/collection.json');

describe('migrate-to-v2', () => {
  const runner = new SchematicTestRunner('@smallmodelstudio/schematics', collectionPath);

  function treeWith(files: Record<string, string>): Tree {
    const tree = new EmptyTree();
    for (const [path, content] of Object.entries(files)) {
      tree.create(path, content);
    }
    return tree;
  }

  it('moves a console.log in src to the Logger', async () => {
    const tree = treeWith({
      '/src/billing/billing.service.ts':
        "import { Injectable } from '@nestjs/common';\n\n@Injectable()\nexport class BillingService {\n  charge() {\n    console.log('charging');\n  }\n}\n",
    });

    const result = await runner.runSchematic('migrate-to-v2', {}, tree);

    const content = result.readContent('/src/billing/billing.service.ts');
    expect(content).toContain('private readonly logger = new Logger(BillingService.name);');
    expect(content).toContain("this.logger.log('charging');");
  });

  it('leaves files outside src untouched', async () => {
    const tree = treeWith({
      '/scripts/seed.ts': "console.log('seeding');\n",
    });

    const result = await runner.runSchematic('migrate-to-v2', {}, tree);

    expect(result.readText('/scripts/seed.ts')).toBe("console.log('seeding');\n");
  });

  it('honours the path option', async () => {
    const tree = treeWith({
      '/apps/api/src/main.ts': "async function bootstrap() {\n  console.log('starting');\n}\nbootstrap();\n",
      '/src/other.ts': "console.log('should stay');\n",
    });

    const result = await runner.runSchematic('migrate-to-v2', { path: 'apps/api/src' }, tree);

    expect(result.readText('/apps/api/src/main.ts')).toContain("logger.log('starting');");
    expect(result.readText('/src/other.ts')).toBe("console.log('should stay');\n");
  });

  it('is idempotent: a second run reports no changes', async () => {
    const tree = treeWith({
      '/src/billing/billing.service.ts':
        "import { Injectable } from '@nestjs/common';\n\n@Injectable()\nexport class BillingService {\n  charge() {\n    console.log('charging');\n  }\n}\n",
      '/src/main.ts': "async function bootstrap() {\n  console.log('starting');\n}\nbootstrap();\n",
    });

    const afterFirstRun = await runner.runSchematic('migrate-to-v2', {}, tree);
    const beforeSecondRun = {
      service: afterFirstRun.readContent('/src/billing/billing.service.ts'),
      main: afterFirstRun.readContent('/src/main.ts'),
    };

    const afterSecondRun = await runner.runSchematic('migrate-to-v2', {}, afterFirstRun);

    expect(afterSecondRun.readContent('/src/billing/billing.service.ts')).toBe(beforeSecondRun.service);
    expect(afterSecondRun.readContent('/src/main.ts')).toBe(beforeSecondRun.main);
  });
});

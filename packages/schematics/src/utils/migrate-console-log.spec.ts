import { EmptyTree } from '@angular-devkit/schematics';
import { describe, expect, it } from 'vitest';

import { migrateConsoleLogToLogger } from './migrate-console-log';

describe('migrateConsoleLogToLogger', () => {
  it('does nothing and returns false when there is no console.log', () => {
    const tree = new EmptyTree();
    const original = "import { Injectable } from '@nestjs/common';\n\nexport class UsersService {}\n";
    tree.create('/users.service.ts', original);

    const changed = migrateConsoleLogToLogger(tree, '/users.service.ts');

    expect(changed).toBe(false);
    expect(tree.readText('/users.service.ts')).toBe(original);
  });

  it('rewrites a call in a method to this.logger.log and adds the field', () => {
    const tree = new EmptyTree();
    tree.create(
      '/users.service.ts',
      "import { Injectable } from '@nestjs/common';\n\n@Injectable()\nexport class UsersService {\n  find() {\n    console.log('finding');\n  }\n}\n",
    );

    const changed = migrateConsoleLogToLogger(tree, '/users.service.ts');

    expect(changed).toBe(true);
    const content = tree.readText('/users.service.ts');
    expect(content).toContain("import { Injectable, Logger } from '@nestjs/common';");
    expect(content).toContain('private readonly logger = new Logger(UsersService.name);');
    expect(content).toContain("this.logger.log('finding');");
    expect(content).not.toContain('console.log');
  });

  it('reuses an existing logger field instead of adding a second one', () => {
    const tree = new EmptyTree();
    tree.create(
      '/users.service.ts',
      "import { Injectable, Logger } from '@nestjs/common';\n\n@Injectable()\nexport class UsersService {\n  private readonly logger = new Logger(UsersService.name);\n\n  find() {\n    console.log('finding');\n  }\n}\n",
    );

    migrateConsoleLogToLogger(tree, '/users.service.ts');

    const content = tree.readText('/users.service.ts');
    expect(content.match(/private readonly logger/g)).toHaveLength(1);
    expect(content).toContain("this.logger.log('finding');");
  });

  it('rewrites calls inside an arrow function class property, since arrows keep the surrounding this', () => {
    const tree = new EmptyTree();
    tree.create(
      '/users.service.ts',
      "export class UsersService {\n  find = () => {\n    console.log('finding');\n  };\n}\n",
    );

    migrateConsoleLogToLogger(tree, '/users.service.ts');

    const content = tree.readText('/users.service.ts');
    expect(content).toContain("this.logger.log('finding');");
  });

  it('handles two classes in one file, giving each its own logger field', () => {
    const tree = new EmptyTree();
    tree.create(
      '/multi.ts',
      "export class A {\n  run() {\n    console.log('a');\n  }\n}\n\nexport class B {\n  run() {\n    console.log('b');\n  }\n}\n",
    );

    migrateConsoleLogToLogger(tree, '/multi.ts');

    const content = tree.readText('/multi.ts');
    expect(content).toContain('private readonly logger = new Logger(A.name);');
    expect(content).toContain('private readonly logger = new Logger(B.name);');
    expect(content).toContain("this.logger.log('a');");
    expect(content).toContain("this.logger.log('b');");
  });

  it('rewrites a top-level call to a module-scoped logger named after the file', () => {
    const tree = new EmptyTree();
    tree.create(
      '/main.ts',
      "import { NestFactory } from '@nestjs/core';\n\nasync function bootstrap() {\n  console.log('starting');\n}\nbootstrap();\n",
    );

    migrateConsoleLogToLogger(tree, '/main.ts');

    const content = tree.readText('/main.ts');
    expect(content).toContain("import { Logger } from '@nestjs/common';");
    expect(content).toContain("const logger = new Logger('main');");
    expect(content).toContain("logger.log('starting');");
    expect(content).not.toContain('console.log');
  });

  it('reuses an existing module-level logger instead of declaring a second one', () => {
    const tree = new EmptyTree();
    tree.create(
      '/main.ts',
      "import { Logger } from '@nestjs/common';\n\nconst logger = new Logger('main');\n\nfunction bootstrap() {\n  console.log('starting');\n}\n",
    );

    migrateConsoleLogToLogger(tree, '/main.ts');

    const content = tree.readText('/main.ts');
    expect(content.match(/const logger = new Logger/g)).toHaveLength(1);
    expect(content).toContain("logger.log('starting');");
  });

  it('leaves console.error and console.warn alone', () => {
    const tree = new EmptyTree();
    const original = "export class UsersService {\n  find() {\n    console.error('oops');\n  }\n}\n";
    tree.create('/users.service.ts', original);

    const changed = migrateConsoleLogToLogger(tree, '/users.service.ts');

    expect(changed).toBe(false);
    expect(tree.readText('/users.service.ts')).toBe(original);
  });

  it('is idempotent: a second run makes no further changes', () => {
    const tree = new EmptyTree();
    tree.create(
      '/users.service.ts',
      "import { Injectable } from '@nestjs/common';\n\n@Injectable()\nexport class UsersService {\n  find() {\n    console.log('finding');\n  }\n}\n",
    );

    migrateConsoleLogToLogger(tree, '/users.service.ts');
    const afterFirstRun = tree.readText('/users.service.ts');
    const changedOnSecondRun = migrateConsoleLogToLogger(tree, '/users.service.ts');

    expect(changedOnSecondRun).toBe(false);
    expect(tree.readText('/users.service.ts')).toBe(afterFirstRun);
  });
});

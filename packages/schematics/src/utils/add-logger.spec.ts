import { EmptyTree } from '@angular-devkit/schematics';
import { describe, expect, it } from 'vitest';

import { addLoggerToClass } from './add-logger';

describe('addLoggerToClass', () => {
  it('adds a Logger field and merges into an existing @nestjs/common import', () => {
    const tree = new EmptyTree();
    tree.create(
      '/users.controller.ts',
      "import { Controller } from '@nestjs/common';\n\n@Controller('users')\nexport class UsersController {}\n",
    );

    addLoggerToClass(tree, '/users.controller.ts', 'UsersController');

    const content = tree.readText('/users.controller.ts');
    expect(content).toContain("import { Controller, Logger } from '@nestjs/common';");
    expect(content).toContain('private readonly logger = new Logger(UsersController.name);');
  });

  it('adds a new import when the file has no @nestjs/common import', () => {
    const tree = new EmptyTree();
    tree.create('/users.service.ts', 'export class UsersService {}\n');

    addLoggerToClass(tree, '/users.service.ts', 'UsersService');

    const content = tree.readText('/users.service.ts');
    expect(content).toContain("import { Logger } from '@nestjs/common';");
    expect(content).toContain('private readonly logger = new Logger(UsersService.name);');
  });

  it('does nothing if the named class is not found', () => {
    const tree = new EmptyTree();
    const original = "import { Injectable } from '@nestjs/common';\n\nexport class OtherService {}\n";
    tree.create('/other.service.ts', original);

    addLoggerToClass(tree, '/other.service.ts', 'UsersService');

    expect(tree.readText('/other.service.ts')).toBe(original);
  });

  it('is idempotent: does nothing if a logger member already exists', () => {
    const tree = new EmptyTree();
    const original =
      "import { Injectable, Logger } from '@nestjs/common';\n\n@Injectable()\nexport class UsersService {\n  private readonly logger = new Logger(UsersService.name);\n}\n";
    tree.create('/users.service.ts', original);

    addLoggerToClass(tree, '/users.service.ts', 'UsersService');

    expect(tree.readText('/users.service.ts')).toBe(original);
  });
});

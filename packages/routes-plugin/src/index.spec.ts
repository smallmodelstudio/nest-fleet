import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ts from 'typescript';

import { before, collectRoutes } from './index';

describe('collectRoutes', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'routes-plugin-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists every route, combining the controller and method paths', () => {
    const file = join(dir, 'cats.controller.ts');
    writeFileSync(
      file,
      `
      import { Controller, Get, Post } from '@nestjs/common';

      @Controller('cats')
      export class CatsController {
        @Get()
        findAll() {}

        @Post('adopt')
        adopt() {}
      }
      `,
    );

    const routes = collectRoutes(programFor(file));
    const expectedFile = relative(process.cwd(), file);

    expect(routes).toEqual([
      { controller: 'CatsController', handler: 'findAll', method: 'GET', path: '/cats', file: expectedFile },
      { controller: 'CatsController', handler: 'adopt', method: 'POST', path: '/cats/adopt', file: expectedFile },
    ]);
  });

  it('follows aliased imports and a `{ path }` decorator argument', () => {
    const file = join(dir, 'dogs.controller.ts');
    writeFileSync(
      file,
      `
      import { Controller as Ctrl, Get as HttpGet } from '@nestjs/common';

      @Ctrl({ path: 'dogs' })
      export class DogsController {
        @HttpGet()
        findAll() {}
      }
      `,
    );

    const routes = collectRoutes(programFor(file));

    expect(routes).toEqual([
      { controller: 'DogsController', handler: 'findAll', method: 'GET', path: '/dogs', file: relative(process.cwd(), file) },
    ]);
  });

  it('ignores classes and methods that are not decorated as controllers or routes', () => {
    const file = join(dir, 'cats.service.ts');
    writeFileSync(
      file,
      `
      export class CatsService {
        findAll() {}
      }
      `,
    );

    expect(collectRoutes(programFor(file))).toEqual([]);
  });
});

describe('before', () => {
  it('writes the collected routes to the given output file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'routes-plugin-'));
    try {
      const file = join(dir, 'cats.controller.ts');
      writeFileSync(
        file,
        `
        import { Controller, Get } from '@nestjs/common';

        @Controller('cats')
        export class CatsController {
          @Get()
          findAll() {}
        }
        `,
      );
      const outputFile = join(dir, 'routes.json');

      const transformer = before({ outputFile }, programFor(file));

      expect(JSON.parse(readFileSync(outputFile, 'utf8'))).toEqual([
        { controller: 'CatsController', handler: 'findAll', method: 'GET', path: '/cats', file: relative(process.cwd(), file) },
      ]);
      expect(typeof transformer).toBe('function');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function programFor(...fileNames: string[]): ts.Program {
  return ts.createProgram({
    rootNames: fileNames,
    options: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, types: [] },
  });
}

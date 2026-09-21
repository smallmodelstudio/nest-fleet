# nest-fleet — plan

A learning project: customise the NestJS CLI so a lead engineer can set and
enforce how the team builds several Nest services, then grow it into tooling
that works across all of those repos at once.

`nest-fleet` is a working name.

## 1. Goal

As lead, I want:

- `nest g ...` in any of my team's repos to produce code in our house style,
  not Nest's defaults.
- `nest new` to start a service from our template.
- Opt-in capabilities (health, logging, config) added with one command.
- To change a convention once and roll it out to every repo.
- To see which repos have drifted from the standard.

## 2. How the Nest CLI can be extended

The `nest` binary has no plugin system for new commands. It has five extension
points, from simplest to most involved:

| #   | Lever                                       | What it controls                                                                                                      | Effort |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | `nest-cli.json`                             | Defaults for `generate` (`spec`, `flat`, `specFileSuffix`, `baseDir`), build (`builder`, `plugins`, `assets`), monorepo `projects`, the default `collection` | Low    |
| 2   | Custom schematics collection                | What `nest g <x>` produces. Can inherit all of Nest's schematics and override or add to them                         | Medium |
| 3   | `nest new -c <collection>`                  | The starting template for a new service (the collection's `application` schematic)                                   | Medium |
| 4   | `nest add <package>`                        | Installs a package, then runs its `nest-add` schematic to wire it into the app                                       | Medium |
| 5   | Compiler plugins (`compilerOptions.plugins`) | TypeScript transformers run by `nest build`, like `@nestjs/swagger`'s plugin                                          | High   |

Anything outside these, such as `nest fleet status`, needs a separate CLI of
our own that calls schematics and `nest` where it helps (see phase 6).

Schematics are Angular DevKit schematics (`@angular-devkit/schematics`). A
schematic is a function that takes options and returns a `Rule`: a change to a
virtual file tree. Changes are only written to disk once they all succeed,
which is what makes `--dry-run` work.

## 3. Findings from a spike (verified on 2026-09-21)

I built a small collection and ran it through `nest g` to check the mechanics
before writing this plan:

- **A collection can extend Nest's.** `"extends": ["@nestjs/schematics"]` in
  `collection.json` keeps every built-in schematic, and `nest g --help` lists
  ours alongside them.
- **A built-in can be overridden.** Declaring `controller` (alias `co`) in our
  collection replaces Nest's. Our version called Nest's own schematic through
  `externalSchematic('@nestjs/schematics', 'controller', ...)` and then
  applied a team rule. `nest g co users --no-spec` still produced a spec,
  because the rule took precedence over the flag.
- **Use the project-local CLI.** The CLI resolves a custom collection from its
  own install location, not the project's. A globally installed `nest`
  failed with `Collection "@team/schematics" cannot be resolved`. `npx nest`
  (CLI installed as a dev dependency) worked. The global CLI here is 11.0.24;
  the local one is 12.0.3.
- **Use `applyTemplates()`, not `template()`.** `template()` left the
  `.template` suffix on the generated file names; `applyTemplates()` removes it.
- **`schema` paths must be relative files.** A package path like
  `"@nestjs/schematics/dist/..."` was resolved relative to our collection and
  failed. Copy the schema, or point to it with a relative path.
- Versions in the local install: `@nestjs/cli` 12.0.3, `@nestjs/schematics`
  12.0.4, `@angular-devkit/schematics` 22.1.8.

## 4. The art of the possible

What this could grow into, roughly in order of value to a lead:

| Idea                             | What the team gets                                                                                  | Built with                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------ |
| House-style generators           | `nest g resource` produces our layering, DTO style, logger and specs                                | Override schematics (lever 2)        |
| Golden-path new service          | `nest new -c @team/schematics` gives lint, tsconfig, Docker, CI and health from day one             | `application` schematic (lever 3)    |
| Capability packages              | `nest add @team/health` installs and registers it in `AppModule`                                    | `nest-add` schematics (lever 4)      |
| Shared config presets            | One ESLint, Prettier and tsconfig package that every repo extends                                  | npm packages                         |
| Migrations                       | "We now use pino": a schematic that rewrites imports and config, run in each repo                  | Schematics plus AST edits            |
| Fleet manifest and drift check   | `fleet doctor` reports which repos are on old Nest versions, missing specs or off-standard config  | Own CLI plus `fleet.json`            |
| Fleet-wide changes               | `fleet run migrate-logger` clones each repo, runs the schematic, runs tests, opens a PR             | Own CLI plus `git` and `gh`          |
| Architecture rules               | Fail CI when a controller imports a repository directly                                             | dependency-cruiser or ESLint rules   |
| Compile-time metadata            | Auto-add Swagger decorators, or emit a route inventory per service                                  | Compiler plugin (lever 5)            |

## 5. Proposed layout

A pnpm workspace, using the same tooling as `nest-kit` (Node 24, TypeScript,
Vitest):

```
nest-fleet/
├── PLAN.md
├── packages/
│   ├── schematics/      @team/schematics: the collection (phases 1–5)
│   ├── config/          @team/config: eslint, prettier and tsconfig presets
│   └── fleet/           @team/fleet: our own CLI (phase 6)
├── sandbox/             throwaway Nest app to try things in (gitignored)
└── fleet.json           the repos we manage (phase 6)
```

Schematics compile to CommonJS, because the DevKit loads factories with
`require`.

## 6. Phases

Each phase is small enough to finish in a sitting, and ends with something
that can be run.

### Phase 0: Workspace

- `git init`, pnpm workspace, `tsconfig.base.json`, Vitest.
- `packages/schematics` with an empty `collection.json` that extends
  `@nestjs/schematics`, and `"schematics": "./dist/collection.json"` in its
  `package.json`.
- A build step that compiles TypeScript and copies `collection.json`, the
  `schema.json` files and `files/` templates into `dist/`.
- `sandbox/`: `nest new sandbox --skip-git`, then add the collection as a
  `link:` dependency and set `"collection": "@team/schematics"` in its
  `nest-cli.json`.

**Done when** `npx nest g --help` in `sandbox/` lists "Schematics available on
@team/schematics collection".

**You learn:** how the CLI finds a collection, and what `extends` does.

### Phase 1: First custom schematic

Add `team-service` (alias `ts`): a service with a `Logger` already set up.

```ts
// packages/schematics/src/team-service/index.ts
import { apply, applyTemplates, mergeWith, move, Rule, url } from '@angular-devkit/schematics';
import { strings } from '@angular-devkit/core';

export function teamService(opts: { name: string; path: string }): Rule {
  return mergeWith(apply(url('./files'), [applyTemplates({ ...strings, ...opts }), move(opts.path)]));
}
```

```
// files/__name@dasherize__/__name@dasherize__.service.ts.template
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class <%= classify(name) %>Service {
  private readonly logger = new Logger(<%= classify(name) %>Service.name);
}
```

Plus `schema.json` (options, `x-prompt` for interactive questions) and the
entry in `collection.json`.

- Unit test with `SchematicTestRunner` from
  `@angular-devkit/schematics/testing`: run the schematic against an empty
  tree and assert on the files and their content.

**Done when** `npx nest g ts billing` creates `src/billing/billing.service.ts`
and the test passes.

**You learn:** Rules, Trees, templates, `strings` helpers, schema options.

### Phase 2: Override built-ins and set defaults

- Override `controller` and `service`: call Nest's schematic with
  `externalSchematic`, then apply team rules (spec always on, logger added).
- Set `generateOptions` in the sandbox's `nest-cli.json` (for example
  `"spec": { "service": true, "controller": true }`) and compare what config
  alone can do with what needs a schematic.
- Write a schematic that edits an existing file: register a new service in the
  nearest module. Use `@schematics/angular/utility/ast-utils` style helpers, or
  `ts-morph` against the file's text.

**Done when** `nest g co users --no-spec` still produces a spec, and a test
proves it.

**You learn:** composing schematics, editing existing TypeScript safely.

### Phase 3: Golden-path `nest new`

- Add an `application` schematic: extend Nest's, then add our config presets,
  `Dockerfile`, CI workflow, `/health` endpoint and `nest-cli.json` with
  `"collection": "@team/schematics"` already set.
- Work out how to run it: `nest new` uses the global CLI, which cannot see our
  collection (see findings). Try
  `npx -p @nestjs/cli -p @team/schematics nest new demo -c @team/schematics`,
  and fall back to a `fleet new` command in phase 6 if needed.

**Done when** one command creates a service that passes lint, build and tests
without edits.

### Phase 4: `nest add` capabilities

- Create `@team/health` with a `nest-add` schematic that installs
  `@nestjs/terminus`, adds a `HealthModule` and imports it into `AppModule`.
- Test locally with `npm pack`, or a local registry (Verdaccio), since
  `nest add` installs from a registry.

**Done when** `npx nest add @team/health` in a fresh sandbox gives a working
`/health`.

### Phase 5: Migrations

- A `migrate-to-v2` schematic that makes a real change: for example, move
  every `console.log` to the Nest `Logger`, or bump the ESLint preset and fix
  config.
- Make it idempotent: running it twice changes nothing.

**Done when** it upgrades an older sandbox, and a second run reports no
changes.

**You learn:** writing changes you can safely run across many repos.

### Phase 6: The fleet CLI

Our own binary, built with `commander` (or `nest-commander` to practise Nest):

- `fleet.json` lists repos: name, git URL, owner, the standards version it is on.
- `fleet status`: Nest version, collection in use and last CI result per repo.
- `fleet doctor`: checks each repo against the standard (CLI local, collection
  set, spec settings, preset versions) and prints a table.
- `fleet run <schematic>`: for each repo, clone to a temp directory, branch, run
  the schematic with the DevKit's `NodeWorkflow`, run tests, and open a PR with
  `gh`. Dry run by default.

**Done when** `fleet doctor` reports on two real repos, and `fleet run` opens a
PR on one of them.

### Phase 7 (stretch): Compiler plugin

A `nest build` plugin that writes a `routes.json` listing every controller
route, as a first look at TypeScript transformers.

## 7. How this relates to nest-kit

`~/nest-kit` builds its own `nest-kit` binary with commander (roadmap phase 4:
`new service`, `generate resource`). This project instead extends the official
`nest` CLI, so the team keeps using commands they already know. Later, the two
could meet: `@team/schematics` could generate `nest-kit` contracts and
resources, or `fleet` could manage `nest-kit` services. That decision can wait
until phase 3.

## 8. Open questions

- Which repos go into `fleet.json` first?
- Where will packages be published: GitHub Packages, a private npm scope, or
  git dependencies?
- Is the team on npm or pnpm? That affects `nest new` and `nest add`.
- Should the global CLI be upgraded from 11 to 12, or should every doc say
  `npx nest`?

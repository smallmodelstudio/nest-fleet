# nest-fleet

Tooling that lets a lead set how the team builds NestJS services, and keep
every repo on that standard. It extends the official `nest` CLI where it can
(schematics, `nest new`, `nest add`, compiler plugins) and adds its own
`fleet` CLI for work across many repos at once.

See [PLAN.md](PLAN.md) for the background and the phase-by-phase plan.

## Packages

| Package                                       | What it is                                                                                          | Used via                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------- |
| [`@team/schematics`](packages/schematics)     | A schematics collection that extends `@nestjs/schematics` with house-style generators and migrations | `nest g`, `nest new -c`, `fleet run` |
| [`@team/health`](packages/health)             | A `nest-add` schematic that wires `@nestjs/terminus` and a `/health` endpoint into an app            | `nest add @team/health`           |
| [`@team/routes-plugin`](packages/routes-plugin) | A `nest build` compiler plugin that writes `routes.json`, listing every controller route          | `nest-cli.json` `plugins`         |
| [`@team/fleet`](packages/fleet)               | The `fleet` CLI: `status`, `doctor` and `run` across every repo in `fleet.json`                      | `fleet <command>`                 |

`sandbox/` is a throwaway Nest app for trying things out. It is gitignored,
but it is a pnpm workspace member, so it uses the local packages through
`link:` dependencies.

## Setup

You need Node 24 or later and pnpm 12 (the version is pinned in
`packageManager`, so `corepack enable` picks it up).

```sh
pnpm install
pnpm build       # compile every package into its dist/
pnpm test        # builds first, then runs vitest across all packages
pnpm typecheck
```

Rebuild after changing any package. The Nest CLI and the `fleet` CLI both
load the compiled `dist/` output, not the TypeScript sources.

## The `fleet` CLI

`fleet` reads a list of repos from `fleet.json` and reports on them or
changes them.

### Running it

The package is not published yet, so run the built entry point from the repo
root:

```sh
node packages/fleet/dist/main.js --help
```

Adding an alias makes the examples below work as written:

```sh
alias fleet="node $PWD/packages/fleet/dist/main.js"
```

By default every command reads `./fleet.json` from the current directory.
Pass `-c, --config <path>` to use a different file. Repo `path`s are
resolved relative to the config file, not to the current directory.

### `fleet.json`

```json
{
  "standardsVersion": "0.1.0",
  "repos": [
    { "name": "sandbox", "path": "sandbox" },
    { "name": "billing", "gitUrl": "git@github.com:acme/billing.git" },
    { "name": "orders", "path": "../orders", "gitUrl": "https://github.com/acme/orders.git", "owner": "acme-platform" }
  ]
}
```

| Field              | Required                   | Meaning                                                                                                   |
| ------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `standardsVersion` | yes                        | The `@team/schematics` version every repo should be on. `fleet doctor` compares against it.               |
| `repos[].name`     | yes                        | A label, and the value `fleet run --repo` matches against.                                                |
| `repos[].path`     | one of `path` or `gitUrl`  | A local checkout. `status` and `doctor` read it in place. `run` clones from it when there is no `gitUrl`. |
| `repos[].gitUrl`   | one of `path` or `gitUrl`  | The remote. `status` needs it for the CI column, and `run --apply` needs it to push and open a PR.        |
| `repos[].owner`    | no                         | The GitHub owner or org to use for `gh` calls, if it differs from the one in `gitUrl`.                    |

When a repo has only a `gitUrl`, `status` and `doctor` make a shallow clone
into a temp directory and delete it afterwards.

### `fleet status`

Shows, for each repo, the Nest version, the schematics collection it uses and
its last CI run.

```
$ fleet status
REPO     NEST     COLLECTION        LAST CI
-------  -------  ----------------  -----------------
sandbox  ^12.0.1  @team/schematics  local (no remote)
```

- **NEST** is the `@nestjs/core` range in `dependencies`.
- **COLLECTION** is the `collection` in `nest-cli.json`, or
  `@nestjs/schematics (default)` if none is set.
- **LAST CI** is the latest GitHub Actions run, as `status/conclusion`, from
  `gh run list`. It shows `local (no remote)` when the repo has no `gitUrl`,
  and `gh not available` when `gh` is not installed. Run `gh auth login` first.

### `fleet doctor`

Checks each repo against the team standard and prints a table.

```
$ fleet doctor
REPO     STATUS  FAILING
-------  ------  -------------
sandbox  OK      spec defaults

$ fleet doctor --verbose     # also lists every check with its detail
sandbox:
  [ok] local nest CLI — @nestjs/cli is a devDependency
  [ok] collection — nest-cli.json "collection" is "@team/schematics"
  [ok] @team/schematics version — linked locally (link:../packages/schematics)
  [warn] spec defaults — nest-cli.json "generateOptions.spec" is not set to true
```

| Check                      | Severity | Passes when                                                                                                 |
| -------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `local nest CLI`           | error    | `@nestjs/cli` is in `devDependencies`. A global `nest` cannot resolve `@team/schematics`.                  |
| `collection`               | error    | `nest-cli.json` has `"collection": "@team/schematics"`                                                      |
| `@team/schematics version` | error    | `dependencies["@team/schematics"]` equals `standardsVersion` (a leading `^` or `~` is ignored), or is a `link:` or `workspace:` dependency |
| `spec defaults`            | warn     | `nest-cli.json` has `"generateOptions": { "spec": true }`                                                   |

A repo is `DRIFT` if any **error** check fails. Warnings are listed but
leave the repo `OK`. The command exits with code 1 when any repo drifts, so
you can use it as a CI gate.

### `fleet run <schematic>`

Runs a schematic in every repo, or only the repos you name. **It is a dry run
unless you pass `--apply`.**

```sh
# See what migrate-to-v2 would change everywhere. Nothing is pushed.
fleet run migrate-to-v2

# Only the billing and orders repos, with a schematic option.
fleet run migrate-to-v2 -r billing -r orders -o path=src/legacy

# Do it for real: branch, run, test, commit, push and open a PR in each repo.
fleet run migrate-to-v2 --apply
```

| Option                      | Meaning                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `-r, --repo <name>`         | Only run in this repo. Repeat it for more than one. Defaults to every repo.        |
| `-o, --option <key=value>`  | Pass an option to the schematic. Repeatable. Values are passed as strings.         |
| `--collection <name>`       | The collection to take the schematic from. Defaults to `@team/schematics`.          |
| `--apply`                   | Push a branch and open a PR, instead of doing a dry run                             |
| `-c, --config <path>`       | The `fleet.json` to read                                                            |

For each repo it:

1. Clones the repo into a temp directory, from `gitUrl` if there is one and
   `path` otherwise.
2. With `--apply` only, creates a branch named `fleet/<schematic>-<timestamp>`.
3. Installs dependencies: `pnpm install --frozen-lockfile` if there is a
   `pnpm-lock.yaml`, otherwise `npm ci`, or `npm install` when there is no
   lockfile. The collection has to be resolvable from the repo's own
   `node_modules`, so `@team/schematics` must be one of its dependencies.
4. Runs the schematic through the Angular DevKit's `NodeWorkflow`.
5. With `--apply` only: if the schematic changed nothing it stops with
   `no-changes`. Otherwise it runs the repo's `test` script, and if the tests
   pass it commits, pushes the branch and opens a PR with `gh pr create`.
6. Deletes the temp directory.

Each repo ends in one of these states:

| Result         | Meaning                                                               |
| -------------- | --------------------------------------------------------------------- |
| `dry-run`      | The files the schematic would create, update or delete are listed      |
| `no-changes`   | With `--apply`: the schematic had nothing to do, so no PR was opened   |
| `pr-opened`    | The PR URL is printed                                                 |
| `tests-failed` | The schematic ran but `test` failed. Nothing was pushed.              |
| `failed`       | Clone, install or the schematic itself failed. The error is shown.     |

The command exits with code 1 if any repo is `failed` or `tests-failed`.
Repos are processed one after another.

**For `--apply` you need** a `gitUrl` you can push to, `gh` installed and
logged in, and a git `user.name` and `user.email` set, because the commit
is made in the temp clone. A clone made from a local `path` only contains
what is committed, so uncommitted work in that checkout is not included.

## Schematics: `nest g`, `nest new`, `nest add`

Always use the **project-local** Nest CLI (`npx nest`, or the `nest` in a
package script). A globally installed `nest` resolves collections from its
own install location and fails with
`Collection "@team/schematics" cannot be resolved`.

### Using the collection in an existing app

Add `@team/schematics` as a dependency, then set it as the default in
`nest-cli.json`:

```json
{ "collection": "@team/schematics", "generateOptions": { "spec": true } }
```

Every Nest built-in (`module`, `resource`, `guard` and the rest) still works,
because the collection `extends` `@nestjs/schematics`. These are ours:

| Command                          | What it does                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npx nest g ts billing`          | `team-service`: creates `src/billing/billing.service.ts` with a `Logger` field already set up          |
| `npx nest g co users`            | Overrides Nest's `controller`: always writes a spec, even with `--no-spec`, and adds a `Logger` field  |
| `npx nest g s users`             | Overrides Nest's `service` in the same way                                                              |
| `npx nest g migrate-to-v2`       | Replaces `console.log` under `src/` with the Nest `Logger`. Running it twice changes nothing.          |

Add `--dry-run` to any of these to preview the changes without writing them.

### Starting a new service: `nest new`

The `nest` binary has to be one that can resolve `@team/schematics`. Until the
package is published, use the one installed in `sandbox/`, and run it from the
directory where the new project should go:

```sh
cd ~/code
~/nest-fleet/sandbox/node_modules/.bin/nest new billing -c @team/schematics -p npm
```

This produces Nest's standard app plus a `Dockerfile`, a GitHub Actions
workflow (lint, build, test), a `/health` endpoint, and a `nest-cli.json` with
the collection and spec defaults already set. Don't use `--directory` with an
absolute path: in testing, it wrote nothing.

The generated `package.json` points `@team/schematics` at this checkout with a
`file:` path. That is needed until the package is published, and it means the
generated CI workflow and Docker build will fail anywhere this checkout isn't
present at that path.

### Adding capabilities: `nest add @team/health`

```sh
npx nest add @team/health
```

This adds `@nestjs/terminus`, generates `src/health/health.module.ts` and a
controller, imports `HealthModule` into `AppModule`, and installs the new
dependency. `nest add` installs from a registry, so until `@team/health` is
published, try it out with a local registry such as Verdaccio.

Don't run it on an app made with `nest new -c @team/schematics`. That app
already has its own `HealthController`, and the two would clash.

## Route inventory: `@team/routes-plugin`

Add the plugin to `nest-cli.json`, and `nest build` writes `routes.json` in the
directory you ran it from:

```json
{ "compilerOptions": { "plugins": ["@team/routes-plugin"] } }
```

```json
[{ "controller": "AppController", "handler": "getHello", "method": "GET", "path": "/", "file": "src/app.controller.ts" }]
```

To write it somewhere else, pass
`{ "name": "@team/routes-plugin", "options": { "outputFile": "dist/routes.json" } }`.
The plugin only runs with the default `tsc` builder, not with SWC. It reads
string or `{ path }` arguments to `@Controller` and the HTTP-method
decorators. Array paths, a global prefix and versioning are not included in
the paths it writes.

## Repo layout

```
nest-fleet/
├── PLAN.md                 background, findings and phases
├── fleet.json              the repos fleet manages
├── packages/
│   ├── schematics/         @team/schematics
│   ├── health/             @team/health
│   ├── routes-plugin/      @team/routes-plugin
│   └── fleet/              @team/fleet
└── sandbox/                throwaway Nest app (gitignored)
```

Schematic packages compile to CommonJS, because the DevKit loads factories
with `require`. Their build copies `collection.json`, the `schema.json` files
and the `files/` templates into `dist/`.

# TEST.md — How to run the tests

A practical, copy-paste guide to running every test in this repo from your own machine.

> **Looking for the _why_?** This file is the _how_. For the testing philosophy, the
> seven layers, and the labelling conventions for results, see
> [docs/testing.md](docs/testing.md).

---

## 1. Before you start

| Requirement  | Version / note                                                   |
| ------------ | ---------------------------------------------------------------- |
| Node.js      | `>= 20` (CI uses 24; this machine has been verified on v24.18.1) |
| pnpm         | `10.10.0` (declared in `package.json` → `packageManager`)        |
| Dependencies | Run `pnpm install` once. Tests need only `devDependencies`.      |
| Database     | **Not required for any test below.**                             |
| Secrets      | **Not required for any test below.**                             |

```bash
pnpm install
```

You do **not** need a Neon database, a `.env.local`, or any API keys to run the test
suite. That is deliberate — the whole suite is self-contained, so it runs in CI and on
any teammate's laptop without credentials.

---

## 2. The fast answer

```bash
pnpm check-all
```

That runs the three layers that gate a merge — **typecheck → lint → tests** — and is the
single command to run before you push. If it passes locally, CI should pass.

Want the performance budget too (needs a build, takes longer)?

```bash
pnpm perf:ci
```

---

## 3. Every command, by layer

| What you want to check        | Command                           | Needs a build? | Typical time |
| ----------------------------- | --------------------------------- | -------------- | ------------ |
| Unit + integration tests      | `pnpm test`                       | No             | ~10–20 s     |
| Performance **guard**         | `pnpm test` (included above)      | No             | <1 s         |
| Types                         | `pnpm typecheck`                  | No             | ~10–20 s     |
| Lint (code-level errors)      | `pnpm lint`                       | No             | ~5–15 s      |
| Formatting                    | `pnpm format`                     | No             | ~3 s         |
| React diagnostics             | `pnpm doctor`                     | No             | ~30 s+       |
| Bundle size **budgets**       | `pnpm perf:bundle`                | **Yes**        | ~5 s + build |
| Everything that gates a merge | `pnpm check-all`                  | No             | ~30–60 s     |
| Full CI equivalent            | `pnpm perf:ci` (builds + budgets) | **Yes**        | ~1–2 min     |

`pnpm test` already includes the performance guard (`perf/bundle-budget.test.ts`),
because that guard reads config rather than build output. The full asset budgets only
run through `pnpm perf:bundle`.

---

## 4. Running the test suite

### Run everything

```bash
pnpm test
```

Or invoke Vitest directly (equivalent, bypasses pnpm):

```bash
./node_modules/.bin/vitest run
```

Expected shape of a healthy run:

```
 Test Files  79 passed (79)
      Tests  417 passed (417)
   Duration  ~5s
```

### Watch mode (re-runs on save)

```bash
./node_modules/.bin/vitest
```

Leave it running while you work; it re-runs only affected tests. Press `q` to quit.
This is interactive, so don't run it from a script or CI.

### Run one file

Pass any substring of the file path:

```bash
./node_modules/.bin/vitest run payroll-periods
./node_modules/.bin/vitest run src/lib/time-tracker/payroll-periods.test.ts
```

Both forms work — the argument is matched as a substring against test file paths.

### Run a whole directory

```bash
./node_modules/.bin/vitest run src/lib/server/__tests__
./node_modules/.bin/vitest run src/lib/time-tracker
```

### Run tests whose _name_ matches

Use `-t` to filter by the `describe`/`it` title instead of the filename:

```bash
./node_modules/.bin/vitest run -t "buildPayrollPeriods"
```

This still loads every test file, so the summary reports the rest as skipped — that is
normal, not a problem:

```
 Test Files  1 passed | 78 skipped (79)
      Tests  10 passed | 407 skipped (417)
```

### Run only what changed (fast feedback)

```bash
./node_modules/.bin/vitest run --changed
```

Compares against git history, so it needs a reasonably complete checkout to be useful.

### Inspect a failure with full detail

```bash
./node_modules/.bin/vitest run --reporter=verbose src/lib/server/__tests__/rbac-permissions.test.ts
```

### Produce machine-readable evidence

Useful for attaching proof to a report or a PR:

```bash
./node_modules/.bin/vitest run --reporter=junit --outputFile=test-results.xml
```

This writes a JUnit XML file with per-test `tests`/`failures`/`errors` counts.
Other available reporters: `default`, `basic`, `verbose`, `dot`, `json`, `tap`,
`github-actions`.

---

## 5. Running the other layers

### Types

```bash
pnpm typecheck
```

Runs `tsc --noEmit`. Because `tsconfig.json` includes `**/*.ts`, this type-checks the
whole repo — source, tests, and config files.

### Lint

```bash
pnpm lint
```

Runs `eslint src perf --ext .ts,.tsx --max-warnings 0`. The zero-warning policy means a
warning fails exactly like an error.

To auto-fix what can be fixed:

```bash
pnpm check
```

### Formatting

```bash
pnpm format          # check only (fails if unformatted)
./node_modules/.bin/prettier --write .   # rewrite every file
```

The pre-commit hook normally handles this; you only need it if a commit slipped through
with `--no-verify`.

### React diagnostics

```bash
pnpm doctor
```

Advisory only — it reports a score and issue counts but does not block a merge.

### Performance budgets

Two different things, and the distinction matters:

```bash
pnpm test                        # fast guard: no build, runs in <1s
pnpm perf:bundle                 # real asset budgets: needs a build first
pnpm perf:ci                     # does the build, then the budgets
```

If you run `pnpm perf:bundle` without building first, it exits with an error telling you
to run `pnpm build`. Full detail on budgets is in [perf/README.md](perf/README.md).

---

## 6. Understanding the result

**Exit codes are what CI reads.** `0` = pass, non-zero = fail. Note that a filter
matching _no_ tests also exits `1` — useful to know when you typo a filename.

| Output you will see                        | Meaning                                               |
| ------------------------------------------ | ----------------------------------------------------- |
| `✓` next to a test                         | Passed                                                |
| `×` next to a test                         | Failed — the diff below it shows expected vs received |
| `↓` next to a test                         | Skipped (`.skip` / `.todo`) — **not** a pass          |
| `Test Files  N passed` / `Tests  N passed` | The summary line to quote as evidence                 |

**Quote the summary line, not a screenshot.** `Tests  417 passed (417)` is the artefact
that proves a suite ran; a green checkmark image proves nothing on its own.

### Current expected baseline

As of commit `2f673ed` plus the performance-gate work:

| Check              | Expected                       |
| ------------------ | ------------------------------ |
| `pnpm test`        | 79 files, **417 tests passed** |
| `pnpm typecheck`   | Clean, exit 0                  |
| `pnpm lint`        | Clean, exit 0                  |
| `pnpm perf:bundle` | All budgets satisfied, exit 0  |

If you see _fewer_ tests than this, you have probably run a filtered subset. If you see a
_failure_, do not assume it is pre-existing — check `git stash` first.

---

## 7. Troubleshooting

### `pnpm: EPERM: operation not permitted, mkdir '.../Library/pnpm/.tools/...'`

pnpm cannot write its own home directory. This happens in restricted/sandboxed
environments (including some agent environments). **It is not a problem with the repo,
and it does not mean the tests are broken.**

**Fix — point pnpm's home inside the project (verified working):**

```bash
export PNPM_HOME="$PWD/.pnpm-home"
pnpm test
```

The repo already contains a `.pnpm-home/` directory, so this works immediately. Add the
export to your shell profile if you hit this regularly. Note `$PWD` must be the repo
root when you set it.

**Workaround — call the binaries directly**, which is exactly what the pnpm scripts wrap:

```bash
./node_modules/.bin/vitest run
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/eslint src perf --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/prettier --check .
node perf/bundle-budget.mjs
```

### `close timed out after 10000ms` / `something prevents Vite server from exiting`

Harmless. Vitest prints this **after** the results, once all tests have already been
reported. It happens because the Vite plugin stack (TanStack Start, Sentry) keeps a
handle open. Judge the run by the `Tests  N passed` line and the exit code — the exit
code is still `0`.

If it bothers you, add `--reporter=hanging-process` to see what is holding the process
open. It does not affect results.

### `vitest list` hangs or times out

Do not use `vitest list` to enumerate tests in this repo — booting the full Vite config
is slow and the command has been observed to hang past 60 s. Use a path filter
(§4) instead.

### `Cannot find module` on a `#/...` path in a test

Both the `#/` alias and relative imports work in tests (`resolve.tsconfigPaths` is
enabled in `vite.config.ts`). If a `#/` import fails, check the path against
`tsconfig.json`'s mapping: `#/*` → `./src/*`.

### A component test fails with `document is not defined`

The Vitest default environment is **`node`**, not `jsdom`. Any test rendering React must
opt in on **line 1** of the file:

```ts
// @vitest-environment jsdom
```

24 of the 79 test files do this. A missing pragma is the most common cause of this error.

### A test passes today but fails tomorrow, with no code change

You have hit a wall-clock dependency. Any test asserting on `new Date()` without an
injected fixed date is a time bomb — it will break once real time passes some hardcoded
boundary. Pass an explicit `now`/fixed date instead. This exact bug took the suite down
before (see `payroll-periods.test.ts`).

### `db:seed` fails

Known issue: `package.json`'s `db:seed` points at `src/db/seed.ts`, **which does not
exist**. No test depends on it, so it does not affect the suite. Fix it if you need
seeded data.

---

## 8. What cannot be run locally yet

These are real gaps. Do not expect them to work:

| Not available                  | Why                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| **End-to-end browser tests**   | Playwright is installed and Chromium is cached, but there is no config and no `e2e/` suite. |
| **Code coverage**              | `@vitest/coverage-v8` is not installed, and no thresholds are configured.                   |
| **API latency benchmarks**     | Not implemented.                                                                            |
| **Load / concurrency testing** | Not implemented; would need a live database and seeded fixtures.                            |
| **Database-dependent tests**   | No tests touch `#/db`. Any that did would need a real Neon instance.                        |

Manual testing (layer 7) is the only current coverage for full user flows. Its template
and status vocabulary are in [docs/manual-test-report.md](docs/manual-test-report.md).

---

## 9. What CI runs

`.github/workflows/check.yml` has two jobs, both on every PR and on pushes to `main`:

**`check`** — `pnpm install --frozen-lockfile` → `typecheck` → `lint` → `test` → `build`

**`performance`** — `pnpm install --frozen-lockfile` → `pnpm perf:ci` (build + bundle budgets)

A separate `React Doctor` workflow runs react-doctor and posts a scoring comment; it is
advisory and does not block.

**CI does not run `pnpm format`.** Prettier is enforced only by the pre-commit hook, so a
commit made with `--no-verify` can land misformatted code that CI accepts.

### Reproducing CI exactly, locally

```bash
pnpm check-all   # typecheck + lint + test
pnpm perf:ci     # build + performance budgets
```

Those two commands together cover both CI jobs.

---

## 10. Pre-commit hook

`.husky/pre-commit` runs `pnpm exec lint-staged`, which on staged `.ts`/`.tsx` files
runs `eslint --fix --max-warnings 0` and `prettier --write`.

There is **no pre-push hook**, so tests do not run automatically before a push. Run
`pnpm check-all` yourself.

If the hook blocks you and you are certain the change is fine, `git commit --no-verify`
skips it — but CI will still enforce typecheck, lint, and tests.

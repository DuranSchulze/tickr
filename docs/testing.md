# Testing Guide

How testing works in Tickr, how each kind of test is labelled, and where a new test
belongs.

> **Just want to run the tests?** See [TEST.md](../TEST.md) for copy-paste commands,
> expected output, troubleshooting, and the current pass baseline. This document
> explains the _why_ and the _conventions_; TEST.md is the _how_.

The short version: there are **seven layers**, and they are not interchangeable. Each
one answers a different question, runs at a different time, and has a different
convention for labelling its results. Most confusion about "where does this test go"
comes from not knowing which layer owns the failure.

---

## 1. The seven layers at a glance

| #   | Layer              | Tool                        | Command            | Question it answers                 | Runs when        | Blocks merge?  |
| --- | ------------------ | --------------------------- | ------------------ | ----------------------------------- | ---------------- | -------------- |
| 1   | Formatting         | Prettier                    | `pnpm format`      | Is the code shaped consistently?    | pre-commit only  | Via pre-commit |
| 2   | Lint               | ESLint 9 (flat config)      | `pnpm lint`        | Are there code-level errors/smells? | pre-commit + CI  | Yes            |
| 3   | Types              | TypeScript (`tsc --noEmit`) | `pnpm typecheck`   | Does the code type-check?           | CI               | Yes            |
| 4   | React diagnostics  | react-doctor                | `pnpm doctor`      | Is the React code well-built?       | CI (PR)          | Advisory       |
| 5   | Unit / integration | Vitest 3 + jsdom            | `pnpm test`        | Does the logic behave correctly?    | CI (and by hand) | Yes            |
| 6   | Performance        | Custom budget gate          | `pnpm perf:bundle` | Did the bundle get heavier?         | CI               | Yes            |
| 7   | Manual             | Human, on a real build      | —                  | Does it actually work for a person? | Before release   | By convention  |

**Reading the "Runs when" column honestly:** there is no pre-push hook — the only hook
is `pre-commit` (`.husky/pre-commit` → `pnpm exec lint-staged`). Prettier runs _only_
there. CI does **not** run `pnpm format`, so a commit made with `--no-verify` can land
misformatted code that CI will happily accept. Defect #1 in §11.

`pnpm check-all` chains layers 2, 3, and 5 — the three that must pass for a change to
be mergeable in normal work.

**Two things this repo does _not_ use**, despite being common elsewhere:

- **No oxlint, no Biome.** Linting is ESLint 9 with a flat config
  (`eslint.config.js`), built on `@tanstack/eslint-config`. Rust-based linters are not
  present in `package.json`.
- **No React ESLint plugin.** `@tanstack/eslint-config` defines **zero** `react/*`
  rules — verified by inspecting the resolved config. React-specific diagnostics come
  entirely from layer 4 (react-doctor). Do not expect `eslint` to catch a missing
  dependency array or a hooks-order violation.

---

## 2. Layer 1 — Formatting (Prettier)

**Owner of:** whitespace, quotes, semicolons, line width, markdown table alignment.

- Config: `prettier.config.js`
- Check only: `pnpm format`
- Auto-fix everything: `pnpm check`

**Labelling:** there is no "label". It either conforms or it does not. Prettier is
intentionally non-negotiable — do not argue style in review, change
`prettier.config.js` if the rule itself is wrong.

Pre-commit runs `prettier --write` on staged files, so formatting failures normally
never reach CI.

---

## 3. Layer 2 — Lint (ESLint)

**Owner of:** code-level errors — unused variables, unreachable branches, unsafe
optional chaining, duplicate cases, `import` ordering, type-import consistency,
naming conventions.

- Config: `eslint.config.js` flattening `@tanstack/eslint-config`
- Run: `pnpm lint` → `eslint src perf --ext .ts,.tsx --max-warnings 0`
- Auto-fix: `pnpm check`

**Type-aware.** The resolved config sets `parserOptions.project: true`, so rules can
use type information. That makes lint slower but catches more than a syntax-only pass.

**Plugins in play:** `@typescript-eslint`, `import`, `node`, `@stylistic`, plus ESLint
core. No React plugin (see §1).

### The zero-warning policy is the point

`--max-warnings 0` means a _warning_ fails the build exactly like an error. This is
deliberate: it prevents a backlog of tolerated warnings from accumulating. If you need
to silence a rule, justify it locally with a comment and a reason, or disable it
narrowly in `eslint.config.js` with an explanatory comment — the existing overrides for
`src/lib/server/**` and `src/components/ui/map.tsx` are the pattern to copy.

**Labelling:** errors are labelled `error`, warnings would be labelled `warning` — but
because of `--max-warnings 0`, treat every lint message as blocking.

---

## 4. Layer 3 — Types (TypeScript)

**Owner of:** type errors, nullability, unused locals/parameters, exhaustive switches,
missing side-effect imports.

- Config: `tsconfig.json`
- Run: `pnpm typecheck` → `tsc --noEmit -p tsconfig.json`
- Strictness: `strict`, `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`

**Why this is a separate layer from lint:** TypeScript and ESLint overlap but are not
the same. `tsc` is the authority on whether types are correct; ESLint adds
type-_aware style and correctness_ rules on top. A change can pass one and fail the
other, so both run in CI.

**Labelling:** TypeScript labels diagnostics `error` (type errors) and `warning`
(rare, mostly deprecated-API notices). In this config, `noUnusedLocals` and
`noUnusedParameters` mean dead code is an **error**, not a warning.

**Gotcha:** `tsconfig.json` includes `**/*.ts` across the repo, so _everything_ —
including `perf/*.test.ts` and config files — is type-checked. A type error anywhere
fails `pnpm typecheck`.

---

## 5. Layer 4 — React diagnostics (react-doctor)

**Owner of:** React-specific quality — security, performance, correctness,
accessibility, bundle size, architecture. This is the layer that catches what ESLint
deliberately does not.

- Config: `doctor.config.json`
- Run: `pnpm doctor` (local), `millionco/react-doctor@v2` (CI)
- Workflow: `.github/workflows/react-doctor.yml`

**Advisory, not blocking.** The CI action's `blocking` knob is commented out, so it
defaults to reporting rather than gating. It posts a sticky PR comment with a health
score and a commit status. Treat a score drop as a review prompt, not a build failure.

**Labelling:** react-doctor reports a **score** plus **error/warning counts** per
category. Repo-specific rule overrides live in `doctor.config.json` — currently
`no-danger` and `only-export-components` are off, and three files have targeted
`no-adjust-state-on-prop-change` overrides. Copy that shape if you need an exception.

---

## 6. Layer 5 — Unit & integration (Vitest)

**Owner of:** business logic, pure functions, component behaviour, server-side rules,
permission gates. This is the largest and most important layer.

- Runner: Vitest 3, `pnpm test` → `vitest run`
- Environment: **node by default**
- 79 test files, 417 tests

### There is no `vitest.config.ts` — and that matters

Vitest falls back to its built-in defaults. Consequences you must know:

1. **The default environment is `node`, not `jsdom`.** Any test rendering React must
   opt in on line 1 of the file:
   ```ts
   // @vitest-environment jsdom
   ```
   24 of 79 files currently do this. A component test that "cannot find document" is
   almost always a missing pragma, not a broken component.
2. **No setup file, no globals.** Import what you need explicitly:
   ```ts
   import { describe, expect, it } from 'vitest'
   ```
   There is no global `test`/`expect`, and no shared `setupFiles` to register
   matchers or jsdom shims.
3. **No coverage thresholds.** Coverage is not measured or enforced today.

### Where test files live

Colocated next to the code they test. The `__tests__/` folder is used only when a
directory has many test files; otherwise the file sits beside its subject.

| Location                                   | Count | What lives there                                   |
| ------------------------------------------ | ----- | -------------------------------------------------- |
| `src/lib/server/__tests__/`                | 25    | Server rules: RBAC, billing, API keys, analytics   |
| `src/lib/time-tracker/`                    | 15    | Pure domain logic: timesheet, export, KPI, payroll |
| `src/components/time-tracker/**`           | 27    | Component behaviour across screens and features    |
| `src/components/ui/`, `src/lib/`           | 4     | Shared UI and utilities                            |
| `perf/`                                    | 1     | Performance budget guard (see §7)                  |
| `src/lib/server/tracker/shared/__tests__/` | 1     | Shared tracker helpers                             |

Two import styles are in use and both work: the `#/` alias (`#/lib/time-tracker/types`)
and relative paths (`./entries-grouping`). Match the file you are editing.

### Labelling conventions inside a test file

- **`describe`** names the subject — usually the function or the feature area:
  `describe('buildPayrollPeriods', ...)`, `describe('workspace API key validation', ...)`.
- **`it`** names the behaviour as a sentence completing "it …":
  `it('splits a single-cutoff month into 1–15 and 16–month-end', ...)`.
- **Never assert on wall-clock time.** Pass an explicit `now`/fixed date. A test that
  depends on the real clock is a time bomb — it passes today and fails later for
  reasons unrelated to the change. `payroll-periods.test.ts` was exactly this bug.

**Result labelling** is Vitest's own: `✓` pass, `×` fail, `↓` skipped. The summary line
(`Test Files  N passed`, `Tests  N passed`) is the artefact to quote as evidence.

---

## 7. Layer 6 — Performance budgets

**Owner of:** build-output size. Answers "did this change make the app heavier?"

- Guard (fast, no build): `perf/bundle-budget.test.ts` — runs inside `pnpm test`
- Gate (real assets): `pnpm perf:bundle` — needs `pnpm build` first
- Full CI gate: `pnpm perf:ci` → `pnpm build && pnpm perf:bundle`
- Budgets: `perf/bundle-budget.config.json`; full detail in `perf/README.md`

**Labelling:** each budget prints `PASS`, `PASS (near limit)` (above 90% of the limit),
or `FAIL (+N KB)`. The command exits `1` on any `FAIL`. Budget keys are labelled by
what they protect — an initial-load route budget, a per-route budget, or a named chunk
budget (`maplibre-gl chunk`, `exceljs chunk`).

This layer is documented separately because it has its own conventions for raising
limits; see `perf/README.md`.

---

## 8. Layer 7 — Manual testing

**Owner of:** what automation cannot reach — real sign-in, real payments, email
delivery, the browser extension, and the judgement call of "does this feel right".

- Document and template: `docs/manual-test-report.md`
- When: before a release or after a change that automation cannot verify

### How manual results are labelled

Each case carries a **stable ID** with an area prefix, so a result can be cited later
without re-describing it:

| Prefix  | Area                            |
| ------- | ------------------------------- |
| `AUTH-` | Authentication & onboarding     |
| `TT-`   | Timer & time recording          |
| `TS-`   | Timesheet & entries             |
| `WS-`   | Workspace, members, catalogs    |
| `AN-`   | Analytics, performance, reports |
| `BI-`   | Billing                         |
| `API-`  | Public API                      |
| `EXT-`  | Browser extension               |
| `NG-`   | Negative, boundary, resilience  |

IDs are numbered within the area (`TT-01`, `TT-02`, …) and **never renumbered** — a
retired case keeps its number so old reports stay readable.

### Status vocabulary

Use exactly these four labels, and nothing looser:

| Status         | Means                                                                |
| -------------- | -------------------------------------------------------------------- |
| **Passed**     | Action, expected, and actual are all recorded and the actual matched |
| **Failed**     | Observed behaviour differed; a defect is filed                       |
| **Blocked**    | Could not be executed (environment, credentials, dependency)         |
| **Not tested** | Deliberately out of scope for this pass — say why                    |

**"Passed" has a bar.** A case may be labelled Passed only when all three are written
down: the **action** performed, the **expected** result, and the **actual** observed
result — with no workaround. Vague claims like "timer works" are not a Passed result.
The template enforces this with a one-line form:

> **[ID] — [Short name]** — Steps: … → Expected: … → Actual: … → **Passed**

### Severity vocabulary

For failures, use one of: **Blocker** (cannot ship), **Critical** (data loss, security,
or money), **Major** (feature unusable, workaround exists), **Minor** (cosmetic).

### Manual testing is not a substitute for automation

When a manual pass covers something automatable, add the automated test in the same
change. Manual passes are also expected to cite the automated evidence behind them —
`docs/manual-test-report.md` §9 lists which suites back each manual area. Production-only
checks (live payment callbacks, deployed cron, real inboxes, load limits) are
legitimately manual and should be recorded as such.

---

## 9. Where does my new test go?

| You are testing…                                 | Layer | Put it in…                                               |
| ------------------------------------------------ | ----- | -------------------------------------------------------- |
| A pure function, calculation, or date rule       | 5     | Beside the source file, `*.test.ts`                      |
| A React component's behaviour                    | 5     | Beside it, `*.test.tsx` + `// @vitest-environment jsdom` |
| A server rule (permissions, billing, validation) | 5     | `src/lib/server/__tests__/`                              |
| A heavy import leaking into the bundle           | 6     | Add to `heavyModules` in the perf config                 |
| A new size ceiling or route payload              | 6     | `perf/bundle-budget.config.json`                         |
| Something only verifiable by using the product   | 7     | `docs/manual-test-report.md`, new area-prefixed ID       |

**Not yet covered by any layer:** end-to-end browser flows (Playwright is installed but
has no config or suite), API latency, load/concurrency behaviour, coverage thresholds,
and dependency/security scanning. Treat these as known gaps, not as passing checks.

---

## 10. Running everything

```bash
pnpm format       # Prettier check          (layer 1)
pnpm lint         # ESLint, zero warnings  (layer 2)
pnpm typecheck    # tsc --noEmit           (layer 3)
pnpm doctor       # react-doctor           (layer 4)
pnpm test         # Vitest                 (layer 5)
pnpm perf:ci      # build + budget gate    (layer 6)
pnpm check-all    # layers 2 + 3 + 5, the mergeable bar
```

`pnpm test` also runs the performance guard from layer 6, because that guard needs no
build. The full asset budgets only run via `pnpm perf:ci`.

**pnpm cannot run in every sandbox.** In a restricted environment pnpm fails with
`EPERM` while creating its home directory. Run the underlying binaries directly
instead — `./node_modules/.bin/vitest run`, `./node_modules/.bin/eslint src perf --ext
.ts,.tsx --max-warnings 0`, `./node_modules/.bin/tsc --noEmit -p tsconfig.json`.

**Vitest may print "close timed out after 10000ms"** after the results. This is a known
shutdown quirk, not a test failure — judge the run by the `Tests  N passed` line and
the exit code.

---

## 11. Honest limitations

1. **CI never runs `pnpm format`.** Prettier is enforced only by the pre-commit hook, so
   `git commit --no-verify` can land misformatted code and CI will pass it. Adding
   `pnpm format` to `.github/workflows/check.yml` would close this in one line.
2. **Layers 2–3 are not enforced if hooks are bypassed** (`git commit --no-verify`), but
   CI re-runs them, so they remain the real gate. The local layers are speed, not truth.
3. **Layer 4 is advisory.** A react-doctor regression will not stop a merge today.
4. **Layer 5 has no coverage floor,** so untested code can be added freely as long as
   the suite stays green.
5. **Layer 6 measures bytes, not time.** A bundle that is small can still be slow; it
   says nothing about runtime latency.
6. **Layer 7 depends on a human being honest** about the Passed bar. The template makes
   that easier, not automatic.
7. **Nothing verifies the app end-to-end.** The chain sign-in → timer → report → export
   is only checked by hand.

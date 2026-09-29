# Automated Performance Testing

This directory contains the automated performance gate for the Tickr client bundle.
It exists so a bundle regression fails a pull request instead of reaching production
unnoticed.

## What runs, and when

| Command            | What it does                                                      | Needs a build? | Needs a DB? |
| ------------------ | ----------------------------------------------------------------- | -------------- | ----------- |
| `pnpm test`        | Runs `perf/bundle-budget.test.ts` — the static import guard       | No             | No          |
| `pnpm perf:bundle` | Measures `.output/public` against the budgets and prints a report | Yes            | No          |
| `pnpm perf:ci`     | `pnpm build && pnpm perf:bundle` — the full CI gate               | Builds it      | No          |

CI runs both. `.github/workflows/check.yml` executes the unit tests (including the
static guard) in the `check` job and `pnpm perf:ci` in the `performance` job, so a
budget failure is reported as its own failed check rather than hidden inside the
correctness job. The build needs no secrets, so the job stays credential-free — it
does not touch the production database.

## The two mechanisms

**1. Static import guard** — `bundle-budget.test.ts`

A dynamic `import()` keeps a library in its own lazy chunk. A static `import` drags
it into whatever chunk first references it. The guard walks `src/`, finds every file
that statically imports one of the heavy modules listed in
`bundle-budget.config.json`, and fails unless that file is explicitly allow-listed.

This is the fast guard: it runs in milliseconds as part of the normal test suite, so
a developer learns about the regression before pushing.

**2. Real asset measurement** — `bundle-budget.mjs`

This reads the assets `vite build` actually emitted and compares them to the budgets.
It uses the generated TanStack Start manifest (`.output/server/*tanstack-start-manifest*`)
to know which chunks each route preloads, which is what makes route-level budgets
meaningful. Initial load is the `__root__` preload set — the bytes every page view pays.

## Measured baseline

Measured at commit `2f673ed` on a clean `vite build` (gzipped, level 9). The build is
deterministic: a clean rebuild reproduces identical hashes and identical byte counts.

| Measurement                      | Baseline  | Budget  |
| -------------------------------- | --------- | ------- |
| Initial load (every page)        | 219.0 KB  | 250 KB  |
| Total emitted JS + CSS           | 1734.7 KB | 1950 KB |
| Largest single chunk (`exceljs`) | 248.3 KB  | 400 KB  |
| `/app/workspace/locations` route | 270.5 KB  | 300 KB  |
| `/auth/` route                   | 145.4 KB  | 165 KB  |
| `/app/time-tracker/` route       | 127.4 KB  | 150 KB  |
| maplibre-gl chunk                | 244.9 KB  | 270 KB  |
| exceljs chunk                    | 248.3 KB  | 275 KB  |
| jspdf chunk                      | 125.5 KB  | 140 KB  |
| three.js chunk                   | 115.2 KB  | 130 KB  |
| recharts chunk                   | 102.4 KB  | 115 KB  |

There are 257 emitted JS/CSS assets across 38 routes.

## What the baseline already tells us

Two findings worth acting on, both visible in the numbers above:

- **`/auth/` (the sign-in page) ships 145 KB, of which ~115 KB is three.js.** It is a
  decorative background (`src/components/marketing/ColorBends.tsx`, statically imported
  at `src/routes/auth/index.tsx`). Loading a 3D renderer to sign in is the single
  clearest remaining win in this bundle.
- **`/app/workspace/locations` is the heaviest route at 270 KB** because it pulls
  maplibre-gl. This is correct today — the map is genuinely used there, and the initial
  load does _not_ include maplibre (an earlier claim that maplibre was eager in the
  authenticated shell was wrong; the build graph disproves it).

## Changing a budget

Budgets are set roughly 8-15% above the measured baseline: ordinary growth passes, a
heavy library leaking into new code fails. When a limit genuinely needs to move:

1. Raise it in `bundle-budget.config.json` in the same PR that changes the bundle.
2. Explain why in the PR description.
3. Record the new measured number in the table above.

Never raise a budget to silence a regression you have not understood. A budget that no
longer reflects a deliberate decision protects nothing.

## Deliberately out of scope

This gate covers **build output size**, which is deterministic, needs no server or
database, and catches the most common performance regression. It does not measure:

- **runtime latency** — API response times, database query cost;
- **real user metrics** — LCP, CLS, interactivity;
- **load behaviour** — throughput and p95 under concurrency.

Those are real gaps. API latency and load testing in particular would need a live
database and seeded fixtures, and `package.json`'s `db:seed` currently points at
`src/db/seed.ts`, which does not exist. Adding them is a separate, larger piece of work.

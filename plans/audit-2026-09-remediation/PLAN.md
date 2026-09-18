# Audit 2026-09 Remediation — Index and Sequencing

> **Status:** 📋 Planned

> **Consolidation note (2026-09-18):** five plans from this audit's tiers have since been absorbed and their folders deleted — `dashboard-live-total-recompute` and `stabilize-active-entry-identity` into `plans/time-recording-performance/` (Phases 6 and 5), and `remove-redundant-database-round-trips`, `await-serverless-background-writes`, `fix-overlap-cancel-bug` into `plans/server-write-reliability/` (Parts B, A, C — full original text preserved there). The §5 plan tree and §11 sequencing below are annotated with the new locations.

## Status

- [ ] Triage: decide which findings are verification-only and which are scheduled for a fix.
- [ ] Resolve the P0 blockers (4 plans + the failing test).
- [ ] Complete the verification sweeps that need production access.
- [ ] Land the index/migration work.
- [ ] Work through the client performance plans.
- [ ] Work through the serverless reliability plans.
- [ ] Work through the security and correctness plans.
- [ ] Batch the low-severity quick fixes.
- [ ] Re-run the audit's high-value checks to confirm nothing regressed.

## Verify First (No Code Change)

This plan is the entry point to an audit, so "verify first" here means triaging the _whole set_ before committing engineering time. Do this before opening any of the sibling plans.

- [ ] **Run the baseline and record the numbers, so later changes have a reference point.**
      `bash
  ./node_modules/.bin/tsc --noEmit -p tsconfig.json
  npx eslint src --ext .ts,.tsx --max-warnings 0
  ./node_modules/.bin/vitest run
  NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
  `
      Baseline as of this audit: typecheck clean, lint clean, **1 failing test** (`src/lib/time-tracker/payroll-periods.test.ts`, date-dependent — see `plans/fix-payroll-period-test-time-bomb`), and a client bundle whose two largest chunks are `exceljs.min` (930 KB raw / 256 KB gzip) and `useAppTheme-D-ys7bb4.js` (971 KB raw / 251 KB gzip, which is MapLibre — see `plans/dashboard-bundle-maplibre-lazy-load`).

- [ ] **Settle the questions that change severity, because several findings are "critical if X, minor if not".** These need production or dashboard access and cannot be answered from source: - Does any real payment exist? (`subscriptions` vs `subscription_payments` counts) — decides whether `plans/fix-neon-http-transaction-failure` is a bug fix or a live incident. - Has the Google Sheets cron ever run? (`SELECT count(*) FROM pending_gsheets_syncs`, plus Vercel Cron logs for 405s) — decides whether `plans/fix-gsheets-cron-http-method` is latent or an active data-sync outage. - Does the default EMPLOYEE role hold `activity.view` / `members.view`? — decides whether `plans/department-analytics-authorization` is an access-control bypass or an inconsistency. - Has the newsletter endpoint been driven in a loop? (hourly subscribe counts + provider send volume) — decides whether `plans/newsletter-subscribe-dedupe` needs incident handling. - Has `/api/import/stream` been reached cross-origin? (audit log entries nobody initiated) — decides whether `plans/import-stream-csrf-bypass` needs forensic review. - How does Vercel treat a client-supplied `x-forwarded-for`? — decides the severity of the client-IP item in `plans/quick-fix/server-hygiene.md`.

- [ ] **Decide in advance which findings are check-only and will NOT be fixed now.** The audit deliberately recorded several items as latent or unverified, and those should be consciously deferred rather than silently dropped: - `trackerKeys.state` has no `workspaceId`, but no leak exists because every workspace switch performs a hard navigation. Harden cheaply; do not treat as urgent. - `vercel.json`'s `/_build/(.*)` Cache-Control rule is vestigial, but immutable caching **is** correctly applied via Nitro's generated `/assets/(.*)` rule. There is no bug to fix. Do not "fix" it. - `createTask` / `deleteTask` skipping the catalog permission may be intentional (`README.md:8` documents "all workspace roles can manage tasks"). Resolve the policy question before changing behaviour. - `config({ path: '.env.local' })` at module scope in `src/db.ts` loads dotenv in production. Impact unmeasured; check before changing.

- [ ] **Confirm which findings a single reviewer can action without a product decision.** The plans in Tier 2 and Tier 3 below are largely mechanical; Tier 4 contains the items that need a stakeholder answer first.

## 1. Goal

Provide a single entry point for the findings from the September 2026 system audit, with each problem given its own plan and an explicit split between what can be verified now and what must be changed.

The audit covered five surfaces — server authorization, the database and query layer, HTTP/API reliability, the React client, and build configuration — and produced findings ranging from a broken payment path to one-line index additions. This plan does not restate them; it sequences them, records their dependencies, and states which are check-only.

## 2. Context Summary

The audit was read-only and produced no code changes. Evidence base:

- Static reading of the full `src/` tree (~98k LOC across ~550 TypeScript files).
- Two production-style builds (`node-server` and `vercel` presets) to inspect real chunk graphs, the generated `.vercel/output/config.json`, and asset paths.
- The existing toolchain: `tsc`, `eslint`, `vitest` (375 tests), and migration files under `drizzle/`.
- Four parallel deep-dive passes, with every P0/P1 claim subsequently re-verified by hand in the source and in build output.

Findings were recorded with file paths and line numbers, and each was labelled with a confidence level. Where a claim could not be verified without production access — the Vercel cron HTTP method, `x-forwarded-for` handling, and whether the payment paths are reachable — that limitation is preserved in the relevant plan rather than being smoothed over.

**Things the audit explicitly found clean**, so they should not be re-investigated: public-API tenant scoping, external-API JWT verification, Xendit webhook authentication, catalog CRUD scoping, time-entry mutation scoping, the RBAC helper set, SQL-injection safety (all `sql` templates are parameterised and `db.execute` is unused), API-key hashing, developer password hashing, performance share tokens, `requireWorkspaceAccess`'s per-request `WeakMap` cache, `resolveEntryRateMap`'s batched rate resolution, React interval/listener cleanup discipline, route-level code splitting, and lazy loading of every heavy library except MapLibre.

## 3. Scope

**Included.**

- `[FIX]` Twenty-four sibling remediation plans covering every P0–P2 finding from the audit.
- `[FIX]` Three `quick-fix/` files covering the P3 findings.
- `[CHECK]` The verification sweeps listed in Verify First, which gate the severity of six findings.
- `[CHECK]` A record of the four items deliberately deferred as latent or policy-dependent.

**Excluded.**

- Re-auditing areas the audit found clean (listed in Context Summary).
- Any new feature work.
- Changing the product's permission model, which `plans/department-analytics-authorization` depends on but does not own.

## 4. Out of Scope

- Findings with no verified impact that were recorded only as observations. Notably the `did it work or not` uncertainty around whether `streaming-import.server.ts` has been superseded by `catalog-sync.server.ts` — that plan leads with the deletion decision rather than assuming optimization is wanted.
- Performance work on paths the audit found correctly implemented, including the paginated reports/analytics/timesheet tables (correctly unvirtualized because they are server-paginated) and the `TaskSyncCoordinator` polling design (correctly coalesced and visibility-gated).
- Dependency upgrades, formatting, or unrelated refactors.
- Restating the audit report itself. Each plan carries the detail it needs.

## 5. Affected Files and Folders

```txt
plans/
  README.md                                                    (no change —
                                                                convention guide)

  audit-2026-09-remediation/
    PLAN.md                                                    (NEW) ← this file

  ── Tier 0: P0, fix immediately ──────────────────────────────
  fix-neon-http-transaction-failure/PLAN.md                    (NEW)
  department-analytics-authorization/PLAN.md                   (NEW)
  import-stream-csrf-bypass/PLAN.md                            (NEW)
  newsletter-subscribe-dedupe/PLAN.md                          (NEW)
  fix-payroll-period-test-time-bomb/PLAN.md                    (NEW)

  ── Tier 1: highest impact, lowest risk ──────────────────────
  add-missing-database-indexes/PLAN.md                         (NEW)
  tracker-pulse-query-scaling/PLAN.md                          (NEW)
  dashboard-bundle-maplibre-lazy-load/PLAN.md                  (NEW)
  ~~dashboard-live-total-recompute/PLAN.md~~                   (ABSORBED 2026-09-18 →
                                                                time-recording-performance Phase 6)
  ~~stabilize-active-entry-identity/PLAN.md~~                  (ABSORBED 2026-09-18 →
                                                                time-recording-performance Phase 5)

  ── Tier 2: reliability and query efficiency ─────────────────
  workspace-authorization-refetch-storm/PLAN.md                (NEW)
  intl-formatter-and-timesheet-render-cost/PLAN.md             (NEW)
  ~~remove-redundant-database-round-trips/PLAN.md~~            (ABSORBED 2026-09-18 →
                                                                server-write-reliability Part B;
                                                                timer slice → time-recording-performance Phase 2)
  bound-unbounded-query-result-sets/PLAN.md                    (NEW)
  ~~await-serverless-background-writes/PLAN.md~~               (ABSORBED 2026-09-18 →
                                                                server-write-reliability Part A;
                                                                stop-path slice → time-recording-performance Phase 2)
  gsheets-write-integrity/PLAN.md                              (NEW)
  fix-gsheets-cron-http-method/PLAN.md                         (NEW)
  import-pipeline-performance/PLAN.md                          (NEW)
  external-call-timeouts-and-auth/PLAN.md                      (NEW)

  ── Consolidated plans added after this audit ────────────────
  time-recording-performance/PLAN.md                           (NEW 2026-09-18 — record-a-task
                                                                journey; absorbed 2 Tier-1 + slices
                                                                of 2 Tier-2 plans; see its §0.4)
  server-write-reliability/PLAN.md                             (NEW 2026-09-18 — mother plan holding
                                                                the full text of the 3 absorbed
                                                                Tier-2 plans' remaining scope)

  ── Tier 3: security and correctness ─────────────────────────
  require-email-verification-for-membership-claim/PLAN.md      (NEW)
  task-catalog-permission-and-project-validation/PLAN.md       (NEW)
  prevent-duplicate-active-timers/PLAN.md                      (NEW)
  service-worker-asset-cache-path/PLAN.md                      (NEW)
  workspace-access-hardening/PLAN.md                           (NEW)

  ── Tier 4: low severity, batched ────────────────────────────
  quick-fix/
    workspace-and-timer-correctness.md                         (NEW)
    client-memory-and-formatting.md                            (NEW)
    server-hygiene.md                                          (NEW)
```

## 6. Database Design

N/A for this index plan. Two sibling plans carry schema work and are the only ones that do:

- `plans/add-missing-database-indexes` — additive indexes plus re-creating a dropped trigram index, delivered as one migration.
- `plans/prevent-duplicate-active-timers` — a partial unique index, which **requires pre-existing duplicate cleanup before it can be applied** or the migration will fail.

No plan in this set requires a destructive migration or a data backfill beyond that one cleanup. Confirm the standard parity workflow (`schema.ts` ↔ `drizzle/`) is followed, and note `db:push` exists — a schema-declared index that never reaches a migration file will not exist in production.

## 7. Backend Implementation

N/A — this plan sequences work rather than describing implementation. Each sibling plan contains its own backend section.

## 8. Frontend Implementation

N/A — see Section 7.

## 9. Access Control

N/A — see Section 7. Two sibling plans change access behaviour and carry their own matrices: `plans/department-analytics-authorization` and `plans/require-email-verification-for-membership-claim`.

## 10. Validation

Validate the set as a whole, not just individual plans.

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> Note: `pnpm <script>` currently fails in this environment with `EPERM: operation not permitted, mkdir '~/Library/pnpm/.tools/...'`. Use the direct binaries.

Regression checks for the set:

1. All 375 existing tests pass, and the payroll-periods test is fixed rather than skipped.
2. Client bundle comparison against the baseline: `useAppTheme-*.js` should no longer appear in the `/app/time-tracker` route's preload list after `plans/dashboard-bundle-maplibre-lazy-load`.
3. A signed-in EMPLOYEE sees only their own data on every analytics surface.
4. The app's own Google Sheets import and export flows still complete end to end.
5. Billing checkout completes in the Xendit sandbox, including a replayed webhook.
6. Timer start/stop still works with the network offline and on reconnect.

## 11. Sequencing

Ordering is by (impact ÷ risk), with dependencies respected. Each tier should be shippable on its own.

**Tier 0 — P0. Do first.**

- [ ] `fix-payroll-period-test-time-bomb` — one line; unblocks a green CI for everything after it.
- [ ] `fix-neon-http-transaction-failure` — a live payment path is broken; nothing else has this cost.
- [ ] `department-analytics-authorization` — verified data exposure including compensation rates.
- [ ] `import-stream-csrf-bypass` — small diff against an existing pattern.
- [ ] `newsletter-subscribe-dedupe` — one-line core fix plus a CORS removal.

**Tier 1 — highest impact, lowest risk.**

- [ ] `add-missing-database-indexes` — additive; the best ratio in the set. Note `tracker-pulse-query-scaling` depends on the `updated_at` index added here, so land this first if the pulse fix ships as the counter approach.
- [ ] `tracker-pulse-query-scaling`
- [ ] `dashboard-bundle-maplibre-lazy-load` — ~250 KB gzip off three routes, one-file change.
- [ ] ~~`dashboard-live-total-recompute`~~ → **`time-recording-performance` Phase 6** (absorbed 2026-09-18).
- [ ] ~~`stabilize-active-entry-identity`~~ → **`time-recording-performance` Phase 5** (absorbed 2026-09-18).

**Tier 2 — reliability and query efficiency.**

- [ ] `workspace-authorization-refetch-storm` — highest user-visible latency win.
- [ ] `intl-formatter-and-timesheet-render-cost`
- [ ] ~~`remove-redundant-database-round-trips`~~ → **`server-write-reliability` Part B** (absorbed 2026-09-18) — note it edits the same queries as `department-analytics-authorization`; rebase on top of it rather than the reverse. Its timer-path slice is `time-recording-performance` Phase 2.
- [ ] `bound-unbounded-query-result-sets` — measure with `EXPLAIN (ANALYZE, BUFFERS)` before and after; the `AT TIME ZONE` grouping change may reduce bytes-on-wire without reducing the index scan.
- [ ] ~~`await-serverless-background-writes`~~ → **`server-write-reliability` Part A** (absorbed 2026-09-18) — decide the await-vs-queue policy once there, and have `newsletter-subscribe-dedupe` follow it. Its stop-path slice is `time-recording-performance` Phase 2.
- [ ] `gsheets-write-integrity`
- [ ] `fix-gsheets-cron-http-method` — cheap and zero-risk; could be promoted into Tier 0 if the verification shows the queue has never drained.
- [ ] `import-pipeline-performance` — starts with a delete-or-optimize decision.
- [ ] `external-call-timeouts-and-auth` — the shared `fetchWithTimeout` helper is best introduced once and adopted everywhere rather than per call site.

**Tier 3 — security and correctness, some needing a product decision.**

- [ ] `require-email-verification-for-membership-claim` — needs an onboarding decision first.
- [ ] `task-catalog-permission-and-project-validation` — the `projectId` validation is unconditional; the permission question needs a policy answer.
- [ ] `prevent-duplicate-active-timers` — needs the duplicate-cleanup review before the unique index can be applied.
- [ ] `service-worker-asset-cache-path` — verify the current SW behaviour before changing it, since a caching mistake here can white-screen installed users.
- [ ] `workspace-access-hardening`

**Tier 4 — batched.**

- [ ] `quick-fix/workspace-and-timer-correctness.md`
- [ ] `quick-fix/client-memory-and-formatting.md`
- [ ] `quick-fix/server-hygiene.md`

## 12. Risks & Considerations

| Risk                                                                                                              | Mitigation                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixing P0s in parallel causes conflicting edits in `subscriptions.server.ts` and the department analytics queries | Tier 0 plans touch different concerns; keep `remove-redundant-database-round-trips` (Tier 2) behind `department-analytics-authorization` (Tier 0) |
| A "critical" finding turns out to be latent once production is checked, wasting effort                            | Verify First gates every severity; do the triage sweep before scheduling Tier 1+                                                                  |
| Someone "fixes" a non-bug — specifically the vestigial `/_build/` cache rule, which looks broken but is not       | Recorded explicitly in Verify First and in `plans/service-worker-asset-cache-path`, which exists partly to prevent this                           |
| Tightening authorization or CSRF breaks a legitimate flow that was silently relying on the gap                    | Each affected plan exercises the legitimate path before and after, and names the specific caller to re-test                                       |
| A schema change is applied without cleaning pre-existing bad data                                                 | `prevent-duplicate-active-timers` requires duplicate detection and review before the unique index                                                 |
| The set is too large to land in one go and stalls                                                                 | Every plan is independently shippable; tiers exist so the work can stop cleanly at any boundary                                                   |
| Findings drift as the codebase moves                                                                              | Plans cite file:line as of the audit; re-verify line numbers when starting a plan rather than trusting them blindly                               |

## 13. Open Questions

- [ ] Which of the six severity-gating verification items can be answered now, and by whom?
- [ ] Is there a target release for Tier 0, and does billing need to be paused until `fix-neon-http-transaction-failure` lands?
- [ ] Who owns the product decisions in `plans/task-catalog-permission-and-project-validation` (task permissions), `plans/department-analytics-authorization` (manager visibility of rates), and `plans/require-email-verification-for-membership-claim` (verification vs. friction)?
- [ ] Should this audit be re-run on a schedule, and if so are the high-value checks worth encoding as automated tests (the `db.transaction` guard in particular)?
- [ ] Should the four deliberately-deferred items get a tracking issue, or is recording them in these plans sufficient?

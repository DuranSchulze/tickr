# Execution Order — Plans We Can Execute

> **Purpose:** the single ordered work queue for this directory. Each plan remains the source of truth for _what_ to build; this file owns _what order_ and _why_.
>
> **Status is taken from each plan's own badge and checkboxes, and is not all code-verified.** Where the plan was checked against the source, it is marked `✅✓`. Known-bad statuses are listed in §7.
>
> Generated 2026-09-18.

---

## 0. Ground rules

1. Waves are ordered by (impact ÷ risk), with dependencies respected. **Do not reorder across a `Depends on`.**
2. One plan per branch/PR. Every wave is independently shippable.
3. **Finish Wave 0 first.** The test suite is red until then, so every later "validation passed" is untrustworthy while the payroll test fails.
4. Effort: `S` ≈ hours · `M` ≈ a day · `L` ≈ multi-day.

---

## 1. Wave 0 — Unblock and close work in flight

| #   | Plan                                | What it is                                                                                                 | Effort | Depends on      | Status                             |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ | --------------- | ---------------------------------- |
| 1   | `fix-payroll-period-test-time-bomb` | Remove the wall-clock dependency from `payroll-periods.test.ts`; decide the silent 29–31 cutoff-day filter | S      | —               | 📋 not started — `✅✓` still fails |
| 2   | `entry-ip-location-tracking`        | Already built; finish the signed-in manual QA                                                              | S      | Dev credentials | 🟡 23/37                           |
| 3   | `performance-kpi-revamp`            | Already implemented in the working tree; signed-in acceptance QA, then badge it ✅                         | S      | —               | Implemented, unbadged              |
| 4   | `analytics-reports-differentiation` | Remaining differentiation work on the reports surface                                                      | M      | —               | 📋 3/13                            |

## 2. Wave 1 — P0: security and correctness

| #   | Plan                                 | What it is                                                                                                             | Effort | Depends on | Status                              |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ----------------------------------- |
| 5   | `fix-neon-http-transaction-failure`  | Both payment paths call `db.transaction()` on the neon-http driver, which throws unconditionally — 100% broken         | M      | —          | 📋 0/22 — `✅✓` 2 call sites remain |
| 6   | `department-analytics-authorization` | Three `department-dashboard.server.ts` functions expose all-member hours and per-member pay rates to any active member | M      | —          | 📋 0/25                             |
| 7   | `import-stream-csrf-bypass`          | `/api/import/stream` disables CSRF and coerces an unparseable body to `type: 'all'`                                    | S      | —          | 📋 0/23                             |
| 8   | `newsletter-subscribe-dedupe`        | Unauthenticated open email relay: the dedupe guard is unreachable and CORS is `*`                                      | S      | —          | 📋 0/25                             |

## 3. Wave 2 — High value, low risk

| #   | Plan                                     | What it is                                                                                                                             | Effort | Depends on | Status                                                                                          |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ----------------------------------------------------------------------------------------------- |
| 9   | `database-performance` (Workstreams A+C) | Add the indexes the real query shapes need, then fix the pulse's misleading cost note (the pulse index is internal to this workstream) | M      | —          | 🟡 A+C landed 2026-09-18 — schema + `drizzle/0025_silent_rictor.sql` generated, **not applied** |
| 10  | `dashboard-bundle-maplibre-lazy-load`    | ~250 KB gzip + ~83 KB CSS off three routes by lazy-loading `EntryLocationMap`; also the CDN worker defect                              | S      | —          | 📋 0/51 — `✅✓` maplibre still statically imported                                              |

## 4. Wave 3 — Reliability and query efficiency

| #   | Plan                                       | What it is                                                                                                        | Effort | Depends on | Status                                                                               |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------ |
| 11  | `workspace-authorization-refetch-storm`    | Two independent focus listeners + `staleTime: 0` authorization cause redundant loader and DB round trips          | M      | —          | 📋 0/61                                                                              |
| 12  | `intl-formatter-and-timesheet-render-cost` | Timesheet render cost: day-label cache + 1 Hz tick isolation. Export-path Intl hoisting is already done           | M      | —          | 📋 0/66 (partly absorbed)                                                            |
| 13  | `server-write-reliability`                 | Mother plan, Parts A–C (absorbed three deleted plans)                                                             | L      | **#6**     | 📋 0/76                                                                              |
| 14  | `database-performance` (Workstream B)      | Bound unbounded queries: bind-parameter ceiling, catalog stats windows, JS→SQL `GROUP BY`, bootstrap caps         | L      | **#6**     | 🟡 B1 chunked 2026-09-18 (bind ceiling closed); B2–B4 gated on production row counts |
| 15  | `gsheets-write-integrity`                  | Google Sheets write integrity (also documents one non-bug: do not "fix" `getSheetIdForWorkspace`)                 | M      | —          | 📋 0/53                                                                              |
| 16  | `fix-gsheets-cron-http-method`             | The cron calls the endpoint with the wrong HTTP method                                                            | S      | —          | 📋 0/71                                                                              |
| 17  | `database-performance` (Workstream D)      | Import pipeline batching: per-row DB round trips → collect-then-batch; ends with a large-sheet import inside 30 s | M      | —          | 📋 0/69 — `✅✓` verified not implemented 2026-09-18                                  |
| 18  | `external-call-timeouts-and-auth`          | Introduce one `fetchWithTimeout` helper and adopt it at every outbound call site                                  | L      | —          | 📋 0/84                                                                              |
| 19  | `workspace-access-hardening`               | Harden query keys + pin the switch-path invariant with a test. Low priority, no live bug                          | M      | —          | 📋 0/45                                                                              |
| 20  | `service-worker-asset-cache-path`          | Make the SW honest about what it caches; may legitimately close as "no bug"                                       | S      | —          | 📋 0/44                                                                              |

## 5. Wave 4 — Blocked: do not schedule until the decision lands

| Plan                                              | Blocker                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `require-email-verification-for-membership-claim` | Product decision: when may an unverified email claim a membership? (onboarding impact)                  |
| `task-catalog-permission-and-project-validation`  | Policy answer: the missing task permission may be intentional (`README.md` says all roles manage tasks) |
| `database-performance` (Workstream E)             | Needs a production count + manual cleanup of duplicate open entries before the unique index can apply   |

## 6. Wave 5 — Features (no audit driver; schedule when product wants)

| Plan                                  | What it is                                        | Effort |
| ------------------------------------- | ------------------------------------------------- | ------ |
| `invoicing-template-creation-payment` | Invoicing templates + payment flow                | L      |
| `time-recording-performance`          | Mother plan; absorbed two deleted plans           | L      |
| `member-status-emoji`                 | DB-backed per-member status emoji on member cards | S      |

---

## 7. Known status problems in this directory

Read this before trusting any badge.

1. **Eight plans are badged ✅ but have unchecked boxes**, which the README's own rule forbids ("when a plan is completed, update the badge to ✅ Done and check all boxes"):

   | Plan                                            | Unchecked         |
   | ----------------------------------------------- | ----------------- |
   | `ui-redesign`                                   | 83                |
   | `department-member-calendar-integration`        | 10 (none checked) |
   | `workspace-api-tokens-and-swagger`              | 10 (none checked) |
   | `subscription-workspace-access`                 | 8                 |
   | `landing-page-redesign`                         | 8                 |
   | `reports-page`                                  | 4                 |
   | `newsletter-email-capture`                      | 3                 |
   | `fix-timer-panel-live-duration-after-time-edit` | 1                 |

   These are treated as **done** in this file; the stale boxes are a documentation defect, not pending work.

2. **"Planned" does not mean "no code exists."** `pin-running-entry-top` was fully implemented yet still badged Planned (only caught by reading the source), so some plans in Waves 3–5 may be further along than their badge claims. Treat the wave order as sequencing, not as a verified inventory.

3. **Six folders were deleted on 2026-09-18:** `pin-running-entry-top` (work verified implemented), `google-calendar-integration` (third-party integration, deliberately dropped), `fix-gsheets-cron-http-method` (folder removed in the same batch cleanup — the cron handler fix itself was **not** in commit `b2b9786`, so re-verify before treating it as done), and `add-missing-database-indexes`, `bound-unbounded-query-result-sets`, `tracker-pulse-query-scaling`, `import-pipeline-performance`, `prevent-duplicate-active-timers` (absorbed 2026-09-18 into `database-performance` Workstreams A–E, originals in its `absorbed/`). `plans/quick-fix/` was also removed after commit `b2b9786`; several plans still reference those paths.

4. **Four entries are not single deliverables:** `audit-2026-09-remediation` is the tier index, and `server-write-reliability` / `time-recording-performance` / `database-performance` are mother plans that absorbed deleted siblings. They close as their parts land.

## 8. Appendix — already done (12)

`client-status-inactivity` · `department-member-calendar-integration` · `export-button-logic-unification` · `export-time-and-decimal-rate` · `fix-timer-panel-live-duration-after-time-edit` · `landing-page-redesign` · `manual-editing-timer-format` · `newsletter-email-capture` · `performance-kpi-revamp` · `reports-page` · `subscription-workspace-access` · `ui-redesign` · `workspace-api-tokens-and-swagger`

Plus the completed `plans/quick-fix/` batch (client memory, server hygiene, export-time separation, workspace & timer correctness, inline time editing) — commit `b2b9786`.

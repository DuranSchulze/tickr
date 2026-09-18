# Discussion Summary — Time Recording Performance

## Context

Owner request: plan a way to **check overall system functionality and performance** for the
time-recording journey (start/stop/resume/manual entry), because users perceive slowness when
recording time. Deliverable: a plan that **finds** the problem, then lists **simple, spot-on
fixes** that help a user record tasks easily across devices, platforms, and OS.
**Hard constraint: no database edits (no schema/index/migration changes).**

No vision.md / requirements.md / spec.md exist for this work; the plan is grounded in direct
code reading plus the existing 2026-09 audit (`plans/audit-2026-09-remediation/PLAN.md`) and
its sibling performance plans.

## Plan Phase

### Structure decision

- **Single plan file**: `plans/time-recording-performance/PLAN.md`, following the repo's
  established `plans/<slug>/PLAN.md` convention (matches all 40+ existing plan directories).
- Rationale: the work is one focused journey (the record-a-task interaction), one surface
  (timer client + timer server handlers), well under the size that would justify splitting.

### Key findings from static analysis (to be confirmed by Phase 0 measurement)

1. **Stop path pays a full overlap-check round trip before any visual feedback**
   (`useTimerCore.ts#finishStopTimer` awaits `confirmTimeEntryOverlap` before
   `performOptimisticStop`; `TimerPanel.tsx:304` disables the button with a spinner while
   `stopPending`). Two sequential server calls per stop: `checkTimeEntryOverlapFn` →
   `stopTimerFn`. On mobile cellular this is the perceived "slowness".
2. **The stop response waits on background bookkeeping** — `stopTimer` awaits the gsheets
   sync enqueue and a full analytics rollup recompute (several sequential Neon HTTP waves)
   after the user's data is already written.
3. **Every confirmed start/stop triggers a full dashboard refetch** via `router.invalidate()`
   (the 11-query `getTrackerState`, 62-day entry window), even though the confirmed entry is
   already in hand and cache-splice helpers exist.
4. **Start path is already optimistic** — keep, regression-test.
5. Deferred (no-DB constraint): pulse index (`tracker-pulse-query-scaling`), MapLibre bundle
   and service-worker first-load items — they live in their own plans.

### Sequencing decisions

- **Measure first (Phase 0)** — record click→paint and click→confirmed baselines on desktop
  and mobile-throttled browsers, plus Sentry handler durations, before any fix.
- **Phases 1–3 are one coherent stop-path change** (single-round-trip contract →
  non-blocking side effects → optimistic-on-click UI) and must land together.
- **Phase 4 (refetch trim) is independent** and lands after the stop path is stable.
- **Cross-device matrix (Phase 5)** validates the "different devices, platform and OS"
  requirement, including the offline queue replay path — architecture unchanged.

## Similar-Plan Merge Pass (2026-09-18, second pass)

All 43 plan directories were read for overlap. **10 sibling plans** touch the time-recording
performance surface; the full disposition table lives in PLAN.md §0.4. Merge consequences
landed in the plan:

| Sibling                                                                                                           | Relationship                | What was merged                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `remove-redundant-database-round-trips`                                                                           | Split, not merged           | It owns the rollup-refresh cost reduction (4→~1 round trips) and the queue-consumer decision (`recomputeQueuedRollups` has no caller — already proven there). This plan keeps only the stop-path slice: stop awaiting the full refresh. Phase 2 no longer proposes its own drain/cron — that question is deferred to the sibling.   |
| `await-serverless-background-writes`                                                                              | Merged into Phase 2         | Adopted its AWAIT/ENQUEUE/LEAVE rule. **Corrected a design error in our first draft**: fully unawaited `void` queue inserts can be lost when Vercel freezes the function post-response. Final design: inserts **awaited** (ENQUEUE), only the rollup recompute deferred (LEAVE). Reuse its shared background-work helper if landed. |
| `fix-overlap-cancel-bug`                                                                                          | Merged into Phases 1/3      | Adopted its rollback lesson as rule **L1**: cancelled conflict check ⇒ zero residual optimistic state (cache, optimistic entries, inputs, operation machine). Coordinated the `overlap-confirmation.tsx` dialog extraction with its timezone work so either plan can land first without forking the dialog.                         |
| `workspace-authorization-refetch-storm`                                                                           | Parallel, coordinated       | It kills _focus-triggered_ full-route invalidation; our Phase 4 kills _mutation-triggered_. Both required; Phase 4 now cross-references it and Phase 5 gains a focus-event check.                                                                                                                                                   |
| `stabilize-active-entry-identity` / `dashboard-live-total-recompute` / `intl-formatter-and-timesheet-render-cost` | Parallel, coordinated       | Same screen, render-side causes. Phase 5 gains a typing-while-running scripting check that shares their profiler baselines; neither side claims the other's win.                                                                                                                                                                    |
| `prevent-duplicate-active-timers`                                                                                 | Regression coordination     | Unique index is out of bounds (no-DB), but its two-tab concurrent-start scenario was added to Phase 5.                                                                                                                                                                                                                              |
| `fix-timer-panel-live-duration-after-time-edit`                                                                   | Regression coordination     | ✅ Done; its start-time-edit-then-stop scenario added to Phase 5 because Phases 3–4 touch the same files.                                                                                                                                                                                                                           |
| `tracker-pulse-query-scaling`                                                                                     | Deferred (no-DB constraint) | Index fix out of bounds; cost recorded as known-deferred.                                                                                                                                                                                                                                                                           |

Plans checked and found **not** similar (no action): `analytics-reports-differentiation`,
`bound-unbounded-query-result-sets`, `client-status-inactivity`, `department-analytics-authorization`,
`department-member-calendar-integration`, `entry-ip-location-tracking`, `export-button-logic-unification`,
`export-time-and-decimal-rate`, `external-call-timeouts-and-auth`, `fix-gsheets-cron-http-method`,
`fix-neon-http-transaction-failure`, `fix-payroll-period-test-time-bomb`, `google-calendar-integration`,
`gsheets-write-integrity`, `import-pipeline-performance`, `import-stream-csrf-bypass`,
`invoicing-template-creation-payment`, `landing-page-redesign`, `manual-editing-timer-format`,
`member-status-emoji`, `newsletter-email-capture`, `newsletter-subscribe-dedupe`,
`performance-kpi-revamp`, `pin-running-entry-top`, `quick-fix/*` (all reviewed; the timer-component
one is ✅ Done UI work), `reports-page`, `require-email-verification-for-membership-claim`,
`subscription-workspace-access`, `task-catalog-permission-and-project-validation`,
`ui-redesign`, `workspace-access-hardening`, `workspace-api-tokens-and-swagger`,
`add-missing-database-indexes`.

## Key Decisions Log

1. Code-only fixes; all database-side improvements referenced but deferred (owner constraint).
2. Fold the overlap check into `stopTimer` with a `forceOverlap` flag instead of keeping the
   separate pre-check call — drops the stop journey from 2 sequential round trips to 1 with
   no DB change; conflicts return `{status:'conflicts'}` without writing.
3. Defer (not await) analytics rollup recompute on stop; **await the queue inserts** so they
   are durable before the response (ENQUEUE per `await-serverless-background-writes`). The
   rollup-refresh cost reduction and the queue-consumer decision belong to
   `remove-redundant-database-round-trips`.
4. Optimistic stop on click with rollback-on-conflict, replacing the current
   check-then-optimistic order; rollback follows rule L1 (zero residual state) from
   `fix-overlap-cancel-bug`.
5. Replace full `router.invalidate()` after start/stop confirmation with targeted cache
   splice; keep full invalidation for discard/delete paths; coordinate with
   `workspace-authorization-refetch-storm` which owns the focus-triggered half.
6. Pulse/sync/offline architecture explicitly not rebuilt — validated, not rewritten.
7. (merge pass) Overlap dialog extraction coordinated with the timezone fix in
   `fix-overlap-cancel-bug`; either land order works, dialog markup must not fork.
8. (merge pass) Render-side performance (per-keystroke recompute, 20 Hz header total, Intl
   formatters) stays in its three sibling plans; this plan only adds a render-no-regression
   check to Phase 5.
9. (merge pass) Sibling Status must be re-checked at implementation time; a ✅ Done sibling
   converts its row from "coordinate" to "verify no regression".
10. (merge pass, second direction) Coordination notes were also written **into all 10 sibling
    plan files** themselves (a `> **Coordination — plans/time-recording-performance/PLAN.md**`
    blockquote at the top of each), so the relationship is documented from both sides and a
    future reader of any sibling file learns about the split/merge rules without triage.

## Technical Context (files referenced)

- `src/lib/server/tracker/timer.server.ts` — startTimer / updateActiveTimer / stopTimer / duplicateEntry
- `src/lib/server/tracker/overlap.server.ts` — checkTimeEntryOverlap (reused server-side)
- `src/lib/server/tracker/shared/schemas.ts` — stopTimerSchema (+forceOverlap)
- `src/lib/server/tracker/analytics-rollups.server.ts` — rollup enqueue/recompute split
- `src/lib/server/tracker/state.server.ts` — getTrackerState (11-query wave, 62-day window)
- `src/components/time-tracker/dashboard/hooks/useTimerCore.ts` — timer state machine
- `src/components/time-tracker/dashboard/hooks/useTrackerMutations.ts` — mutation wrappers
- `src/components/time-tracker/dashboard/TimerPanel.tsx` — startPending/stopPending UI gating
- `src/lib/time-tracker/overlap-confirmation.tsx` — conflict dialog (extract shared)
- `src/lib/time-tracker/tracker-pulse.ts`, `offline-queue.ts` — sync legs (unchanged)
- `vercel.json` — cron drains for deferred queue work
- Prior plans: `audit-2026-09-remediation`, `await-serverless-background-writes`,
  `tracker-pulse-query-scaling`, `stabilize-active-entry-identity`,
  `intl-formatter-and-timesheet-render-cost`, `dashboard-bundle-maplibre-lazy-load`,
  `service-worker-asset-cache-path`, `prevent-duplicate-active-timers`,
  `fix-overlap-cancel-bug`

## Phase 0 Baseline (to be filled by measurement)

| Action | Device / network | Click → optimistic paint | Click → server-confirmed | Server handler p50/p95 |
| ------ | ---------------- | ------------------------ | ------------------------ | ---------------------- |
| Start  |                  |                          |                          |                        |
| Stop   |                  |                          |                          |                        |
| Resume |                  |                          |                          |                        |
| Manual |                  |                          |                          |                        |

## Phase 7 "After" Numbers (to be filled by validation)

(To be recorded after Phases 1–6 land, same journey and throttling as Phase 0.)

## Consolidation Pass (2026-09-18, third pass — owner: "one idea = one plan")

Owner directive: when plans merge, delete the absorbed folders so only one plan per idea
remains and the folder list shows immediately what needs implementing. Executed:

| Deleted folder                                 | Where its scope lives now                                                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plans/stabilize-active-entry-identity/`       | Here — **Phase 5**; full original text at `absorbed/render-active-entry-identity.md`                                                                           |
| `plans/dashboard-live-total-recompute/`        | Here — **Phase 6**; full original text at `absorbed/render-header-total-tick.md`                                                                               |
| `plans/remove-redundant-database-round-trips/` | Timer slice (rollup 4→1, `enqueueTimeEntry`) → **Phase 2**; reports-query items + queue-consumer OQ1 → **`plans/server-write-reliability/` Part B** (verbatim) |
| `plans/await-serverless-background-writes/`    | Stop-path rule → **Phase 2**; remaining ~40 unawaited-write sites → **`server-write-reliability/` Part A** (verbatim)                                          |
| `plans/fix-overlap-cancel-bug/`                | Dialog extraction + L1 → **Phases 1/3**; edit-flow defect + timezone → **`server-write-reliability/` Part C** (verbatim)                                       |

**New mother plan created:** `plans/server-write-reliability/PLAN.md` (Parts A–C preserve the
three absorbed plans' complete original text — nothing was paraphrased away).

**Preservation convention (added to plans/README.md):** fold scope into the surviving plan,
preserve the absorbed plan's original text inside the surviving plan folder (`absorbed/`
subfolder or as a Part), then delete the folder. All five folders were git-tracked, so the
pre-merge state is also recoverable from git history.

**Reference updates made:** PLAN.md §0.4 table + Phases 1–8 renumbered (render phases
inserted as 5–6; matrix → 7; docs → 8); `audit-2026-09-remediation/PLAN.md` consolidation note +
annotated §5 tree + §11 sequencing; dangling references fixed in `import-pipeline-performance`,
`gsheets-write-integrity`, `newsletter-subscribe-dedupe`, `department-analytics-authorization`,
`add-missing-database-indexes`, `intl-formatter-and-timesheet-render-cost`, and
`plans/README.md` (naming examples). Plans count: 46 folders at session start (git HEAD)
→ 41 now (5 absorbed folders deleted; 2 created this session: `time-recording-performance`
and `server-write-reliability`), of which 15 are ✅ complete, 2 🟡 in progress, 24 📋/🔴
not started.

## Key Decisions Log (consolidation additions)

11. (consolidation) Two render plans fully absorbed as Phases 5–6 rather than kept as
    cross-referenced siblings — same screen, same user journey (recording), and both were
    100% inside this plan's theme. Their verbatim texts are the phase-level detailed specs.
12. (consolidation) The three partials' remaining scope was consolidated into ONE mother plan
    (`server-write-reliability`) instead of three shrunken files — the remaining scopes share
    one theme (server-write durability + query efficiency + overlap-dialog correctness) and
    one implementer pass over the same server files.
13. (consolidation) Deletion policy going forward: full absorption ⇒ fold + preserve verbatim
    inside the survivor + delete folder; partial absorption ⇒ mother plan + delete originals.
    Never delete a ✅ Done plan (it is the record of what was implemented).

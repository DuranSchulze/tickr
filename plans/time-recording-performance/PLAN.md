# Time Recording Performance — Find, Fix, and Verify

> **Status:** 📋 Planned
> **Constraint:** Code-only fixes. **No database schema, index, or migration changes** (owner decision). Where a known database-side improvement exists, it is referenced but explicitly deferred.
> **Focus:** The time-recording journey — start timer, stop timer, resume, manual entry — perceived speed on any device, platform, or OS.

## Status

- [ ] Phase 0 (Verify First) executed: baselines recorded for every leg of the record-a-task journey on at least one desktop and one mobile browser, on Fast 3G throttling.
- [ ] Decision recorded: which of the existing sibling plans intersect this one and are prerequisites vs. parallel work (see §0.4 — reconciliation pass completed against all sibling plans).
- [ ] Fix 1 landed: stop path is a single server round trip (overlap check folded into `stopTimer`), with complete conflict rollback per rule L1 (from the absorbed `fix-overlap-cancel-bug`, now `server-write-reliability` Part C).
- [ ] Fix 2 landed: stop response no longer waits on Google Sheets enqueue or analytics rollup recompute.
- [ ] Fix 3 landed: stop applies optimistic UI on click; overlap conflicts roll back, not gate.
- [ ] Fix 4 landed: start/stop confirmation splices into cache without a full `router.invalidate()` dashboard refetch.
- [ ] Phase 5 landed: `activeEntry` identity stable — no grouping/sort re-runs on keystrokes that don't change the running entry (`absorbed/render-active-entry-identity.md` acceptance met).
- [ ] Phase 6 landed: header total is O(1) per tick — per-commit render time does not scale with entry count (`absorbed/render-header-total-tick.md` acceptance met).
- [ ] Phase 7 validation matrix passed on desktop Chrome, Safari (iOS), Android Chrome, and the offline replay path.
- [ ] Phase 8 documentation updated (`docs/time-tracker-page.md`, README performance notes).
- [ ] Post-deploy: p95 numbers re-recorded against the Phase 0 baseline and compared.

---

## 0. Verify First (No Code Change)

> The findings in Section 3 come from static reading. They are high-confidence but unmeasured. Phase 0 produces the numbers every later phase is validated against. If a measurement contradicts a finding, **the measurement wins** and the plan is re-sequenced before any fix lands.

### 0.1 Record the baseline journey

Measure the four user-visible actions, in this order, on **desktop Chrome** and on **mobile Safari or Chrome with DevTools Fast 3G throttling** (RTT ~150 ms — this is where "slow" lives):

1. **Start timer** — click Start → timer visibly running.
2. **Stop timer** — click Stop → timer visibly stopped, inputs cleared, entry row appears.
3. **Resume from history** — click resume on a past entry → old timer stops, new one runs.
4. **Manual entry save** — fill the form, save → row appears.

For each action capture:

- **Click → optimistic paint** (ms). Use the Performance panel; mark the click with a `performance.mark()` or read the recording.
- **Click → server-confirmed** (ms), i.e. until the mutation's `onSuccess`/`then` runs.
- **Server handler duration** (ms). Sentry is already wired (`src/sentry.server.config.ts`) — pull p50/p95 for `stopTimerFn`, `startTimerFn`, `checkTimeEntryOverlapFn`, `updateActiveTimerFn` from the Sentry transactions view. If tracing sampling excludes these, temporarily raise `tracesSampleRate` in the affected config.

Record results in a table in `discussion-summary.md` under "Phase 0 Baseline". There is no pass/fail yet — these are the "before" numbers.

### 0.2 Confirm the suspected hot segments (server)

Two `console.time`-style probes or temporary Sentry spans inside `src/lib/server/tracker/timer.server.ts`, run against a workspace with a realistic history (hundreds of entries over the 62-day window):

- [ ] Time the pre-check wave, the entry update, `enqueueTimeEntry`, and `safeRefreshAnalyticsRollups` separately inside `stopTimer`. **Hypothesis to confirm or kill:** the two trailing calls (gsheets enqueue + rollup recompute) dominate handler time, each costing one or more extra Neon HTTP round trips _after_ the user's data is already safely written.
- [ ] Time `getTrackerState` (`src/lib/server/tracker/state.server.ts:29`) end-to-end. **Hypothesis:** it is one parallel wave of 11 bounded queries (62-day entry window) — acceptable on its own, but wasteful when triggered as a follow-up to a mutation whose result is already known.

### 0.3 Confirm the suspected hot segments (client)

- [ ] Verify in `src/components/time-tracker/dashboard/hooks/useTimerCore.ts` (`finishStopTimer`, lines ~910–977) that the optimistic stop is applied **only after** `confirmTimeEntryOverlap` resolves — i.e. one full network round trip sits between the click and any visual feedback.
- [ ] Verify in `src/components/time-tracker/dashboard/TimerPanel.tsx:304` that `stopPending` (true from click until server confirmation) disables the Stop button and swaps its label to a spinner for the entire duration.
- [ ] Verify with the Network panel that a stop produces **two sequential** server calls: `checkTimeEntryOverlapFn`, then `stopTimerFn` — never parallel, because the second is issued only after the first resolves.

### 0.4 Reconciliation with existing sibling plans (merge pass — consolidation completed 2026-09-18)

A full pass over `plans/` identified **10 sibling plans** that touch the time-recording performance surface. **Five of them were absorbed and their folders deleted** (owner decision: one idea = one plan); their content lives on inside this plan or the mother plan `plans/server-write-reliability/PLAN.md`. The remaining five keep their own folders. Before writing any code, re-check each surviving sibling's Status — a ✅ Done sibling converts its row from "coordinate" to "verify no regression".

| Sibling plan                                                                | Overlap with this plan                                                                                                                                                                | Disposition                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~`remove-redundant-database-round-trips`~~ **(absorbed — folder deleted)** | Owned the server-side of F2.                                                                                                                                                          | Timer-path items (rollup refresh 4→~1 round trips, `enqueueTimeEntry` single-statement) **absorbed into Phase 2**. Reports-query items and the queue-consumer decision moved to **`plans/server-write-reliability/` Part B**. |
| ~~`await-serverless-background-writes`~~ **(absorbed — folder deleted)**    | Owned the inverse failure mode: fire-and-forget writes lost on Vercel freeze.                                                                                                         | Its AWAIT/ENQUEUE/LEAVE rule **absorbed into Phase 2** (inserts awaited, recompute deferred). Remaining scope (audit logs, newsletter, sheet sharing, bulk archive) moved to **`plans/server-write-reliability/` Part A**.    |
| ~~`fix-overlap-cancel-bug`~~ **(absorbed — folder deleted)**                | Owned the overlap dialog and the edit-flow rollback defect.                                                                                                                           | Dialog extraction + rule L1 for the stop flow **absorbed into Phases 1/3**. Edit-flow defect + timezone fix moved to **`plans/server-write-reliability/` Part C**.                                                            |
| ~~`stabilize-active-entry-identity`~~ **(absorbed — folder deleted)**       | Render-side: `activeEntry` rebuilt per render → per-keystroke regrouping.                                                                                                             | **Fully absorbed as Phase 5.** Original text preserved verbatim at `absorbed/render-active-entry-identity.md`.                                                                                                                |
| ~~`dashboard-live-total-recompute`~~ **(absorbed — folder deleted)**        | Render-side: `HeaderTotal` re-scans 62 days at the 20 Hz tick.                                                                                                                        | **Fully absorbed as Phase 6.** Original text preserved verbatim at `absorbed/render-header-total-tick.md`.                                                                                                                    |
| `workspace-authorization-refetch-storm`                                     | Owns the _focus-triggered_ full-route invalidation storm. F3 is the _mutation-triggered_ full refetch. Same symptom, different trigger — both must land to end full-refetch behavior. | **Parallel, coordinated.** See Phase 4 and the Phase 7 focus-event check.                                                                                                                                                     |
| `intl-formatter-and-timesheet-render-cost`                                  | Render-side: per-call `Intl` construction.                                                                                                                                            | **Parallel, coordinated.** Phase 5's per-run cost work is attributed there, not here — the scope-split contract from the absorbed plan carries over.                                                                          |
| `prevent-duplicate-active-timers`                                           | Unique-index migration out of bounds (no-DB constraint); two-tab concurrent-start regression scenario.                                                                                | **Regression coordination only** (Phase 7).                                                                                                                                                                                   |
| `fix-timer-panel-live-duration-after-time-edit`                             | ✅ Done. Touched `TimerPanel.tsx`, `useTimerCore.ts`, and the start-time-edit race Phases 3–5 also touch.                                                                             | **Regression coordination only** (Phase 7).                                                                                                                                                                                   |
| `tracker-pulse-query-scaling`                                               | Pulse poll per-poll DB cost. Preferred fix is a database index — **out of bounds per the no-DB constraint**.                                                                          | **Deferred** to its own plan. Confirm the pulse stays visibility-gated at 30 s (`src/components/time-tracker/TaskSyncCoordinator.tsx`); record per-poll cost as a known deferred item.                                        |

Also deferred, not forgotten (first-load performance, adjacent to but outside the record-a-task loop): `plans/dashboard-bundle-maplibre-lazy-load/PLAN.md` and `plans/service-worker-asset-cache-path/PLAN.md`.

The 2026-09 audit entry point (`plans/audit-2026-09-remediation/PLAN.md`) sequences the surviving siblings; this plan is the user-journey-level plan for the record-a-task interaction, and `plans/server-write-reliability/` is its server-side sister plan.

---

## 1. Goal

Make recording time feel instant on every device and network a real user has — office desktop, phone on cellular, laptop on conference wifi — without touching the database, and prove it with before/after numbers on the same journey.

## 2. Overview

- **What we already know from the code:** the start path is already optimistic (UI updates on click, server catches up). The stop path is not: it pays a sequential overlap-check round trip _before_ showing anything, then a second round trip to actually stop, and the server holds the stop response while it enqueues Google Sheets sync and recomputes analytics rollups. On a 150 ms-RTT mobile connection that is easily 1–2 s of dead button between click and feedback.
- **The fix shape:** collapse stop to a single round trip, move the overlap check inside `stopTimer`, apply optimistic UI on click, and stop blocking the response on background bookkeeping that already has durable queue tables.
- **Sequencing logic:** measure first (Phase 0), fix the stop path end-to-end (Phases 1–3, one coherent change), then the refetch trim (Phase 4, independent), then the two render phases absorbed from the deleted render-side plans (Phases 5–6), then cross-device validation and docs (Phases 7–8).
- **Cross-device note:** multi-device sync itself (30 s visibility-gated pulse, offline queue with replay) is already well designed and is _not_ being rebuilt. This plan makes the _local recording action_ fast everywhere; sync correctness is validated, not rewritten.

## 3. Findings (from static analysis — confirm in Phase 0)

### F1 — Stop waits for a full round trip before any visual feedback

`finishStopTimer` (`useTimerCore.ts:968–973`) awaits `confirmTimeEntryOverlap({entryId})` — a `checkTimeEntryOverlapFn` server call — and only then calls `performOptimisticStop`. Meanwhile `stopPending` disables the button and shows a spinner (`TimerPanel.tsx:304`). **Perceived stop latency = 1 full RTT + server time, before anything on screen changes.** On desktop this is ~100–200 ms (tolerable); on mobile cellular it is the difference between "snappy" and "broken".

### F2 — The stop response waits on background bookkeeping

`stopTimer` (`timer.server.ts:230–379`) writes the entry (the user's data is safe), then **awaits sequentially**: `enqueueTimeEntry` (gsheets sync queue insert) and `safeRefreshAnalyticsRollups` → `refreshAnalyticsRollups` → per-target: pending-row insert + `recomputeAnalyticsDailyMemberMetric` (member read + day-window aggregate + upsert) + pending-row delete. Each is a separate wave over the Neon HTTP driver. **The user waits for analytics that no screen reads synchronously.**

### F3 — Every confirmed start/stop triggers a full dashboard refetch

On success, `useTimerCore` calls `router.invalidate()`, re-running the route loader and `getTrackerStateFn` — the full 11-query tracker state including a 62-day entry window — even though the confirmed entry is already in hand and cache-splice helpers (`upsertTrackerStateEntry`) exist.

### F4 — Start path is already good

`launchTimer` applies optimistic state immediately and location capture is backgrounded. F4 is recorded so Phase 5 regression-tests it, not to change it.

### F5 — Deferred, database-adjacent items (explicitly out of bounds)

Pulse poll needs an index or counter (`plans/tracker-pulse-query-scaling`); MapLibre bundle and service-worker cache path affect first load (`plans/dashboard-bundle-maplibre-lazy-load`, `plans/service-worker-asset-cache-path`). No-DB constraint stands; these stay in their own plans.

## 4. Scope

**Included.**

- `[MEASURE]` Phase 0 baseline instrumentation and recording.
- `[FIX]` Stop path: single-round-trip contract, non-blocking background writes, optimistic-on-click UI.
- `[FIX]` Post-mutation refetch trim for start/stop confirmation.
- `[CHECK]` Cross-device / cross-platform validation matrix and offline replay check.
- `[DOCS]` Documentation updates.

**Excluded.**

- Database schema, index, or migration changes of any kind.
- The Google Sheets sync or analytics rollup _logic_ — only _when_ they run relative to the HTTP response.
- Pulse/sync architecture changes; the browser extension's internal timer UI.
- Areas the 2026-09 audit found clean (see `plans/audit-2026-09-remediation/PLAN.md` §2).

## 5. Affected Files and Folders

```txt
src/lib/server/tracker/timer.server.ts                        (stopTimer contract + non-blocking side effects)
src/lib/server/tracker/shared/schemas.ts                      (stopTimerSchema: + forceOverlap)
src/lib/server/tracker/overlap.server.ts                      (reuse checkTimeEntryOverlap; no change expected)
src/lib/server/tracker.ts                                     (stopTimerFn return type widens)
src/lib/time-tracker/types.ts                                 (StopTimerResult union type)
src/components/time-tracker/dashboard/hooks/useTimerCore.ts   (optimistic-on-click stop; conflict rollback)
src/components/time-tracker/dashboard/hooks/useTrackerMutations.ts (stopTimer path through run())
src/components/time-tracker/dashboard/TimerPanel.tsx          (verify spinner behavior still correct)
src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx  (Phase 5: visibleEntriesSource re-key)
src/components/time-tracker/dashboard/AllEntriesSection.tsx  (Phase 5: groups memo re-key)
src/components/time-tracker/dashboard/DayGroupEntries.tsx    (Phase 5: pinnedGroupKey re-key)
src/components/time-tracker/dashboard/DashboardHeader.tsx    (Phase 6: HeaderTotal split)
src/lib/time-tracker/query-keys.ts                            (existing splice helpers — reuse)
docs/time-tracker-page.md                                     (performance notes)
plans/time-recording-performance/
  PLAN.md                                                     (this file)
  discussion-summary.md                                       (baselines + decisions)
  absorbed/render-active-entry-identity.md                    (verbatim absorbed plan — Phase 5 detail)
  absorbed/render-header-total-tick.md                        (verbatim absorbed plan — Phase 6 detail)
```

## 6. Implementation Phases

### Phase 1 — Fix the stop path contract: one round trip, overlap inside `stopTimer`

**Implements findings:** F1, F2. **Justification:** this is the core perceived-latency fix; everything else builds on the new contract.

**Design.** `stopTimer` gains an optional `forceOverlap: boolean` (default false). The handler, after resolving the effective values and _before_ writing:

1. Runs `checkTimeEntryOverlap` (already exported from `src/lib/server/tracker/overlap.server.ts`) for the entry's member and time window, excluding the entry being stopped.
2. If conflicts exist and `forceOverlap` is false → **returns without writing**: `{ status: 'conflicts', conflicts }`.
3. Otherwise stops as today, minus the trailing awaits (Phase 2), and returns `{ status: 'stopped', entry }`.

The client shows the conflict dialog exactly as today (`overlap-confirmation.tsx` dialog markup — extract `showOverlapConfirmation` so both code paths share it) and, on "Save anyway", resubmits `stopTimerFn` with `forceOverlap: true`.

**Why this shape and not "keep the pre-check call":** the overlap query needs the same inputs the stop already has (member, startedAt, endedAt) and costs the same wherever it runs — inside the stop call it rides the connection the client already opened, so the journey drops from 2 sequential round trips to 1. No DB change: `checkTimeEntryOverlap` is a plain read.

- [ ] Add `forceOverlap: z.boolean().optional()` to `stopTimerSchema` in `src/lib/server/tracker/shared/schemas.ts`.
- [ ] Add the `StopTimerResult` union type to `src/lib/time-tracker/types.ts`:

```ts
/**
 * Result of a stop attempt.
 * - 'stopped'   — the entry was finalized; `entry` is the confirmed row.
 * - 'conflicts' — overlapping entries exist and forceOverlap was not set;
 *                 nothing was written. Resubmit with forceOverlap: true
 *                 to stop anyway.
 */
export type StopTimerResult =
  | { status: 'stopped'; entry: TimeEntry }
  | { status: 'conflicts'; conflicts: TimeEntryOverlapConflict[] }
```

- [ ] Rework `stopTimer` in `src/lib/server/tracker/timer.server.ts`:

```ts
export async function stopTimer(data: z.infer<typeof stopTimerSchema>) {
  const access = await requireWorkspaceMembership()
  // ... unchanged: entry + tags read wave, effective value resolution,
  //     validation throws, endedAt clamping, hasOverrides — all as today ...

  // Overlap gate: same read the standalone check endpoint performs, but it
  // rides this request's connection instead of a separate round trip.
  // Nothing is written unless the gate passes (or the client forces it).
  if (!data.forceOverlap) {
    const conflicts = await checkTimeEntryOverlap({
      memberId: access.member.id,
      excludeEntryId: entry.id,
      startedAt: entry.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
    })
    if (conflicts.length > 0) {
      return { status: 'conflicts' as const, conflicts }
    }
  }

  // ... unchanged update block (overrides / plain stop) ...

  // Side effects are NOT awaited here — see Phase 2.
  scheduleStopSideEffects(access.workspace.id, updatedEntry)

  return {
    status: 'stopped' as const,
    entry: serializeTimeEntry(updatedEntry, finalTags),
  }
}
```

(Adjust `checkTimeEntryOverlap`'s parameter shape to match its existing signature — the call above mirrors `overlap-confirmation.tsx`'s `OverlapCheckInput`.)

- [ ] Extract `showOverlapConfirmation` from `overlap-confirmation.tsx` into an exported function (no behavior change; the standalone `confirmTimeEntryOverlap` keeps working for manual-entry and update-entry flows). **Coordinate with `plans/server-write-reliability/PLAN.md` Part C** — the absorbed `fix-overlap-cancel-bug` plan is adding a workspace-timezone parameter to this same dialog. Land order: if it lands first, the extraction carries the timezone parameter through; if this phase lands first, the timezone work layers onto the extracted function. Either way, do not fork the dialog markup.
- [ ] Adopt rollback rule **L1** (lesson from the absorbed `fix-overlap-cancel-bug` plan — now Part C of `plans/server-write-reliability/` — which found exactly this defect in the edit flow): a cancelled conflict check must leave **zero** residual optimistic state — no stale stopped row, no closed/cleared inputs, no silent divergence between screen and server. The stop-path rollback in Phase 3 is written to this rule; the rule is also added to `docs/time-tracker-page.md` in Phase 8.
- [ ] Update `stopTimerFn`'s inferred return type at `src/lib/server/tracker.ts` (no code change needed beyond the handler; verify the widened type compiles through `useTrackerMutations` and `useTimerCore` call sites).
- [ ] Update `stopTimer` in `useTrackerMutations.ts` to handle the union: on `'conflicts'`, run `showOverlapConfirmation`; if the user confirms, call `stopTimerFn` once more with `forceOverlap: true`; if they cancel, return a sentinel the caller can treat as "rolled back".
- [ ] Tests: extend the existing timer server tests — (a) no overlaps → single call returns `'stopped'`; (b) overlaps without force → returns `'conflicts'`, **assert the entry is still running in the DB** (the no-write guarantee); (c) overlaps with force → `'stopped'`; (d) offline replay payload without `forceOverlap` behaves as (a)/(b) on drain.

### Phase 2 — Stop blocking the response on background bookkeeping

**Implements finding:** F2. **Justification:** the entry row is the only data the user is waiting for; both side effects already have durable queues (`pending_gsheets_syncs`, `pending_analytics_rollups`) that survive process death, so deferring the _recompute_ loses nothing.

**Merged sibling constraints (from the §0.4 pass):**

- From `plans/server-write-reliability/` Part A (absorbed `await-serverless-background-writes`): its AWAIT / ENQUEUE / LEAVE rule governs this phase. The failure mode it owns — fire-and-forget writes **lost when Vercel freezes the function after the response returns** — means the original draft of this phase (fully unawaited `void` inserts) was **wrong**: a `void`-ed insert that hasn't reached the DB by response time can vanish. Correct classification here: the queue **inserts are awaited** (ENQUEUE — each is one small, fast round trip that must be durable before the response), and **only the rollup recompute is deferred** (it is pure derived-state churn, re-creatable from entries at any time). If Part A's shared background-work helper has landed by then, use it instead of the local helper below.
- From the absorbed `remove-redundant-database-round-trips`: its rollup-refresh findings are now **owned here** — the refresh reduction (4 → ~1 round trip per target) and the `enqueueTimeEntry` single-statement conversion are absorbed tasks below, and it already proved `recomputeQueuedAnalyticsRollups` has no caller. The one piece that moved elsewhere is the **queue-consumer decision** (wire the drain up or delete the queue), which is `plans/server-write-reliability/` Part B Open Question 1 because non-timer writers also use it; the stop path must keep working under either outcome.

- [ ] In `timer.server.ts`, replace the two trailing awaits with a helper that **awaits the queue inserts** (durable before response) and **defers only the recompute**:

```ts
/**
 * Bookkeeping around a finalized entry.
 *
 * Classification per plans/server-write-reliability Part A (AWAIT/ENQUEUE/
 * LEAVE): the queue inserts are ENQUEUE-class — each is a single small round
 * trip and MUST be durable before the HTTP response, because Vercel may
 * freeze this function the moment the response returns and a `void`-ed
 * insert that never reached the DB would be silently lost. The analytics
 * recompute is LEAVE-class inside the request — pure derived-state churn,
 * re-creatable from time_entries at any time via the queued-rollups path.
 *
 * Total cost added to the stop response: 2 small awaited inserts in
 * parallel — versus today's inserts + member read + day-window aggregate
 * + upsert + pending-row delete, all sequential.
 */
async function scheduleStopSideEffects(
  workspaceId: string,
  entry: {
    id: string
    workspaceId: string
    workspaceMemberId: string
    startedAt: Date
  },
) {
  // Awaited so the rows are durable before the response; a failure here is
  // logged and surfaced to Sentry, not thrown — the user's entry (the data
  // they care about) is already committed above.
  await Promise.all([
    enqueueTimeEntry(workspaceId, entry.id).catch((error) => {
      console.error('Failed to enqueue gsheets sync for stopped entry.', error)
    }),
    enqueueAnalyticsRollup(
      entry.workspaceId,
      entry.workspaceMemberId,
      toDateKey(entry.startedAt),
    ).catch((error) => {
      console.error(
        'Failed to enqueue analytics rollup for stopped entry.',
        error,
      )
    }),
  ])
  // NOT awaited: the rollup recompute itself. Runs via whichever drain the
  // queue-consumer decision (server-write-reliability Part B, OQ1) leaves in
  // place.
  void recomputeQueuedAnalyticsRollups(1).catch((error) => {
    console.error(
      'Failed to recompute analytics rollup for stopped entry.',
      error,
    )
  })
}
```

**Absorbed from `remove-redundant-database-round-trips` (folder deleted; see §0.4):** Phase 2 also owns the two timer-path items from that plan —

- [ ] **Reduce the rollup refresh from ~4 sequential round trips per target to ~1** in `refreshAnalyticsRollups` (`analytics-rollups.server.ts:160-192`): the per-target sequence today is pending-insert → `recomputeAnalyticsDailyMemberMetric` (2 parallel reads + upsert + possible delete) → explicit delete of the row just inserted. With the Phase 2 recompute deferral in place, the in-request path keeps only the pending-row insert; the recompute (when it runs off-request) must still avoid the insert-then-delete churn — recompute directly from `time_entries` and insert the pending row **only** when the recompute cannot run immediately (that is the queue's actual purpose). Bounded concurrency (existing `runInBatches` pattern, batch ~10 for this heavier workload) applies to any multi-target fan-out.
- [ ] **Replace the `enqueueTimeEntry` fan-out with a single statement** (`src/lib/server/gsheets/sync-queue.ts`): one insert per entry instead of per-target loops, and drop the now-unused parameter the audit flagged.
- [ ] Remove the now-unused `safeRefreshAnalyticsRollups` / `entryRollupTarget` imports from `timer.server.ts` **only if** no other function in the file uses them (`duplicateEntry` still calls both — keep the import and update `duplicateEntry` to use `scheduleStopSideEffects` too, so manual duplication gets the same latency win).
- [ ] The **queue-consumer decision** (wire `recomputeQueuedAnalyticsRollups` up as a scheduled drain, or delete the queue and the deferred recompute entirely) is **owned by `plans/server-write-reliability/PLAN.md` Part B, Open Question 1** — it also serves non-timer rollup writers. This plan's obligation: whichever outcome that decision picks, `scheduleStopSideEffects` adapts (queue deleted ⇒ the helper simplifies to a single awaited cheap refresh). Re-check that decision during implementation.
- [ ] Tests: handler-level test asserting (a) the stop response resolves **after both queue inserts** (assert both rows exist in the DB before the response returns — the ENQUEUE guarantee), (b) without the rollup recompute having run in-request (spy on `recomputeAnalyticsDailyMemberMetric`), and (c) the deferred recompute is invoked but not awaited (spy call order). Also assert the same for `duplicateEntry`. Plus the absorbed items' tests: rollup refresh round-trip count per target (mock the DB layer and count calls), and single-statement `enqueueTimeEntry`.

### Phase 3 — Optimistic stop on click, roll back on conflict

**Implements finding:** F1 (UI half). **Justification:** with Phases 1–2 the server is one fast round trip; this phase removes even that from the _perceived_ path. **Dependency:** must land together with Phase 1 (the rollback path needs the `'conflicts'` result to exist).

- [ ] In `useTimerCore.ts` `finishStopTimer`: apply `performOptimisticStop` **immediately** on click (as today, but without awaiting the overlap check first — the check now lives inside the stop call). Set `stopPending` semantics to "request in flight", not "blocked".
- [ ] In the stop `.then`, handle `'conflicts'` per rollback rule **L1** (zero residual optimistic state — the lesson the absorbed `fix-overlap-cancel-bug`, now `server-write-reliability` Part C, learned from the edit flow): remove the optimistic stopped row, restore the optimistic running entry (`setOptimisticActiveEntry(entryToStop)`), restore the timer inputs from the captured `fields`, **and** re-sync `timerOperation` to idle — then show `showOverlapConfirmation` (workspace-timezone-aware if `server-write-reliability` Part C has landed). On confirm, resubmit with `forceOverlap: true` and re-apply the optimistic stop; on cancel, leave the timer running with a neutral toast.
- [ ] Ensure the sub-second stop guard (`stopTimer`, lines ~979–990) and the queued-start remap path (lines ~931–965) still work — they branch before this logic and are unchanged in spirit; add a regression test for "stop during offline-queued start".
- [ ] Update `TimerPanel.tsx` only if the spinner/disabled treatment now misleads (e.g. keep the button enabled during `stopPending` so a double-tap isn't a dead click — decide during implementation based on the Phase 0 recording).
- [ ] Tests: hook-level test — stop click applies optimistic state synchronously (assert render before any server resolution); conflict response rolls back and re-presents the running timer; force-resubmit stops successfully. **L1 assertions:** after a cancelled conflict the query cache, the optimistic-entry state, the timer inputs, and the `timerOperation` machine must all be byte-identical to the pre-click state (this is the exact set of artifacts `fix-overlap-cancel-bug` found stale in the edit flow — assert them all, not just the visible row).

### Phase 4 — Splice confirmation into cache; skip the full dashboard refetch

**Implements finding:** F3. **Justification:** after Phases 1–3 the mutation already returns the confirmed entry; refetching 11 queries to learn what you were just told is pure latency and server load, on every device.

- [ ] In `useTimerCore.ts`, replace the post-confirmation `void router.invalidate()` calls in the start and stop success paths with: `upsertTrackerStateEntry(queryClient, confirmedEntry)` (already used) + a targeted invalidation of only the queries whose data the action can change (today: `trackerKeys.state` and the day-group list for the entry's date; other screens refetch on focus/navigation via existing loaders).
- [ ] Keep `invalidateDashboard()` for the discard path (deletion can affect counts/filters beyond a simple splice).
- [ ] Keep `onMutated?.()` so the paginated "all entries" view still refreshes as today.
- [ ] Tests: mutation-success test asserting no full-route invalidation fires for start/stop but the cache contains the confirmed entry; existing `AllEntriesSection` / `EntryRow` tests must pass unmodified (they cover the splice behavior).
- [ ] **Coordination with `plans/workspace-authorization-refetch-storm`:** that plan removes the _focus-triggered_ invalidation storm (two `focus` listeners both ending in `router.invalidate()`); this phase removes the _mutation-triggered_ one. They are independent triggers and both must land before the dashboard stops fully refetching on routine events — do not claim this plan alone "ends refetch storms", and when that sibling lands, re-run this phase's test to confirm no double-invalidation reappeared.

### Phase 5 — Dashboard render performance: stable `activeEntry` identity (absorbed from `stabilize-active-entry-identity`)

**Absorbed:** 2026-09-18 consolidation — the plan `plans/stabilize-active-entry-identity/` was fully merged here and its folder deleted. The **complete original plan** (all Verify First steps, measured baselines, scope-split contract, risks, open questions) is preserved verbatim at `absorbed/render-active-entry-identity.md` and is the detailed spec for this phase; the summary below is the executable checklist. **Why it's in this plan:** typing the description _while recording_ is part of the record-a-task journey, and its cost (~3.7 ms of main-thread work per keystroke at a 1000-entry window, grouping + sort re-run for byte-identical output) is the same perceived-slowness family as F1–F3.

**Finding (confirmed by audit measurement):** `activeEntry` in `useTimerCore.ts:206-217` is rebuilt as a fresh object on every render (no `useMemo`), and that identity invalidates five downstream memos — `visibleEntriesSource`, `inputSectionProps`, `groups`, `pinnedGroupKey`, and `useTimerKeyboard`'s deps — three of which only read `id` + `startedAt`.

- [ ] `[CHECK]` Run the absorbed plan's Verify First (static items 1–7, then Profiler items 8–11: renders per keystroke, byte-identical grouping proof, no-timer baseline). **Stop condition preserved:** if typing does not measurably re-run grouping/sorting, record and skip to the memo-only subset.
- [ ] `[FIX]` Wrap `activeEntry` in `useMemo` keyed on the actual input fields (`activeEntryBase`, `timerDescription`, `timerProjectId`, `timerTaskId`, `timerTagIds`, `timerBillable`, `timerStartedAt` — the conditional `timerStartedAt` is the highest-risk dependency). Let `react-hooks/exhaustive-deps` drive the list; never suppress.
- [ ] `[FIX]` Re-key the grouping memos on primitives: `AllEntriesSection.tsx:102-112` and `DayGroupEntries.tsx:659-666` depend on `activeEntry?.id` + `activeEntry?.startedAt`; `visibleEntriesSource` (`TimeTrackerDashboard.tsx:438-456`) on `id` + start/end primitives. Memo bodies read the entry via the file's existing ref pattern, never a stale closure.
- [ ] `[FIX]` Leave `inputSectionProps` as-is unless the Profiler shows spurious invalidation — it legitimately consumes the merged fields.
- [ ] `[FIX]` (Optional per the absorbed plan's Open Question 2) Stabilize `startTimer`/`stopTimer`/`discardTimer` with `useCallback` + refs so `useTimerKeyboard` stops re-subscribing per keystroke — include only if the Profiler shows the churn is measurable; it is the stale-closure risk hotspot.
- [ ] `[CHECK]` Acceptance: Profiler shows grouping/sort absent from keystrokes that don't change identity; the full manual QA list from the absorbed plan (typing current, every merged field live, autocomplete, pinned group, range filter, keyboard shortcuts, sort modes, presets, no new render loops); the scaling check (cost no longer grows with entry count).
- [ ] **Scope-split contract (carried over):** this phase removes the _re-runs_. Per-run formatter cost (`formatDayLabel`'s `toLocaleDateString`, ~85× hoistable) stays with the surviving sibling `plans/intl-formatter-and-timesheet-render-cost/` — do not hoist formatters here, and do not let either plan claim the other's win.

### Phase 6 — Dashboard header total: O(1) per tick instead of O(62 days) (absorbed from `dashboard-live-total-recompute`)

**Absorbed:** 2026-09-18 consolidation — the plan `plans/dashboard-live-total-recompute/` was fully merged here and its folder deleted. The **complete original plan** is preserved verbatim at `absorbed/render-header-total-tick.md` and is the detailed spec. **Why it's in this plan:** the header total ticks _while a timer runs_ — the live re-scan of the full 62-day window (~1.43 ms/call in the audit's Node measurement, 20 Hz for users on the centisecond format, ~40k `Date` allocations/sec) is the third render-side leg of "the dashboard feels slow while recording".

**Finding:** `HeaderTotal` (`DashboardHeader.tsx:8-32`) computes one day's total by reducing over `summaryEntries` (the full 62-day window) on every tick. `LiveDuration`/`CardDuration` already implement the correct isolate-the-tick pattern; the header is the one place it wasn't applied.

- [ ] `[CHECK]` Run the absorbed plan's Verify First (trace `summaryEntries`, tick constants — 20 Hz is opt-in via the `precise` format, the existing `LiveDuration`/`CardDuration` pattern, `useNowTick` correctness, then Profiler items: ~100 header commits in 5 s at 20 Hz, per-commit cost, realistic entry count). **Stop condition preserved:** if in-browser per-commit cost is negligible at real entry counts, record and re-prioritize.
- [ ] `[FIX]` Split `HeaderTotal` into (a) a `useMemo`'d completed base over `[entries, rangeStartMs, rangeEndMs]` — primitive dependencies, never `tick`, never the `Date` objects — plus (b) the running entry's live seconds computed per tick. Display `completed + running`.
- [ ] `[FIX]` Preserve exactly: no-running-entry totals, running entry inside the day, running entry started before midnight (clipped — the billing-accuracy case, test explicitly), entry on a different day (contributes 0), all five `formatTime` variants, and `hasRunningEntry` arming semantics (header must not freeze).
- [ ] `[FIX]` Unit-test the extracted total computation (the absorbed plan's six cases: no running, running in range, running pre-range, running post-range, empty, out-of-range completed).
- [ ] `[CHECK]` Acceptance: per-commit render time O(1) in entry count (the scaling check is the criterion — double entries, time must not double); midnight-crossing manual QA; `useNowTick` untouched.

### Phase 7 — Cross-device validation matrix

**Implements:** the "different devices, platforms, and OS" requirement. Manual, scripted where possible.

- [ ] Re-run the Phase 0 journey (start / stop / resume / manual) and record "after" numbers in `discussion-summary.md`:
  - Desktop Chrome (fast network)
  - Mobile Safari on iOS, cellular or Fast 3G throttle
  - Android Chrome, Fast 3G throttle
- [ ] Cross-device sync check (unchanged architecture, verify no regression): start a timer on device A → within ~30 s visible on device B's open dashboard; stop on B → A updates; repeat with B's tab hidden then foregrounded (activation-triggered refresh).
- [ ] Offline path: airplane-mode start + stop, reconnect, verify queue drains and the entry appears once (no duplicates — guards from `prevent-duplicate-active-timers` must still hold, including its two-tab concurrent-start scenario).
- [ ] Regression: `prevent-duplicate-active-timers` scenarios still pass, and the stop-with-conflict rollback from Phase 3 cannot leave a ghost running entry (the overlap-cancel correctness scenario now lives in `plans/server-write-reliability/` Part C for the edit flow).
- [ ] Regression: edit the running timer's start time and stop immediately after — the saved duration must reflect the edited start time (scenario owned by the now-Done `plans/fix-timer-panel-live-duration-after-time-edit`; re-verify because Phases 3–5 touch the same `useTimerCore`/`TimerPanel` code).
- [ ] Render-path check (coordinates with the surviving sibling `plans/intl-formatter-and-timesheet-render-cost/`, does not claim its win): with Phases 5–6 landed, type one character in the description box while a timer runs and record the scripting cost; confirm the Phase 5/6 acceptance numbers. Purpose here is end-to-end confirmation on real devices, including low-end Android.
- [ ] Focus-event check (coordinates with `plans/workspace-authorization-refetch-storm`): with this plan's Phase 4 landed, focusing the window must not trigger a full tracker-state refetch as a consequence of _this plan's_ changes; if one still fires, it is the sibling plan's pre-existing storm, not a regression here — record which.
- [ ] Targets: click → optimistic paint < 50 ms on all devices; stop confirmation < 1 RTT + 300 ms server p95; no dead-button interval longer than the optimistic paint.

### Phase 8 — Documentation

- [ ] `docs/time-tracker-page.md`: document the stop contract (`StopTimerResult`), the non-blocking side-effect policy, and the "optimistic first, roll back on conflict" UX rule.
- [ ] `README.md`: one-line performance note if a performance section exists.

## 7. Risks and Mitigations (verified against code)

- **Conflict rollback flicker** (Phase 3): user sees "stopped", then the timer springs back. Mitigation: the overlap dialog appears in the same beat as the rollback with a clear message; conflicts are rare in normal use (they require overlapping history), so this path is exceptional by design.
- **Queue insert fails before response** (Phase 2): the ENQUEUE-class inserts are awaited, so a failed insert is known before the response and is logged (Sentry) rather than silently lost — the user's entry itself is already committed above. Worst case: one entry's gsheets/rollup sync lags until the next write or drain sweep. Both tables are idempotent (`onConflictDoNothing`) and re-enqueued by later writes. This is strictly better than the fire-and-forget draft, which the absorbed `await-serverless-background-writes` analysis (now `plans/server-write-reliability/` Part A) showed could lose the write entirely to a post-response Vercel freeze.
- **Deferred recompute races with the drain** (Phase 2, coordination risk): both the in-request deferral and any cron drain may pick up the same pending row. Safe because recompute is idempotent (upsert keyed on workspace+member+date) and the pending-row delete is scoped to the row just processed; worst case is a redundant recompute, not corruption. The queue-consumer decision (wire `recomputeQueuedAnalyticsRollups` up or delete the queue) is **owned by `plans/server-write-reliability/` Part B, Open Question 1** — if the queue is deleted, this phase's helper simplifies to a single cheap awaited refresh; re-read that decision before implementing.
- **Skipped `router.invalidate()` hides stale data** (Phase 4): mitigated by keeping the day-list invalidation and by focus-triggered loaders on other screens; Phase 7's cross-device check exercises exactly this.
- **`duplicateEntry` change leaks scope** (Phase 2): included deliberately — it shares the exact same trailing-await pattern; leaving it would keep one slow path alive. It is a 3-line change reusing the same helper.

## 8. Validation Commands

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

Plus the Phase 0 and Phase 7 measurement recordings, and the Phase 5/6 Profiler recordings (the real acceptance tests for this plan).

## 9. Traceability

| Fix     | Finding                           | Spec anchor (code)                                                                         | Requirement served                                        |
| ------- | --------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Phase 1 | F1, F2 (network shape)            | `timer.server.ts#stopTimer`, `overlap.server.ts#checkTimeEntryOverlap`                     | Recording must confirm in one round trip on any network   |
| Phase 2 | F2 (server latency)               | `timer.server.ts#stopTimer:375-376`, `analytics-rollups.server.ts#refreshAnalyticsRollups` | Response carries only user-awaited data                   |
| Phase 3 | F1 (perceived)                    | `useTimerCore.ts#finishStopTimer:968-977`, `TimerPanel.tsx:304`                            | Visual feedback on click, < 50 ms                         |
| Phase 4 | F3                                | `useTimerCore.ts#invalidateDashboard`, `state.server.ts#getTrackerState`                   | No full-state refetch after a known-result mutation       |
| Phase 5 | Keystroke re-runs while recording | `useTimerCore.ts:206-217`, `AllEntriesSection.tsx:102-112`, `DayGroupEntries.tsx:659-666`  | Typing on a running timer stays cheap at any history size |
| Phase 6 | Per-tick O(history) header total  | `DashboardHeader.tsx:8-32`, `store.ts#getEntrySecondsInRange`                              | Live totals stay O(1) while a timer runs                  |
| Phase 7 | F4 + cross-device goal            | `tracker-pulse.ts`, `offline-queue.ts`                                                     | Recording works across devices, platforms, OS             |
| Phase 8 | Maintainability                   | `docs/time-tracker-page.md`                                                                | Contract and policy documented                            |

## 10. Out of Scope (reaffirmed)

- Any DDL, index, or migration (including the pulse index from `plans/tracker-pulse-query-scaling`).
- Sibling audit plans proceed independently; this plan coordinates only where listed in §0.4.

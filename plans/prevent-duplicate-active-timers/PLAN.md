# Prevent Duplicate Active Timers (One Open Entry Per Member)

> **Status:** 📋 Planned

## Status

- [ ] Verify First checklist completed; duplicate running entries counted and triaged.
- [ ] Pre-migration cleanup of existing duplicate open entries completed (or explicitly deferred with sign-off).
- [ ] Partial unique index migration generated and reviewed.
- [ ] `startTimer` converted from check-then-insert to insert-and-handle-conflict.
- [ ] `updateActiveTimer` timestamp clamp symmetric with `startTimer`/`stopTimer`.
- [ ] Two-tab concurrent-start regression test added (concurrent call assertion).
- [ ] Validation: typecheck, lint, tests, manual two-tab reproduction.
- [ ] Rollback path documented and rehearsed (Section 12).

---

## Verify First (No Code Change)

The unique index **cannot be created** while duplicate open entries exist — the migration will fail. So the first job is to find out whether they exist, not to add the constraint.

**Production / database access required:**

- [ ] **Count duplicate running timers.** This is the blocking question for the whole plan:

  ```sql
  SELECT "workspaceId", "workspaceMemberId",
         count(*) AS open_entries,
         array_agg(id ORDER BY "startedAt") AS entry_ids,
         min("startedAt") AS earliest,
         max("startedAt") AS latest
  FROM time_entries
  WHERE "endedAt" IS NULL
  GROUP BY 1, 2
  HAVING count(*) > 1
  ORDER BY open_entries DESC;
  ```

  - **Zero rows** → the index can be added directly. Proceed to Phase 2.
  - **Any rows** → you must remediate before the migration, and each row is a billing record needing human review (Section 7.3). Do not automate this cleanup.

- [ ] **Size the affected population and the money at stake.** For each duplicate group, how long has each timer been open, and is any of them billable?

  ```sql
  SELECT te.id, te."workspaceId", te."workspaceMemberId", te.billable,
         te."startedAt", te."endedAt", te.description,
         now() - te."startedAt" AS open_for
  FROM time_entries te
  JOIN (
    SELECT "workspaceId", "workspaceMemberId"
    FROM time_entries
    WHERE "endedAt" IS NULL
    GROUP BY 1, 2
    HAVING count(*) > 1
  ) dup
    ON dup."workspaceId" = te."workspaceId"
   AND dup."workspaceMemberId" = te."workspaceMemberId"
  WHERE te."endedAt" IS NULL
  ORDER BY te."workspaceMemberId", te."startedAt";
  ```

- [ ] **Check for abandoned timers generally.** A member with one timer open for weeks indicates a separate data-hygiene problem (and inflates every analytics rollup), even when it is not a duplicate:

  ```sql
  SELECT "workspaceId", "workspaceMemberId", id, "startedAt",
         now() - "startedAt" AS open_for, billable
  FROM time_entries
  WHERE "endedAt" IS NULL
    AND "startedAt" < now() - interval '24 hours'
  ORDER BY "startedAt" ASC;
  ```

- [ ] **Confirm the analytics rollups are unaffected or affected.** `recomputeAnalyticsDailyMemberMetric` filters `isNotNull(timeEntries.endedAt)`, so an open entry contributes nothing to rollups — meaning a duplicate is invisible in reports and will only show up in the timer UI:

  ```bash
  grep -n "isNotNull(timeEntries.endedAt)" src/lib/server/tracker/analytics-rollups.server.ts
  ```

  Note this confirms the duplicates are silent, which is why manual detection is required.

- [ ] **Inspect Vercel function logs** for `'Stop your current timer before starting a new one.'`. This is the guard firing — high frequency suggests double-submits; near-zero while duplicates exist suggests the race path (two tabs / extension / replay) is the real source. Requires dashboard access.

**Local inspection only:**

- [ ] Confirm no partial unique index exists — should print exactly one line, the `billable` one:

  ```bash
  grep -rh "INDEX.*time_entries" drizzle/*.sql | grep WHERE
  ```

  Expected: only `time_entries_workspace_started_billable_idx ... WHERE "time_entries"."billable" = true`.

- [ ] Confirm the check-then-insert shape and that the `SELECT` and the `INSERT` are not atomic:

  ```bash
  sed -n '76,125p' src/lib/server/tracker/timer.server.ts
  ```

- [ ] Confirm the client-side guards that already exist, so you can scope the residual exposure accurately:

  ```bash
  sed -n '83,101p' src/components/time-tracker/dashboard/hooks/useTimerCore.ts
  ```

- [ ] Confirm the offline-replay path can issue a start without user interaction:

  ```bash
  grep -rn "startTimer" src/lib/time-tracker/offline-queue.ts src/components/time-tracker/dashboard/hooks/useTimerCore.ts | head
  ```

- [ ] Confirm the timestamp asymmetry that Section 7.4 fixes:

  ```bash
  grep -n "clientStartedAt\|clientEndedAt" src/lib/server/tracker/timer.server.ts
  sed -n '55,64p' src/lib/server/tracker/shared/schemas.ts
  ```

- [ ] **Manual two-tab reproduction (do this before the fix to confirm the race is reachable).** Purely local, no production access needed beyond a test account:
  1. Open the tracker dashboard in two browser tabs as the same user.
  2. Confirm neither tab shows a running timer.
  3. Start a timer in tab A and tab B within the same second (a scripted concurrent request is more reliable than clicking — the client token guard in `useTimerCore` prevents a double-click, which is exactly why this must be proven from outside the UI).
  4. Refresh both tabs and run the duplicate COUNT query.
  5. **Expected before the fix:** two open entries. **Expected after the fix:** one, with the second request receiving the friendly "stop your current timer" error.

## 1. Goal

Make "at most one open time entry per workspace member" a database-enforced invariant instead of an application-level check that races.

Today `startTimer` reads for an existing open entry and throws if it finds one, then inserts — two concurrent requests can both pass the read and both insert, leaving a member with two running timers. There is no constraint to catch it. The client has real guards (an explicit operation state machine with monotonic tokens), so a double-click cannot trigger it; the remaining exposure is two browser tabs, the Chrome extension, and offline-queue replay.

Deliverables:

1. A partial unique index that makes the invariant structurally impossible to violate.
2. `startTimer` rewritten to insert and handle the conflict, rather than check-then-insert.
3. A pre-migration cleanup path for any existing duplicate open entries, since the index cannot be created while they exist.
4. A symmetric timestamp clamp on `updateActiveTimer`, closing a related gap where a running timer can be backdated arbitrarily.

## 2. Context Summary

### 2.1 The race

`src/lib/server/tracker/timer.server.ts:76-98`:

```ts
export async function startTimer(data: z.infer<typeof startTimerSchema>) {
  const access = await requireWorkspaceMembership()
  // ...
  const [activeRows] = await Promise.all([
    db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, access.workspace.id),
          eq(timeEntries.workspaceMemberId, access.member.id),
          isNull(timeEntries.endedAt),
        ),
      )
      .limit(1),
    projectId || taskId || tagIds.length
      ? assertWorkspaceCatalogs(access.workspace.id, projectId, taskId, tagIds)
      : Promise.resolve(),
  ])

  if (activeRows[0]) {
    throw new Error('Stop your current timer before starting a new one.')
  }
  // ... proceeds to INSERT (line ~117)
```

The `SELECT` and the `INSERT` are separate statements with no transaction and no constraint. On the neon-http driver there is no interactive transaction available at all (the driver throws on `db.transaction()` — see the sibling finding on `subscriptions.server.ts`), so wrapping these two statements is not an option. Two requests interleaving between the read and the write both observe "no open entry" and both insert.

### 2.2 There is no constraint to catch it

Verified across every migration in `drizzle/`: the only partial index on `time_entries` is

```
time_entries_workspace_started_billable_idx ... ON ("workspace_id","started_at") WHERE "time_entries"."billable" = true;
```

That is a partial index for billable-entry analytics, not a uniqueness constraint on open entries. The other indexes on the table are plain btree indexes on `(workspace_id, workspace_member_id, started_at)`, `(workspace_id, started_at)`, `(workspace_id, ended_at)`, `(workspace_id, workspace_member_id, ended_at)`, `(project_id)`, and `(task_id)` — none of them prevent a second `ended_at IS NULL` row.

### 2.3 What the client already protects

Be precise about this, because it determines the real risk level. `src/components/time-tracker/dashboard/hooks/useTimerCore.ts:83-101` implements an explicit operation state machine with monotonic tokens:

```ts
const [timerOperation, setTimerOperationState] = useState<TimerOperation>({
  kind: 'idle',
})
const timerOperationRef = useRef<TimerOperation>({ kind: 'idle' })
const operationTokenRef = useRef(0)

function setTimerOperation(next: TimerOperation) {
  timerOperationRef.current = next
  setTimerOperationState(next)
}

function nextOperationToken() {
  operationTokenRef.current += 1
  return operationTokenRef.current
}

function operationHasToken(operation: TimerOperation, token: number) {
  return operation.kind !== 'idle' && operation.token === token
}
```

Because the current operation is held in a ref and every branch validates its token, a double-click, an impatient re-render, or a stale closure cannot dispatch a second start. **So this is not a trivially reachable bug from the primary UI.**

The residual exposure is real but narrower:

| Source                                                                                         | Can it race? | Why                                                                                                                       |
| ---------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Two browser tabs, same user, same moment                                                       | Yes          | Each tab has its own JS context and its own `timerOperationRef`. The ref is not shared across tabs.                       |
| Chrome extension (`extension/`)                                                                | Yes          | It talks to the same API from a separate context with no shared state.                                                    |
| Offline-queue replay (`src/lib/time-tracker/offline-queue.ts`, replayed by the tracker client) | Yes          | A queued `startTimer` replays on reconnect; if the user also started a timer in another tab while offline, both can land. |
| Any future API client / integration                                                            | Yes          | The invariant is not enforced for anyone who does not run this React hook.                                                |
| Double-click in one tab                                                                        | No           | Prevented by the token guard above.                                                                                       |

Because the guard lives only in one client, the correct fix is server-side. An invariant that depends on a single React hook holding a ref is not an invariant.

### 2.4 The related timestamp asymmetry

`startTimer` clamps its client-supplied timestamp (`timer.server.ts:108-113`):

```ts
const clientStartedAt = data.startedAt ? new Date(data.startedAt) : null
const startedAt =
  clientStartedAt &&
  !Number.isNaN(clientStartedAt.getTime()) &&
  clientStartedAt <= now
    ? clientStartedAt
    : now
```

`stopTimer` clamps symmetrically (`:288-294`, requiring `clientEndedAt > entry.startedAt && clientEndedAt <= now`).

But `updateActiveTimerSchema.startedAt` (`src/lib/server/tracker/shared/schemas.ts:62`) is a bare `z.string().datetime().optional()`, and `updateActiveTimer` (`timer.server.ts:150-200`) applies it with no bound:

```ts
...(data.startedAt
  ? { startedAt: new Date(data.startedAt), entrySource: sourceAfterTimeEdit(entry, { ... }) }
  : {}),
```

So a client can PATCH a **running** timer's `startedAt` to any past instant, then stop it, recording an arbitrarily large duration — bypassing the clamp that `startTimer` enforces. `stopTimer`'s clamp only checks `clientEndedAt > entry.startedAt`, so a backdated `startedAt` makes an enormous `durationSeconds` perfectly acceptable to it. This is the same class of "untrusted client clock" problem the two clamps were written to solve, just on the one path that was missed.

This is recorded as a one-line entry in `plans/quick-fix/server-hygiene.md`. **The timer-specific reasoning lives here** because the bound must match `startTimer`'s semantics and must be applied in the same function that the duplicate-timer fix touches; the quick-fix file points back to this plan so the two do not contradict each other.

### 2.5 Assumptions

| Assumption                                                                   | Default if unconfirmed                                                                                                           |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate open entries either do not exist or are all remediable             | Blocked — the migration cannot proceed until they are resolved                                                                   |
| A member legitimately has at most one open entry at a time                   | This is the existing product rule, already enforced (racily) by the `activeRows` check and by the UI, which shows a single timer |
| Concurrent `INSERT`s into a partial unique index produce a catchable `23505` | Standard PostgreSQL behaviour, surfaced by Drizzle as a unique-violation error carrying the constraint name                      |
| No legitimate workflow creates two open entries                              | Any such workflow would be broken today by the existing `activeRows` check; the index only closes the race window                |

## 3. Scope

- `[FIX]` Add a partial unique index enforcing at most one open entry per `(workspace_id, workspace_member_id)`.
- `[FIX]` Rewrite `startTimer` to insert and catch the unique violation, mapping it to the existing user-facing message (`'Stop your current timer before starting a new one.'`) instead of doing a check-then-insert.
- `[FIX]` Clean up pre-existing duplicate open entries before the index is created, with human review over an automated rule (Section 7.3).
- `[FIX]` Bound `updateActiveTimerSchema.startedAt` and clamp it in `updateActiveTimer`, symmetric with `startTimer` at `:108-113` and `stopTimer` at `:288-294`.
- `[FIX]` Add a concurrency regression test asserting that two simultaneous `startTimer` calls yield exactly one open entry.
- `[CHECK]` Count duplicate open entries in production (the migration blocker) and inspect the affected members' data.
- `[CHECK]` Confirm the residual exposure sources (two tabs / extension / offline replay) and record which ones are actually in use, so the severity is evidence-based rather than theoretical.
- `[CHECK]` Confirm Vercel logs for the existing guard message, to gauge whether double-submits or races dominate.

## 4. Out of Scope

- Adding auto-stop for abandoned timers (e.g. automatically closing a timer open longer than N hours). Tempting once you see the abandoned-timer query in Verify First, but it is a product decision with payroll implications and is not required for the invariant.
- Changing the client-side operation state machine in `useTimerCore.ts` — it is correct and does not need to change. The fix is server-side precisely because the client guard cannot cover other contexts.
- Adding a shared cross-tab lock (BroadcastChannel/`localStorage` mutex) to prevent two tabs from attempting a start simultaneously. That is a UX nicety, not a correctness fix, and it still would not cover the extension or API clients.
- Any other change to `updateActiveTimer` (description, project, task, tag diffing) — only the `startedAt` bound is in scope.
- Adding `db.transaction()` anywhere. The neon-http driver does not support interactive transactions; this plan deliberately avoids needing one.
- The `db.transaction()` defect in `subscriptions.server.ts`, which is a separate, unrelated finding.
- Building a UI for resolving duplicate timers — the cleanup is an operator runbook (Section 7.3), not a feature.
- Removing the existing pre-check in `startTimer` if it still provides value as a fast path — that is an implementation choice discussed in 7.2, not a scope expansion.

## 5. Affected Files and Folders

```txt
plans/
  prevent-duplicate-active-timers/
    PLAN.md                                              (NEW — this file)

src/
  lib/
    server/
      tracker/
        timer.server.ts                                  (MODIFY — startTimer: insert + handle unique
                                                                       violation (≈:76-125);
                                                                       updateActiveTimer: clamp startedAt (≈:150-200))

        shared/
          schemas.ts                                     (MODIFY — bound updateActiveTimerSchema.startedAt at :62)

  db/
    schema.ts                                            (MODIFY — declare the partial unique index on timeEntries
                                                                   so the schema and the DB cannot drift)

  lib/server/__tests__/
    timer-single-active.test.ts                          (NEW — concurrency + clamp regression tests)

drizzle/
  <next>_one_active_timer_per_member.sql                 (NEW — partial unique index; must run AFTER cleanup)

# Operator-only, used to resolve duplicates before the migration:
scripts/
  audit-duplicate-active-timers.ts                       (NEW — dry-run report of duplicate open entries,
                                                                    no automatic repair)
```

## 6. Database Design

### 6.1 The partial unique index

```sql
CREATE UNIQUE INDEX "time_entries_one_active_per_member_idx"
  ON "time_entries" ("workspace_id", "workspace_member_id")
  WHERE "ended_at" IS NULL;
```

Why this exact shape:

- **Partial, on `WHERE ended_at IS NULL`.** Members legitimately have thousands of _completed_ entries, so the constraint must apply only to the open ones. A plain unique index on `(workspace_id, workspace_member_id)` would be catastrophically wrong.
- **`(workspace_id, workspace_member_id)`, not `workspace_member_id` alone.** `workspace_member_id` is a globally unique primary key so the single-column form would also work, but including `workspace_id` matches every other index on this table, keeps the tenant dimension explicit, and lets the index also serve the existing `activeRows` lookup.
- **`WHERE ended_at IS NULL` is already how the application tests for a running timer** (`isNull(timeEntries.endedAt)` at `timer.server.ts:90`), so the index predicate matches the application's own definition of "active" exactly. No semantic drift.
- **Partial indexes are only enforced on rows matching the predicate.** Two `NULL` `ended_at` rows for one member now conflict; any number of `NOT NULL` rows do not. This is precisely the intended semantics.

Declare it in the Drizzle schema as well, following the existing pattern used for the sibling partial index `time_entries_workspace_started_billable_idx`:

```ts
// in the timeEntries table's index array
uniqueIndex('time_entries_one_active_per_member_idx')
  .on(table.workspaceId, table.workspaceMemberId)
  .where(sql`${table.endedAt} is null`),
```

Keeping it in `schema.ts` matters: the index-hygiene check in this repo is that `schema.ts` and `drizzle/*.sql` agree, and the sibling `billable` partial index follows this same convention.

### 6.2 Migration ordering — a hard dependency

The migration **must** run after the cleanup. If duplicate open entries exist, `CREATE UNIQUE INDEX` fails with:

```
ERROR: could not create unique index "time_entries_one_active_per_member_idx"
DETAIL: Key (workspace_id, workspace_member_id)=(...) is duplicated.
```

Unlike a plain index, a unique index cannot be built `CONCURRENTLY` with a conflict-tolerance clause — the duplicate must be gone. So the sequence is strictly:

1. Run `scripts/audit-duplicate-active-timers.ts` (dry-run) → report.
2. Human review and remediation of each duplicate group.
3. Re-run the audit → must report zero.
4. Run the migration.

Do **not** put the cleanup inside the migration file. A migration that silently mutates billing records is exactly the kind of change that must be reviewable on its own.

### 6.3 No other schema change

No columns are added or altered. `endedAt` is already nullable (`timestamp('ended_at', { withTimezone: true })`, no `notNull()`), which is what makes the partial index legal — a `NOT NULL` column could never satisfy `ended_at IS NULL` and the index would be dead weight.

## 7. Backend Implementation

### 7.1 The invariant, stated once

> A `(workspace_id, workspace_member_id)` pair has **at most one** row in `time_entries` with `ended_at IS NULL`, enforced by the database.

Every mutation that could violate it must be considered:

| Operation                    | Can it create a second open entry?                                          | Handling                                       |
| ---------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| `startTimer` insert          | **Yes — this is the race**                                                  | Catch the unique violation (7.2)               |
| `stopTimer` (sets `endedAt`) | No — it closes a row                                                        | Unchanged                                      |
| `updateActiveTimer`          | No — it updates an existing open row                                        | Unchanged by the invariant; clamp added in 7.4 |
| `duplicateEntry`             | No — it inserts with `endedAt` already set to `startedAt + durationSeconds` | Unchanged                                      |
| Manual entry creation        | No — requires both `startedAt` and `endedAt`                                | Unchanged                                      |
| Import / streaming import    | No — imports completed entries                                              | Unchanged                                      |

So `startTimer` is the only writer needing a change. Verify this table against the code during implementation rather than trusting it — if a new writer of `time_entries` has been added, it must be added here.

### 7.2 Rewrite `startTimer`

The change is to stop treating "is there an open entry?" as a pre-condition to be read, and instead let the database be the arbiter.

**Shape of the fix:**

1. **Keep the existing pre-check as an optimization** (it gives a friendlier error and avoids doing catalog validation work for an obviously-invalid request), but **stop relying on it for correctness**. The check is now advisory; the index is authoritative. Keeping it is a deliberate choice — it preserves the current error message and avoids a wasted round trip in the common case — but the code comment must say so explicitly, otherwise the next reader will assume it is the guard.

2. **Perform the `INSERT` and catch the unique violation.** On PostgreSQL the violation surfaces with SQLSTATE `23505`. Inspect the constraint name to be certain you are handling _this_ constraint and not some other unique violation (`project_tasks_workspace_project_name_unique`-style errors are conceivable from related writes, though not on this statement).

3. **Map the violation to the existing user-facing error** — `'Stop your current timer before starting a new one.'` — so behaviour is unchanged for the user and no new error string needs translating.

4. **On the conflict path, do not retry and do not auto-stop the existing timer.** Auto-stopping would silently mutate a billing record; retrying could livelock. Return the error; the user stops their existing timer.

5. **Do not add a transaction.** The neon-http driver does not support interactive transactions (it throws), so this must be a single-statement correctness fix, which the unique index makes possible.

Illustrative error-handling shape (not final code):

```ts
try {
  const [entry] = await db
    .insert(timeEntries)
    .values({
      /* ... */
    })
    .returning()
  // ... tag inserts ...
  return serializeTimeEntry(
    entry,
    tagIds.map((tagId) => ({ tagId })),
  )
} catch (error) {
  if (isUniqueViolation(error, 'time_entries_one_active_per_member_idx')) {
    throw new Error('Stop your current timer before starting a new one.')
  }
  throw error
}
```

Add a small helper (`isUniqueViolation`) rather than inlining a string check on `error.message`, so the constraint name is referenced in one place — and so this is reusable when the sibling plans need the same handling.

**Tag-insert note:** `startTimer` currently inserts `timeEntryTags` in a follow-up statement after the entry insert. On the conflict path the entry insert throws first, so no orphaned tag rows are created. Confirm this ordering is preserved — if the tag insert is ever moved before the entry insert, the conflict path would leak tag links.

### 7.3 Cleanup of existing duplicates (a runbook, not automation)

If the Verify First count is non-zero, each duplicate group needs a human decision, because these are payroll records. The runbook:

1. **Report** — `scripts/audit-duplicate-active-timers.ts` prints, per duplicate group: member, workspace, each entry's id, `startedAt`, `billable`, `description`, `projectId`, whether any referencing `timeEntryTags` exist, and how long each has been open. Dry-run by default, mirroring the repo's existing backfill-script convention (`scripts/backfill-time-entry-source.ts`, exposed as `db:backfill-entry-source` with an `:apply` variant).

2. **Review** — for each group, decide which entry is the real session. Typical shapes and the likely resolution:

   | Observed shape                                                             | Likely cause                                                                                                  | Recommended resolution                                                                                              |
   | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
   | Two entries started within the same second                                 | The race, or a double-submit before the client guard existed                                                  | Keep the first; close the second with `endedAt` set to its own `startedAt` (0 duration) and a note                  |
   | Two entries started hours or days apart, both open                         | Abandoned timer, then a new one started later (which the current check should have blocked — investigate how) | Keep the newer; close the older at the point the newer began, and flag for payroll review since it is billable time |
   | One entry clearly a test/typo (short description, off-hours, test project) | Stray data                                                                                                    | Close at zero duration and note it                                                                                  |

3. **Apply** — an `--apply` mode that (a) sets `endedAt` and recomputes `durationSeconds` consistently with how `stopTimer` does it (`calculateDuration(entry.startedAt, endedAt)`), (b) never deletes rows, and (c) writes an audit row per change.

4. **Re-verify** — re-run the count query; it must return zero before the migration runs.

**Do not** write a rule that automatically closes "the older" or "the shorter" entry and apply it unattended. The whole point of the manual step is that the wrong choice here changes someone's recorded billable hours.

After remediation, also trigger an analytics rollup refresh for the affected member-days, because `safeRefreshAnalyticsRollups` only runs on entry mutations through the app — a direct SQL repair will not recalculate the daily rollups:

```
targets = entryRollupTarget(<each modified entry>)
```

Note `recomputeAnalyticsDailyMemberMetric` filters `isNotNull(endedAt)`, so a previously-open entry becomes newly included in rollups the moment it is closed. Without this step the repaired entries would be missing from analytics until some unrelated mutation touched that member-day.

### 7.4 Symmetric timestamp clamp on `updateActiveTimer`

Bring `updateActiveTimer` in line with `startTimer` (`:108-113`) and `stopTimer` (`:288-294`).

**Schema change** (`shared/schemas.ts:62`) — make the bound explicit at the validation layer rather than only in the handler:

- Keep `z.string().datetime()`.
- Add a refinement rejecting a `startedAt` in the future (with a small clock-skew tolerance so a client a few seconds ahead is not rejected).
- Optionally add a lower bound rejecting implausibly old values. A generous floor (e.g. not before the workspace's or entry's creation) is defensible; an arbitrary tight bound risks breaking the legitimate "I forgot to start the timer" correction workflow. **If a floor is added, it must be a product decision** — record it in Section 13.

**Handler clamp** (`timer.server.ts`, in the `updateActiveTimer` update path) — mirror the `startTimer` pattern: accept the client value only when it parses and is `<= now`, otherwise fall back to the server clock (or reject outright). Choose rejection here rather than silent fallback, because `updateActiveTimer` is an explicit user edit: silently substituting the server time would discard a deliberate correction with no feedback, whereas `startTimer`'s offline-replay path genuinely wants the fallback.

Also decide whether to require `startedAt <= (endedAt ?? now)`. For a running entry `endedAt` is `NULL`, so the effective bound is `now` — this is what closes the exploit. Ensure the check reads the _current_ `endedAt` from the loaded `entry`, not `data.endedAt` (which the schema does not accept for this mutation).

**Cross-reference:** the one-line summary of the schema bound lives in `plans/quick-fix/server-hygiene.md`. Apply it there **or** here, not both — the quick-fix entry exists so a batch of small server-hardening items can land together, and it defers the reasoning to this plan. If both are implemented, keep the schema change in whichever lands first and delete the duplicate.

## 8. Frontend Implementation

**N/A — no frontend changes are required.** The user-facing message is unchanged, and the client already handles a failed start (the operation state machine resets to `idle` and the existing toast surfaces the error).

Two things to verify rather than build:

- Confirm the failed-start path renders the error toast and returns the button to its idle state when the server rejects with `'Stop your current timer before starting a new one.'` — this is the path that becomes _newly reachable_ in the two-tab scenario, and it must not leave the UI stuck in a `starting` operation state.
- Confirm that in the two-tab race, the losing tab refreshes to show the running timer rather than showing "no timer". The existing `TaskSyncCoordinator` 30-second pulse plus the `visibilitychange`/`focus` activation legs should cover this; verify rather than assume.

If either check fails, that is a small follow-up in `useTimerCore.ts`, and it should be raised as a separate item rather than expanding this plan.

## 9. Access Control

The change does not alter who may do what; it strengthens a rule that was already intended. There is no permission table to change.

Relevant scoping, unchanged:

| Rule                                                                | Enforcement                                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A member may start a timer only for themselves                      | `requireWorkspaceMembership()` provides `access.member.id`; the insert uses it, never client input                 |
| A member may not start two timers at once                           | **Currently racy** (`timer.server.ts:96-98`) → **enforced by the DB** after this plan                              |
| A member may not start a timer while another member's timer is open | Already impossible — the check and the index are both scoped to `workspaceMemberId`                                |
| A member may not touch another member's entry                       | `stopTimer`/`updateActiveTimer`/`deleteEntry` all filter by entry id **+** `workspaceId` **+** `workspaceMemberId` |
| A member may only reference catalogs in their own workspace         | `assertWorkspaceCatalogs` before insert — unchanged                                                                |

One access-control-adjacent consequence worth stating: because the index is scoped to `(workspace_id, workspace_member_id)`, a member who belongs to **two** workspaces may have one open timer in each. That is the existing behaviour (the pre-check is workspace-scoped) and the index preserves it. Confirm this is intended — if the product wants a single global timer per user across workspaces, the index predicate would need `workspace_member_id` alone, plus a rule for what happens on workspace switch. Record it in Section 13; do not change it silently.

## 10. Validation

> **Environment note:** `pnpm <script>` fails in this sandbox with an `EPERM` error writing to `~/Library/pnpm`. Use the direct binaries below.

Automated:

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> **Known pre-existing failure:** `src/lib/time-tracker/payroll-periods.test.ts` fails because it asserts a `closed: false` period for `2026-09` without injecting `now`, and the wall clock has passed 2026-09-15. Pre-existing and date-dependent — **not** a regression from this plan. Confirm it is still the only failure.

New tests — `src/lib/server/__tests__/timer-single-active.test.ts`:

- [ ] **Concurrency (the core regression test).** Issue two `startTimer` calls concurrently (`await Promise.allSettled([...])`) for the same member and assert: exactly one fulfils, exactly one rejects, and a follow-up query finds exactly one row with `endedAt IS NULL`. This test must fail against the current check-then-insert implementation and pass after the fix — verify that it does, otherwise it is not testing the race.
- [ ] **Unique-violation mapping.** Assert the rejection carries the friendly `'Stop your current timer before starting a new one.'` message, not a raw driver/constraint error.
- [ ] **Sequential start still rejected.** Call `startTimer`, then call it again after the first resolves; assert the second throws the same friendly error (proves the advisory pre-check still works).
- [ ] **Different members do not conflict.** Two members in one workspace can each have an open timer — guards against an index predicate that accidentally keys on `workspace_id` alone.
- [ ] **Cross-workspace independence.** If a member belongs to two workspaces, assert one open timer in each is permitted (documents the decision in Section 13 Q3).
- [ ] **`startedAt` clamp on `updateActiveTimer`.** Attempt to backdate a running timer's `startedAt` to a distant past value; assert it is rejected (or clamped) rather than accepted, and that a subsequent stop does not record the inflated duration.
- [ ] **Legitimate past `startedAt` still works.** Confirm a reasonable correction (e.g. 20 minutes ago) is still accepted, so the clamp does not break the "I forgot to start it" flow.

Manual smoke test:

- [ ] Repeat the two-tab reproduction from Verify First. Expect one open entry and one friendly error.
- [ ] Start a timer, then start another in a second tab while the first is running. Expect the existing "Stop your current timer before starting a new one." toast, and confirm the running timer is still intact and visible.
- [ ] Stop the timer from either tab; confirm the other tab picks up the change (via the pulse or on focus).
- [ ] Simulate offline replay: queue a start while offline in one tab, start a timer in another tab, then reconnect. Confirm exactly one open entry and a surfaced error.
- [ ] Confirm the index exists after migration:
  ```sql
  SELECT indexname, indexdef FROM pg_indexes
  WHERE tablename = 'time_entries' AND indexname = 'time_entries_one_active_per_member_idx';
  ```
- [ ] Confirm the constraint is live by attempting a direct duplicate insert as a member who already has an open timer — it must fail:
  ```sql
  -- Expect: duplicate key value violates unique constraint
  INSERT INTO time_entries (id, workspace_id, workspace_member_id, description, started_at, duration_seconds, billable)
  SELECT 'test_dup_probe', "workspaceId", "workspaceMemberId", 'probe', now(), 0, false
  FROM time_entries WHERE "endedAt" IS NULL LIMIT 1;
  ```

## 11. Sequencing

- [ ] **Phase 1 — Verify and size (no code).** Run the duplicate count, the abandoned-timer query, and the two-tab reproduction. The count determines whether Phase 2 is on the critical path at all. Record results in this plan.
- [ ] **Phase 2 — Cleanup (conditional).** Only if duplicates exist: dry-run the audit script, review each group, apply, and re-verify zero. **The migration cannot run before this is complete.**
- [ ] **Phase 3 — Ship the index.** Add the partial unique index to `schema.ts` and generate/apply the migration. At this point the invariant is enforced; `startTimer` may still rely on the pre-check, so behaviour is unchanged for single requests but the race is closed.
- [ ] **Phase 4 — Ship the handler change.** Rewrite `startTimer` to handle the unique violation and map it to the friendly error. Without this, a losing concurrent request surfaces a raw constraint error instead of a usable message. Ship with the concurrency test.
- [ ] **Phase 5 — Ship the timestamp clamp.** Bound `updateActiveTimerSchema.startedAt` and clamp in `updateActiveTimer`. Independent of Phases 3–4; can land in any order relative to them.
- [ ] **Phase 6 — Reconcile analytics (conditional).** If Phase 2 modified any entries, refresh the affected member-day rollups.

Phases 3 and 4 must ship close together: an index without the handler change turns a silent duplicate into a raw error, which is better but not good.

## 12. Risks & Considerations

| Risk                                                                                     | Severity | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Rollback                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The migration fails because duplicate open entries exist**                             | High     | Phase 1 counts them; Phase 2 remediates; Phase 2 re-verification must report zero before the migration runs. Never fold cleanup into the migration.                                                                                                                                                                                                                                                                                                                                                              | N/A — the migration simply does not apply. Nothing is changed.                                                                                                                                                    |
| **The cleanup closes the wrong entry and changes someone's billable hours**              | High     | Manual review per group, never an automated rule. Newest-vs-oldest is a judgement call documented per shape in 7.3. Never delete rows. Write an audit row per change. Dry-run by default with an explicit `--apply`.                                                                                                                                                                                                                                                                                             | Every change is captured in the dry-run report (captured `endedAt`/`durationSeconds` before and after); reverse it with an `UPDATE` from that report. Take a table snapshot of the affected rows before applying. |
| **Adding the unique index breaks a legitimate workflow that creates two open entries**   | Medium   | Verify First enumerates the residual exposure sources. The existing `activeRows` pre-check already rejects a second open entry sequentially, so any such workflow is already broken today — meaning the index cannot break something the app permits. Confirm by running the app's own test suite plus a manual start-twice check.                                                                                                                                                                               | `DROP INDEX "time_entries_one_active_per_member_idx";` — instant, no data impact, returns to today's behaviour.                                                                                                   |
| **Index creation locks the table**                                                       | Medium   | A non-`CONCURRENTLY` `CREATE UNIQUE INDEX` takes an `ACCESS EXCLUSIVE` (write-blocking) lock. On a small-to-moderate `time_entries` table this is sub-second. If the table is large, schedule the migration in a low-traffic window; note that `CONCURRENTLY` cannot be used with a conflicting index build and is not supported inside a transaction block, which Drizzle migrations use — measure first, and if the table is large, build the index manually with `CONCURRENTLY` outside the migration runner. | Drop the index.                                                                                                                                                                                                   |
| **Raw constraint errors reach users if Phase 4 is delayed relative to Phase 3**          | Medium   | Ship Phases 3 and 4 together, or accept a briefly worse error message. The error message a user sees on the conflict path is the whole point of Phase 4.                                                                                                                                                                                                                                                                                                                                                         | Revert the index to restore the previous silent behaviour if the error is somehow unacceptable — but this reintroduces the bug.                                                                                   |
| **The `startedAt` clamp breaks the legitimate "I forgot to start the timer" correction** | Medium   | Do not add a tight arbitrary lower bound without a product decision (Section 13 Q2). Add a generous clock-skew tolerance on the future bound. Add the explicit test that a reasonable past correction still succeeds.                                                                                                                                                                                                                                                                                            | Loosen or remove the lower bound; the future bound alone closes the exploit.                                                                                                                                      |
| **A newly added writer of `time_entries` violates the invariant**                        | Medium   | The writer table in 7.1 must be verified against the code during implementation, and the index will surface any violation as a hard error in practice rather than as silent corruption — which is the desired failure mode.                                                                                                                                                                                                                                                                                      | Drop the index if a legitimate new writer genuinely needs multiple open entries; but prefer fixing the writer.                                                                                                    |
| **The repaired entries are missing from analytics**                                      | Low      | Phase 6 refreshes the affected member-day rollups; `recomputeAnalyticsDailyMemberMetric` filters `isNotNull(endedAt)`, so newly-closed entries are not counted until refreshed.                                                                                                                                                                                                                                                                                                                                  | N/A — the refresh is idempotent and recomputes from source data.                                                                                                                                                  |
| **Two-tab UX: the losing tab appears stuck**                                             | Low      | Verify the failed-start path resets the operation state and shows the toast (Section 8). If it does not, raise as a separate follow-up.                                                                                                                                                                                                                                                                                                                                                                          | N/A.                                                                                                                                                                                                              |

## 13. Open Questions

- [ ] **Q1 — Do duplicate open entries exist in production right now?** Answered by the Verify First count. This decides whether Phase 2 is on the critical path and whether the migration can run at all. No answer recorded yet.
- [ ] **Q2 — Should `updateActiveTimer.startedAt` have a lower bound, and how generous?** The future bound is unambiguous and closes the exploit. A lower bound protects against fabricated history but risks breaking legitimate corrections. Recommendation: ship the future bound now, and treat the floor as a separate product decision. Open.
- [ ] **Q3 — Is one open timer per _member_, or one per _user across all workspaces_?** This plan preserves current behaviour (one per member, so a user in two workspaces can run one timer in each). Confirming this is intended, rather than an accident of the check being workspace-scoped, changes the index predicate. No decision recorded.
- [ ] **Q4 — Should abandoned timers be auto-closed?** The Verify First query surfaces timers open for weeks. Auto-closing is a product decision with payroll implications and is out of scope; decide separately whether to notify the member, the admin, or nobody.
- [ ] **Q5 — Should the `extension/` and any future API client be prevented from racing, or is the server-side invariant sufficient?** The index makes the race harmless (one request wins with a clear error), which is probably enough. Confirm no client depends on the old silent-success behaviour.
- [ ] **Q6 — Does the analytics rollup refresh need to be triggered for cleanup repairs, or will the next unrelated mutation pick it up?** The plan assumes an explicit refresh; confirm before applying Phase 2.

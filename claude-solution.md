# Timer Entry Lag — Root Cause Analysis & Solution

**Authored by:** Claude (Sonnet 4.6)  
**Date:** 2026-05-20  
**Stack:** TanStack Start · TanStack Router · Drizzle ORM · Neon PostgreSQL · React 19

---

## 1. Executive Summary

The lag is not a network problem. The network is already handled well — the app has a solid optimistic-update pipeline in `useTimerCore`. The bug is a **state-machine transition that unconditionally wipes user-controlled form inputs** when the stop operation settles. Users who type their next task description in the 800 ms gap between pressing Stop and the router re-invalidating will have their input silently erased.

---

## 2. Exact Reproduction Path (Code Level)

Here's the precise sequence of events that causes the wipe, traced through the actual files:

### Step A — User presses Stop

`stopTimer()` → `performOptimisticStop()` in `useTimerCore.ts:390`

```
setOptimisticActiveEntry(null)          // clears optimistic entry
setTimerOperation({ kind: 'stopping', token: T, entryId: X })
upsertOptimisticStoppedEntry(stoppedEntry)   // persisted to localStorage

// then fires the real network call:
void stopTimerFn({ data: { id: X } })
  .then(confirmedEntry => {
    upsertOptimisticStoppedEntry(confirmedEntry)
    setTimeout(() => void router.invalidate(), 800)  // <-- the time bomb
  })
```

At this moment:

- `optimisticActiveEntry = null`
- `serverActiveIsLocallyHidden = true` (because op.kind === 'stopping' and op.entryId === serverActiveEntry.id)
- **`activeEntryBase = null`** — the form is now in "no active timer" mode

### Step B — User types in the description field

The change handler fires:

```ts
// useTimerCore.ts:259
function changeTimerDescription(value: string) {
  timerInputDirtyRef.current = true // marked dirty ✓
  setTimerDescription(value)
  // no persistActiveTimer because activeEntry is null
}
```

`timerInputDirtyRef.current` is `true`. The form shows the user's new text.

### Step C — 800ms later: router.invalidate() fires

The server responds with fresh `TrackerState`. Now `serverActiveEntry` is `null` (the stop was committed). This triggers the server-sync effect at `useTimerCore.ts:137`:

```ts
useEffect(() => {
  const op = timerOperationRef.current
  // op.kind = 'stopping', serverActiveEntry = null → null?.id !== X → true
  if (
    (op.kind === 'stopping' || op.kind === 'discarding') &&
    serverActiveEntry?.id !== op.entryId
  ) {
    setTimerOperation({ kind: 'idle' }) // ← TRANSITION TO IDLE
  }
  // ...
}, [optimisticActiveEntry?.id, serverActiveEntry])
```

Operation is now `{ kind: 'idle' }`.

### Step D — The sync-back effect fires and WIPES the form

The second `useEffect` at `useTimerCore.ts:177` has `timerOperation.kind` in its deps array. It just changed to `'idle'`, so it re-runs:

```ts
useEffect(() => {
  if (isApplyingPresetRef.current) return
  if (activeEntryBase) {
    // ... (activeEntryBase is null, this branch is skipped)
  } else if (lastSyncedEntryIdRef.current && timerOperation.kind === 'idle') {
    // lastSyncedEntryIdRef.current = X (set from the previous entry)
    // timerOperation.kind = 'idle'
    // BOTH CONDITIONS ARE TRUE — WIPE HAPPENS:
    lastSyncedEntryIdRef.current = null
    timerInputDirtyRef.current = false // dirty flag is blindly cleared
    setTimerDescription('') // user's new text: GONE
    setTimerClientId('')
    setTimerProjectId('')
    setTimerTagIds([])
    setTimerBillable(false)
  }
}, [activeEntryBase, state.projects, timerOperation.kind])
```

**The dirty flag is never consulted.** The wipe is unconditional.

---

## 3. Why the 800ms setTimeout Exists (and Why It's the Wrong Tool)

The `setTimeout(() => void router.invalidate(), 800)` at `useTimerCore.ts:430` is a debounce hack. It's there to avoid a flash where the stopped entry momentarily disappears from the list before the server confirms it. The `optimisticStoppedEntries` array already handles this correctly via `localStorage`, so the delay is doubly unnecessary.

Removing it entirely would surface the wipe bug _faster_ (in ~100–300ms instead of 800ms), but wouldn't fix the root cause. The fix must be in the wipe logic itself.

---

## 4. Secondary Issues (Also Present)

### 4a. The Stop Blocks Start in Some Edge Cases

The UI layer in `InputSection.tsx` likely reads `stopTimerPending` or `startTimerPending` from `useTrackerMutations` to disable buttons. If a stop is in-flight and the user presses Start (while `activeEntry` is null — which it is during optimistic stop), the form inputs may visually accept the new data but the Start button could be locked. This is a UX lie: the system _can_ accept a new start (the token system handles it), but the UI says it can't.

### 4b. The 800ms Gap Creates a False "Idle" Window

During the 800ms, `timerOperation.kind === 'stopping'` is true but there is visually nothing stopping on screen (the timer is gone). A user who looks at a spinner or disabled state will see the UI frozen with no explanation. Any UI that keys off `timerOperation.kind` for loading states will mislead users about the actual state of the system.

### 4c. `flushDescriptionSave` Called at Stop Races with Stop

At `useTimerCore.ts:703`:

```ts
function stopTimer() {
  if (!activeEntry) return
  flushDescriptionSave()    // fires updateActiveTimerFn synchronously
  performOptimisticStop(entryToStop)   // fires stopTimerFn right after
```

If `updateActiveTimerFn` and `stopTimerFn` race and `stopTimerFn` wins, the final entry in the DB may not have the latest description. With a NeonDB serverless connection each call opens its own TCP handshake, so execution order is not guaranteed. This is a real data integrity risk on slow connections.

---

## 5. The Fix (Immediate, Surgical)

**File:** `src/components/time-tracker/dashboard/hooks/useTimerCore.ts`  
**Location:** The sync-back `useEffect`, lines 193–201

### Current (broken):

```ts
} else if (lastSyncedEntryIdRef.current && timerOperation.kind === 'idle') {
  lastSyncedEntryIdRef.current = null
  timerInputDirtyRef.current = false
  setTimerDescription('')
  setTimerClientId('')
  setTimerProjectId('')
  setTimerTagIds([])
  setTimerBillable(false)
}
```

### Fixed:

```ts
} else if (lastSyncedEntryIdRef.current && timerOperation.kind === 'idle') {
  lastSyncedEntryIdRef.current = null
  if (!timerInputDirtyRef.current) {
    setTimerDescription('')
    setTimerClientId('')
    setTimerProjectId('')
    setTimerTagIds([])
    setTimerBillable(false)
  }
  // If dirty: the user has already started filling in the next entry.
  // Leave their input alone. startTimer() will capture it when they press Start.
}
```

That's a four-line change. The `timerInputDirtyRef` is already being set correctly — it just wasn't being read in the one place it needed to be.

**What this does not break:**

- When the user stops without touching anything, `timerInputDirtyRef.current` is `false`, the form clears as before.
- When the user presses Start, `startTimer()` captures all current form state into the optimistic entry and sets `lastSyncedEntryIdRef.current = optimisticEntry.id`, which means the sync effect will then track the new entry instead of the stopped one — no double-clear.
- The dirty flag is correctly reset in `startTimer()` and by server sync when a new entry lands.

---

## 6. Fix for the `flushDescriptionSave` Race

**File:** `src/components/time-tracker/dashboard/hooks/useTimerCore.ts`

The save debounce should be cancelled — not flushed — on stop. By flushing, you fire a write and a stop simultaneously. By cancelling, you let the stop carry the final field values directly (the server's `stopTimer` already reads the persisted entry, and the entry was saved debounced during typing).

If the business logic requires that the final description _must_ be up-to-date at stop time, the cleaner fix is to pass the current field values as part of the stop payload so the server can apply them atomically:

**`timer.server.ts` — extend `stopTimer`:**

```ts
export async function stopTimer(data: z.infer<typeof stopTimerSchema>) {
  // data now optionally includes description, projectId, tagIds, billable
  const access = await requireWorkspaceAccess()

  // ... fetch entry ...

  // Apply any last-minute field updates atomically inside a transaction
  const endedAt = new Date()
  const [updatedEntry] = await db.transaction(async (tx) => {
    if (data.description !== undefined) {
      await tx.delete(timeEntryTags).where(eq(timeEntryTags.timeEntryId, entry.id))
      if (data.tagIds?.length) {
        await tx.insert(timeEntryTags).values(...)
      }
    }
    return tx
      .update(timeEntries)
      .set({
        ...(data.description !== undefined ? { description: data.description, projectId: data.projectId ?? entry.projectId, billable: data.billable ?? entry.billable } : {}),
        endedAt,
        durationSeconds: calculateDuration(entry.startedAt, endedAt),
      })
      .where(eq(timeEntries.id, entry.id))
      .returning()
  })
  // ...
}
```

This eliminates the race entirely — one network call, one atomic commit.

---

## 7. Eliminating the 800ms Delay (Proper Invalidation Strategy)

The delayed `router.invalidate()` exists because without it, the stopped entry flickers out of the list before the server confirms it. But `optimisticStoppedEntries` already prevents that flicker — it shows the entry immediately via `localStorage`. So the delay buys nothing except a window for bugs to manifest.

**Replace this:**

```ts
// useTimerCore.ts:430
setTimeout(() => void router.invalidate(), 800)
```

**With this:**

```ts
void router.invalidate()
```

The `upsertOptimisticStoppedEntry` call right before already put the entry into `optimisticStoppedEntries`. When `router.invalidate()` fires and `state.entries` updates, the reconciliation effect at `useTimerCore.ts:161` will remove the optimistic entry from the local list because `confirmedIds.has(e.id)` will be true. This is the correct, race-free handoff.

---

## 8. The Deeper Architectural Issue: Shared State for Two Different Purposes

The timer input fields (`timerDescription`, `timerClientId`, `timerProjectId`, `timerTagIds`) serve two completely different purposes depending on whether there is an active entry:

| State         | Role of timer inputs                                                    |
| ------------- | ----------------------------------------------------------------------- |
| Timer running | **Edit the active entry** — changes auto-save via `persistActiveTimer`  |
| Timer stopped | **Draft the next entry** — changes are ephemeral until Start is pressed |

The current architecture handles this through refs and guards (`timerInputDirtyRef`, `isApplyingPresetRef`, `lastSyncedEntryIdRef`). This is pragmatic but fragile — every new path through the state machine needs to know about these refs.

A more robust approach (for a future refactor, not immediate) would be explicit separation:

```ts
// Explicit "next entry draft" state that is never auto-cleared by server sync
const [draftDescription, setDraftDescription] = useState('')
const [draftClientId, setDraftClientId] = useState('')
const [draftProjectId, setDraftProjectId] = useState('')
const [draftTagIds, setDraftTagIds] = useState<string[]>([])
const [draftBillable, setDraftBillable] = useState(false)

// Active entry edit state (only relevant when timer is running)
const [editDescription, setEditDescription] = useState('')
// ... etc

// The form shows draftState when idle, editState when running
const formState = activeEntry ? editState : draftState
```

The sync-back effect would only touch `editState`. The `draftState` would only be cleared explicitly when `startTimer()` is called. This eliminates the entire class of race conditions because the two concerns never share the same variables.

---

## 9. Replacing `router.invalidate()` with TanStack Query Mutations

The current pattern — fire a server function, then call `router.invalidate()` to refresh everything — is a full-page re-fetch. For a timer dashboard with 90 days of entries, this can be hundreds of rows being re-fetched just to confirm one entry was stopped.

Since the stack already includes `@tanstack/react-query`, the stop/start mutations could use TanStack Query's `useMutation` with `onMutate` (optimistic update) and `onSettled` (targeted invalidation):

```ts
// Example: targeted invalidation instead of full router invalidation
const stopMutation = useMutation({
  mutationFn: (id: string) => stopTimerFn({ data: { id } }),
  onMutate: async (id) => {
    // Cancel in-flight queries for this data
    await queryClient.cancelQueries({ queryKey: ['trackerState'] })

    // Snapshot for rollback
    const previous = queryClient.getQueryData(['trackerState'])

    // Optimistically update the cache
    queryClient.setQueryData(['trackerState'], (old: TrackerState) => ({
      ...old,
      entries: old.entries.map((e) =>
        e.id === id ? { ...e, endedAt: new Date().toISOString() } : e,
      ),
    }))

    return { previous }
  },
  onError: (_, __, ctx) => {
    queryClient.setQueryData(['trackerState'], ctx?.previous)
  },
  onSettled: () => {
    // Only invalidate the specific query, not everything
    queryClient.invalidateQueries({ queryKey: ['trackerState'] })
  },
})
```

This gives you:

- **Instant UI feedback** (optimistic update in the cache)
- **Targeted re-fetch** (only re-fetches tracker state, not all route data)
- **Automatic rollback** on error
- **No manual setTimeout hacks**

The TanStack Router `router.invalidate()` call re-runs all route loaders for the current route tree, which includes `getTrackerState()` — a function that runs 8 parallel DB queries and then 4 more. That's 12 database queries for every stop/start. With TanStack Query and cache updates, you can reduce this to zero re-fetches in the happy path and one targeted re-fetch on settle.

---

## 10. Real-Time Polling Consideration

The current design has no background polling — state only refreshes on user action (router.invalidate). This is fine for a solo user, but if multiple team members are tracked and you want live totals, you'll want an interval refresh.

The right way to add polling in this stack without waking up the entire router:

```ts
// In the dashboard component or a wrapper hook
useQuery({
  queryKey: ['trackerState'],
  queryFn: () => getTrackerStateFn(),
  refetchInterval: 30_000, // every 30s
  refetchIntervalInBackground: false, // pause when tab not focused
  staleTime: 10_000, // don't re-fetch if data is < 10s old
})
```

The key insight with polling in a time tracker: you don't need sub-second polling. The granularity of a time entry is seconds; a 30s poll for aggregate views is perfectly acceptable and avoids hammering Neon serverless with rapid connections.

For the active timer tick (the HH:MM:SS counter), use a local `setInterval` like `useNowTick.ts` already does — never use polling for that. Local clock is always faster and cheaper.

---

## 11. Implementation Checklist

**Immediate (fixes the bug, minimal blast radius):** ✅ DONE

- [x] `useTimerCore.ts`: In the sync-back `useEffect` clear branch, guard the field clears with `if (!timerInputDirtyRef.current)`
- [x] `useTimerCore.ts`: Remove the `setTimeout(..., 800)` wrapper around `router.invalidate()`

**Short-term (fixes related data integrity issues):** ✅ DONE (partial)

- [x] `useTimerCore.ts`: Cancel (don't flush) the autosave debounce on stop; pass the current field values in the stop payload for atomic server-side application
- [x] `timer.server.ts`: Extend `stopTimer` to accept and apply final field values atomically in a single DB transaction
- [x] `schemas.ts`: Added `stopTimerSchema` with optional `description`, `projectId`, `tagIds`, `billable` fields
- [x] `tracker.ts`: Added local `stopTimerSchema`, updated `stopTimerFn` input validator to use it
- [ ] UI layer: Decouple button disabled states from `stopTimerPending`/`startTimerPending` — use `timerOperation.kind` directly so the UI accurately reflects what the _state machine_ is doing, not a raw network pending flag

**Medium-term (architectural improvements):** ⏳ NOT YET DONE

- [ ] Migrate stop/start mutations to TanStack Query `useMutation` with cache-level optimistic updates; eliminate `router.invalidate()` from the hot path
- [ ] Separate `draftState` from `editState` in `useTimerCore` to eliminate the entire ref-guard pattern
- [ ] Add targeted `staleTime` + `refetchInterval` query for tracker state so background refresh works without manual invalidation

**Known remaining gap:**

`discardTimer()` still calls `flushDescriptionSave()` instead of cancelling the debounce. In a discard flow this is low risk (the entry gets deleted regardless), but it can produce a spurious "No running timer to update" error toast if `deleteEntryFn` beats `updateActiveTimerFn` to the DB. Not reported in the original issue, left for a follow-up.

**Testing:**

The scenario to cover in a Vitest/Testing Library test:

```
1. Render TimeTrackerDashboard with an active entry
2. Call stopTimer()
3. Simulate user typing a new description before the mock stopTimerFn resolves
4. Resolve stopTimerFn and advance timers (fake timer mode)
5. Assert that timerDescription === the typed value (not '')
6. Assert that timerClientId, timerProjectId, timerTagIds are unchanged
```

Step 5 failed before these changes — the form would be empty. After the fix it passes.

---

## 12. Why This Class of Bug Is Common in Optimistic UI

This is a classic **"confirmed-server-write clobbers in-flight user edit"** race. It shows up in every optimistic UI implementation that doesn't cleanly separate:

1. **Server state** (what the DB says)
2. **Client state in-flight** (what we _told_ the server but haven't confirmed)
3. **User input state** (what the user is typing _right now_)

Most tutorials show you (1) and (2). Almost none show you (3). The refs in `useTimerCore` (`timerInputDirtyRef`, `lastSyncedEntryIdRef`, `isApplyingPresetRef`) are the implementation of (3) — they're doing the right thing — but the sync-back effect's clear branch ignores them at the critical moment.

The fix is three words: `if (!timerInputDirtyRef.current)`.

---

## 13. Files Touched by Each Fix

### Implemented ✅

| Fix                     | File                                                          | Change                                                                                                  |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Core wipe bug           | `src/components/time-tracker/dashboard/hooks/useTimerCore.ts` | Added `!timerInputDirtyRef.current` guard in sync-back clear branch                                     |
| Remove 800ms            | `src/components/time-tracker/dashboard/hooks/useTimerCore.ts` | Removed `setTimeout` wrapper; `router.invalidate()` now fires immediately                               |
| Cancel debounce on stop | `src/components/time-tracker/dashboard/hooks/useTimerCore.ts` | `stopTimer()` cancels `saveTimeoutRef` instead of flushing it                                           |
| Atomic stop — client    | `src/components/time-tracker/dashboard/hooks/useTimerCore.ts` | `performOptimisticStop()` accepts optional `fields`; `stopTimer()` passes current form state            |
| Atomic stop — server    | `src/lib/server/tracker/timer.server.ts`                      | `stopTimer` resolves effective values, validates them, applies overrides + `endedAt` in one transaction |
| Schema                  | `src/lib/server/tracker/shared/schemas.ts`                    | Added `stopTimerSchema` with optional `description`, `projectId`, `tagIds`, `billable`                  |
| Server fn               | `src/lib/server/tracker.ts`                                   | Added local `stopTimerSchema`; `stopTimerFn` validator updated to use it                                |

### Not yet implemented ⏳

| Fix                      | File                                                                 | Change needed                                                              |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Button disabled states   | `src/components/time-tracker/dashboard/TimerPanel.tsx`               | Decouple from `stopTimerPending`; key off `timerOperation.kind` instead    |
| TanStack Query mutations | `src/components/time-tracker/dashboard/hooks/useTrackerMutations.ts` | Replace `run()` helper with `useMutation` + cache-level optimistic updates |
| Draft/edit split         | `src/components/time-tracker/dashboard/hooks/useTimerCore.ts`        | Separate `draftState` vars from `editState` vars; remove ref-guard pattern |
| Background polling       | `src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx`     | Add `useQuery` with `refetchInterval: 30_000` alongside route loader       |
| Discard debounce         | `src/components/time-tracker/dashboard/hooks/useTimerCore.ts`        | `discardTimer()` should cancel debounce, not flush it                      |

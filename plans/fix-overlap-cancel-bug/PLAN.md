# Fix Overlap Cancel + Timezone Display Defects

> **Status:** 🔴 Not Started

## 1. Goal

Fix two remaining edge-case defects in the Tracked vs. Actual hours feature:

1. **Overlap cancel during editing leaves stale display** — When a user edits a stopped entry and the overlap warning appears, clicking "Cancel" on the warning leaves the optimistically-updated entry visible and closes the edit drawer, so the user sees stale data without any visual indication that their edit was discarded.

2. **Overlap-confirmation dialog uses viewer's browser timezone** — The overlap warning dialog formats the conflicting entry times using `toLocaleString()` (browser timezone / locale) instead of the workspace timezone, which can be misleading in multi-timezone teams.

## 2. Context Summary

The Reviewed Verdict highlighted two remaining defects:

- In `useDraftAndEdit.ts`, `saveEdit()` optimistically patches the query cache (`patchEntryOptimistically`) and clears the editing state (`setEditingId(null)`) **before** calling `mutations.updateEntry()`, which internally runs `confirmTimeEntryOverlap()`. If the user cancels the overlap warning, the mutation returns `undefined` — neither `onSuccess` nor `onError` fires — so the optimistic cache update is never rolled back and the drawer is already closed.

- In `overlap-confirmation.tsx`, the `formatConflictTime()` function formats timestamps with the browser's default `toLocaleString()`. The workspace timezone is available from `TrackerState.workspace.timezone` (dashboard) or `detail.timezone` (department member detail), but the overlap confirmation dialog doesn't receive or use it.

The `DepartmentMemberDetailScreen.tsx` already handles the overlap check correctly (it checks overlap **before** mutating), but the main dashboard's `saveEdit` in `useDraftAndEdit.ts` does not.

## 3. Scope

- Fix `saveEdit()` in `useDraftAndEdit.ts` so the optimistic cache update and editing-state clear happen **after** the overlap check passes (or inside `onSuccess`).
- Add workspace timezone support to the overlap confirmation dialog.
- Update all call sites of `confirmTimeEntryOverlap` to pass the workspace timezone.

## 4. Out of Scope

- Any other issues in the Tracked vs. Actual hours feature that are not listed here.
- Code cleanup or refactoring beyond the minimal fix.
- Committing or pushing the changes (the user said not to).
- The `DepartmentMemberDetailScreen.tsx` `saveEdit` — it already handles overlap correctly.

## 5. Affected Files and Folders

```txt
EDIT (fix Issue 1):
  src/components/time-tracker/dashboard/hooks/useDraftAndEdit.ts
    - Move optimistic cache update + setEditingId(null) inside the
      onSuccess callback of mutations.updateEntry

EDIT (fix Issue 2):
  src/lib/time-tracker/overlap-confirmation.tsx
    - Add timezone parameter to OverlapCheckInput
    - Update formatConflictTime to use the workspace timezone
    - Pass timezone through showOverlapConfirmation → formatConflictTime

EDIT (pass timezone at call sites):
  src/components/time-tracker/dashboard/hooks/useTrackerMutations.ts
    - Read workspace timezone from queryClient cache
    - Pass timezone to confirmTimeEntryOverlap calls

  src/components/time-tracker/analytics/department/DepartmentMemberDetailScreen.tsx
    - Pass detail.timezone to confirmTimeEntryOverlap call

  src/lib/time-tracker/overlap-confirmation.ts
    - No change needed (just re-export, types flow through)

  src/lib/server/tracker/shared/schemas.ts
    - Add optional timezone field to overlapCheckSchema
      (so the server can log/report in workspace timezone if needed,
       though the primary fix is client-side formatting)

  src/lib/server/tracker/overlap.server.ts
    - No server-side changes needed (timestamps are always UTC)
```

## 6. Implementation Plan

### Step 1: Fix `saveEdit()` in `useDraftAndEdit.ts` (Issue 1)

**Location:** `src/components/time-tracker/dashboard/hooks/useDraftAndEdit.ts`, lines 136-190

**Problem:** `saveEdit()` calls `patchEntryOptimistically()` and `setEditingId(null)` **before** the overlap check in `mutations.updateEntry()` runs. If the overlap check is cancelled, the optimistic update is never rolled back.

**Fix:** Move the optimistic update and editing-state clear into the `onSuccess` callback of `mutations.updateEntry()`.

```typescript
function saveEdit() {
  if (!editingId || !editingDraft.description.trim() || !editingEntry) return
  const prev = editingEntry

  // Running entry — update without touching endedAt (no overlap check here)
  if (!prev.endedAt) {
    // ... unchanged for running entries (updateActiveTimer has no overlap check)
    return
  }

  const origStart = dateTimeLocalValue(new Date(prev.startedAt))
  const origEnd = dateTimeLocalValue(new Date(prev.endedAt))
  const timesUnchanged =
    editingDraft.startedAt === origStart && editingDraft.endedAt === origEnd
  const durationSeconds = timesUnchanged
    ? prev.durationSeconds
    : calculateManualSeconds(editingDraft)

  const payload = { ...toEntryPayload(editingDraft), durationSeconds }

  // Do NOT optimistically patch or clear editing state here.
  // The mutation internally checks for overlaps. Only update the cache
  // AFTER the server confirms the save.
  void mutations.updateEntry(editingId, payload, {
    invalidate: false,
    onSuccess: () => {
      patchEntryOptimistically({ ...prev, ...payload })
      setEditingId(null)
      onMutated?.()
    },
    onError: () => {
      // Mutation failed — close the drawer so the user isn't stuck.
      // The cache was never optimistically updated, so no rollback needed.
      setEditingId(null)
    },
  })
}
```

**Key changes:**
- Remove `patchEntryOptimistically({ ...prev, ...payload })` from before the mutation call
- Remove `setEditingId(null)` from before the mutation call
- Move both inside the `onSuccess` callback
- In `onError`, only close the drawer (no rollback needed since we never optimistically updated)
- The `onSuccess` now also calls `onMutated?.()` (moved from the original `onSuccess` at line 186, though the original `onSuccess` from the caller — `() => onMutated?.()` — would still fire; we'll adjust to avoid double-calling)

**Wait — double-call risk:** The original code passes `onSuccess: () => onMutated?.()` in the options object at line 186-187. The new code will have `onSuccess` inside `mutations.updateEntry`'s options that does `patchEntryOptimistically + setEditingId + onMutated`. But `mutations.updateEntry`'s internal `run()` function also calls `options.onSuccess?.(result)`. So when both the internal and our custom onSuccess are set, they both fire. Let me trace the flow:

```typescript
// mutations.updateEntry calls:
return run(async () => updateEntryFn(...), {
  successMessage: 'Entry updated',
  ...options,  // options = { invalidate: false, onSuccess, onError }
})

// run() calls:
options.onSuccess?.(result)  // This fires our onSuccess
```

But wait, `run` receives options with `...options` spread. So when `saveEdit` passes `{ invalidate: false, onSuccess: () => { ... } }`, the `run` function will call `options.onSuccess?.(result)` which fires our callback. That's fine — our callback runs after the server confirms.

And from `saveEdit`'s original code:
```typescript
void mutations.updateEntry(editingId, payload, {
  invalidate: false,
  onSuccess: () => onMutated?.(),   // ← this is in the options passed to mutations.updateEntry
  onError: () => patchEntryOptimistically(prev),
})
```

When we move things to `onSuccess`:
```typescript
void mutations.updateEntry(editingId, payload, {
  invalidate: false,
  onSuccess: () => {
    patchEntryOptimistically({ ...prev, ...payload })
    setEditingId(null)
    onMutated?.()
  },
  onError: () => {
    setEditingId(null)
  },
})
```

This should work correctly. The `run()` function's `options.onSuccess?.(result)` will call our callback which does all three things.

### Step 2: Add workspace timezone to `overlap-confirmation.tsx` (Issue 2)

**Location:** `src/lib/time-tracker/overlap-confirmation.tsx`

**Changes:**

1. Add `timezone` field to `OverlapCheckInput`:
```typescript
export type OverlapCheckInput = {
  memberId?: string
  entryId?: string
  excludeEntryId?: string
  startedAt?: string
  endedAt?: string
  timezone?: string
}
```

2. Update `showOverlapConfirmation()` and `confirmTimeEntryOverlap()` to accept and pass through the timezone.

3. Update `formatConflictTime()` to accept a timezone parameter and use `toLocaleString()` with the timezone:
```typescript
function formatConflictTime(value: string, timezone?: string): string {
  const date = new Date(value)
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  }
  if (timezone) {
    options.timeZone = timezone
  }
  return date.toLocaleString([], options)
}
```

**Note on timezone input:** Workspace timezones stored in the DB are IANA timezone names like `'Asia/Manila'`, `'America/New_York'`, `'UTC'`. These are valid inputs to `toLocaleString()`'s `timeZone` option.

### Step 3: Pass timezone at all call sites

#### 3a. `useTrackerMutations.ts`

**Location:** `src/components/time-tracker/dashboard/hooks/useTrackerMutations.ts`

The workspace timezone is available from the tracker state in the query cache. We need to read it and pass it to `confirmTimeEntryOverlap()`.

The `useTrackerMutations` hook currently doesn't have access to the tracker state. We have two options:
a. Read it from the query cache: `queryClient.getQueryData<TrackerState>(trackerKeys.state)?.workspace.timezone`
b. Accept it as a parameter to the hook

Option (a) is simplest and least invasive — no need to update all callers.

Add a helper inside the hook:
```typescript
function getWorkspaceTimezone(): string | undefined {
  const state = queryClient.getQueryData<TrackerState>(trackerKeys.state)
  return state?.workspace?.timezone
}
```

Then pass it to each `confirmTimeEntryOverlap` call:
```typescript
const timezone = getWorkspaceTimezone()
const confirmed = await confirmTimeEntryOverlap({
  entryId: id,
  timezone,
})
```

Repeat for `addManualEntry` and `updateEntry`.

#### 3b. `DepartmentMemberDetailScreen.tsx`

**Location:** `src/components/time-tracker/analytics/department/DepartmentMemberDetailScreen.tsx`, line 81-86

Simply add `timezone: detail.timezone` to the `confirmTimeEntryOverlap` call:
```typescript
const confirmed = await confirmTimeEntryOverlap({
  memberId: editingEntry.workspaceMemberId,
  excludeEntryId: editingEntry.id,
  startedAt: new Date(editingDraft.startedAt).toISOString(),
  endedAt: new Date(editingDraft.endedAt).toISOString(),
  timezone: detail.timezone,
})
```

## 7. Testing Plan

1. **Issue 1 manual test:**
   - Open the time tracker dashboard
   - Edit a stopped entry that overlaps with another
   - Click Save → overlap warning appears → click "Cancel"
   - **Expected:** The edit drawer remains open (or reopens), the entry appears unchanged, no stale data
   - Click Save → overlap warning → click "Save anyway"
   - **Expected:** Entry updates correctly, drawer closes

2. **Issue 2 manual test:**
   - Set a workspace timezone different from browser timezone (e.g. `America/New_York` while browser is in `Asia/Manila`)
   - Edit/create an entry that will trigger an overlap warning
   - **Expected:** Conflict times displayed in the workspace timezone, not the browser timezone

3. **Regression check:**
   - Run `pnpm typecheck` and `pnpm lint` — must pass
   - Run `pnpm test` — all 44 tests must pass
   - Running entry editing (no overlap check) should still work as before

## 8. Risks and Edge Cases

- **Cached state being stale:** Reading workspace timezone from the query cache assumes it's been fetched. If the cache is empty (e.g. during the first render before the router loader completes), `getQueryData` returns `undefined`. In that case, the fallback is browser timezone — which is the current (buggy) behaviour, so no regression.
- **DepartmentMemberDetailScreen already correct:** This screen's `saveEdit` already checks overlap before mutating. We only need to add the timezone parameter — no logic changes.
- **Running entries not affected by Issue 1:** The `!prev.endedAt` branch uses `updateActiveTimer` which has no overlap check, so it's unaffected by the bug.
- **The overlap check in `useTrackerMutations.updateEntry` also calls `confirmTimeEntryOverlap` synchronously before the async server call.** The returned value (undefined vs the result) means we need to await it properly. In the new `saveEdit`, we fire `mutations.updateEntry(editingId, payload, ...)` as `void` — this is fine because the `onSuccess`/`onError` callbacks handle the post-mutation state. The function itself is async but we don't need to await it for the flow to work correctly.

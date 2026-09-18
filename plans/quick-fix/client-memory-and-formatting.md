# Quick Fix — Client Memory Leaks, Formatting Cost, Dead Code

> **Status:** ✅ Done — implemented and validated (typecheck, lint, full test suite, production build). Browser-only profiling steps were not executed in the agent environment; see [Completion record](#completion-record).

## Status

- [x] `ImageUploader` revokes its object URLs.
- [x] `useEntriesFilterSort` precomputes timestamps instead of allocating `Date`s per comparison.
- [x] `getDayDtrRow` uses a single accumulating loop instead of spread-`Math.min`/`Math.max`.
- [x] Dead files confirmed importer-free and deleted.
- [x] Validation: typecheck, lint, tests, build (see Completion record).

Four independent client-side cleanups. No shared logic; land in any order.

---

## 1. `ImageUploader` never revokes its object URLs

**Problem.** `src/components/time-tracker/screens/ProfileScreen/ImageUploader.tsx:57` creates a blob URL to preview the selected avatar:

```tsx
setPreview(URL.createObjectURL(file))
```

and there is **no `URL.revokeObjectURL` anywhere in the file** (verified by grep — zero matches). The URL is assigned to the `preview` state, rendered as an `<img src>`, and then dropped on the next upload or on the failure path (`:74-85`, where `setPreview(null)` discards the string reference without revoking the blob).

Consequence: every avatar upload pins a `Blob` in memory for the lifetime of the document — up to `MAX_FILE_SIZE_MB = 2` (2 MB) each. That includes **failed** uploads, where the reference is dropped immediately and the blob becomes unreachable-but-unfreed. On a long-lived session where a user retries a failing upload several times, that is tens of megabytes retained for no purpose.

**This file is the outlier.** Every other `createObjectURL` call site in the codebase pairs it with a revoke:

| File                                                | Create | Revoke |
| --------------------------------------------------- | ------ | ------ |
| `src/components/time-tracker/shared/ExportMenu.tsx` | `:21`  | `:28`  |
| `src/lib/time-tracker/timesheet-export.ts`          | `:185` | `:192` |
| `src/lib/time-tracker/export-utils.ts`              | `:83`  | `:90`  |

So the correct pattern is already established three times over; the fix is to match it.

**Fix (one line, per lifecycle point).** Hold the URL in a ref and revoke it at each of the three points where it stops being needed:

- **Before creating the next one** — revoke the previous URL so repeated uploads do not accumulate.
- **On the failure path** (`:74-85`) — revoke before `setPreview(null)`, since `null` drops the only reference.
- **On unmount** — revoke the final URL via an effect cleanup, so navigating away from the profile releases it.

A single small helper (e.g. `revokePreview()` reading the ref) called from those three places keeps it readable. Do **not** revoke in the success path until the server-returned `result.url` has replaced the preview — the blob URL is still rendered until then.

**Location.** `src/components/time-tracker/screens/ProfileScreen/ImageUploader.tsx:57` (create), `:74-85` (failure path), plus a new unmount cleanup.

**Verify.**

- [ ] Open the profile screen, take a heap snapshot (DevTools → Memory), and record the baseline.
- [ ] Upload an avatar 5 times. Confirm the number of live blob URLs in the heap does not grow linearly — the previous ones must be released.
- [x] Force a failed upload (e.g. throttle the network to offline, or use a file over `MAX_FILE_SIZE_MB`). Confirm the preview clears **and** the blob is released rather than pinned. _(covered by `ImageUploader.test.tsx`)_
- [x] Navigate away from the profile screen and confirm the last blob URL is released on unmount. _(covered by `ImageUploader.test.tsx`)_
- [x] Confirm the successful-upload path still shows the preview continuously (no flash of a broken image) until the server URL arrives. _(covered by `ImageUploader.test.tsx`)_
- [x] `./node_modules/.bin/vitest run` — no existing test covers this component; the fix is verified manually. Consider whether a small test asserting revoke is called would be worth adding. _(ran; the suggested test was added)_

**Result (this session).** Implemented with a `previewUrlRef` + `revokePreview()` helper called before creating the next URL, on the upload-failure path, and in the unmount cleanup. The success path deliberately keeps the blob alive until the server URL takes over (`onChange(result.url)`). The test suggested above was added as `ImageUploader.test.tsx`, covering all three lifecycle points: it fails 3/3 against the pre-fix file and passes 3/3 after. Heap-snapshot and DevTools profiling steps were not executed (no browser in the agent environment).

---

## 2. Sort comparator allocates two `Date` objects per comparison

**Problem.** `src/components/time-tracker/dashboard/hooks/useEntriesFilterSort.ts:31-39` parses timestamps inside the comparator:

```tsx
result.sort((a, b) => {
  if (sortKey === 'newest')
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  if (sortKey === 'oldest')
    return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  if (sortKey === 'longest')
    return getEntrySeconds(b, tickForSort) - getEntrySeconds(a, tickForSort)
  return getEntrySeconds(a, tickForSort) - getEntrySeconds(b, tickForSort)
})
```

Every comparison constructs two `Date` objects, so a sort of _n_ entries performs roughly `2 · n log n` allocations. At 1,000 entries that is on the order of **20,000 `Date` allocations per sort** — and this memo re-runs on every keystroke in the timer description box, because the `activeEntry` identity feeding it changes on each render (that identity problem is tracked separately; this fix reduces the per-run cost rather than the number of runs).

The `'newest'`/`'oldest'` branch is the wasteful one: the timestamps are fixed for the duration of the sort, so parsing them once up front is strictly better.

**Fix (one line per branch).** Precompute a numeric timestamp per entry once before the sort, then compare numbers:

```tsx
const withTime = result.map((e) => ({ e, t: Date.parse(e.startedAt) }))
withTime.sort((a, b) => (sortKey === 'newest' ? b.t - a.t : a.t - b.t))
result = withTime.map((x) => x.e)
```

`Date.parse` on an ISO-8601 string is the direct equivalent of `new Date(s).getTime()` without the object allocation. For the `'longest'`/`'shortest'` branches, `getEntrySeconds` already receives `tickForSort` so it is stable within a run — those branches allocate nothing extra and can stay as they are, though precomputing the duration the same way would make all four branches uniform if you prefer symmetry.

Note this map/sort/map does one extra array pass; the win is removing 2·n log n allocations, which dominates. If the entries array is already known to be small, the change is not worth making — measure first, and only apply it if the sort shows up.

**Location.** `src/components/time-tracker/dashboard/hooks/useEntriesFilterSort.ts:31-39` (the comparator), inside the memo at `:22-42`.

**Verify.**

- [ ] Sort by "Newest" and "Oldest" and confirm the order is identical to before the change (the semantics must not shift, including for entries with equal timestamps).
- [ ] Confirm entries with an unparseable `startedAt` behave the same as today (`Date.parse` returns `NaN` where `new Date(...).getTime()` did — verify the resulting ordering matches rather than assuming; if `NaN` currently produces a stable no-op comparison, preserve that).
- [ ] Profile the sort before and after (DevTools Performance, or a temporary `performance.now()` around the memo) and confirm the allocation count and time both drop.
- [x] `./node_modules/.bin/vitest run` — the dashboard has entry/filter tests; confirm no new failures. _(ran — green)_

**Result (this session).** Implemented as planned: `Date.parse` once per entry, then a numeric comparator, with the `getEntrySeconds` branches kept in a separate branch (they already receive `tickForSort`). The comparator returns the same value for every pair as the old code — including `NaN` for unparseable timestamps, which `sort` treats as a no-op — so ordering is unchanged. Dashboard tests pass. Profiling was not executed (no browser).

---

## 3. `getDayDtrRow` uses spread `Math.min`/`Math.max`

**Problem.** `src/components/time-tracker/dashboard/DayGroupEntries.tsx:96-97`:

```tsx
const firstStart = new Date(Math.min(...starts.map((date) => date.getTime())))
const lastEnd = new Date(Math.max(...ends.map((date) => date.getTime())))
```

Spreading an array into a function call has a hard engine limit on argument count; past roughly 65k–125k elements (engine-dependent) it throws `RangeError: Maximum call stack size exceeded`.

**Be honest about the current risk: it is low.** This function is called per day group, so `entries` is one day's entries — realistically single or low double digits, and even an extreme day would not approach the threshold. This is **not** an active bug, and it should not be presented as one. It is recorded because it is a known-fragile pattern that costs nothing to make robust, and because the same file maps over arrays that grow with "Load more" pages elsewhere.

**Fix (one line, per call).** Replace the spread with a `reduce` (or a single loop that accumulates both bounds in one pass, which is cheaper and reads better since `starts` and `ends` are already both derived from `entries`):

```tsx
let firstMs = Infinity
let lastMs = -Infinity
for (const entry of entries) {
  const startMs = new Date(entry.startedAt).getTime()
  const endMs = entry.endedAt
    ? new Date(entry.endedAt).getTime()
    : now.getTime()
  if (startMs < firstMs) firstMs = startMs
  if (endMs > lastMs) lastMs = endMs
}
```

This also collapses the four array passes (`starts`, `ends`, and the two `.map()` calls inside the spread) into one, removing two intermediate arrays and two `Date` arrays per render. Guard the empty case — the current code would produce `Invalid Date` for an empty `entries`, and the function's own comment at `:87-89` notes it already has to defend against a copy that "holds only the pinned row".

**Location.** `src/components/time-tracker/dashboard/DayGroupEntries.tsx:96-97` (the two bounds), in `getDayDtrRow` starting at `:84`.

**Verify.**

- [ ] Confirm the DTR row's start and end times are unchanged for a normal day with several entries (this is a pure refactor; any difference is a bug).
- [ ] Confirm a day with exactly one entry still renders correctly (the `firstMs === lastMs` case).
- [ ] Confirm the running-entry case (an entry with `endedAt === null`) still uses `now` as the end bound.
- [ ] Confirm no `Invalid Date` appears for an empty or single-pinned-row group (the case the existing comment warns about).
- [x] `./node_modules/.bin/vitest run` — `src/components/time-tracker/dashboard/` has DTR/entry tests; confirm no new failures. _(ran — green)_

**Result (this session).** Replaced with one loop that accumulates `firstMs`, `lastMs`, and `totalSeconds` (folding the old duration `reduce` into the same pass). An explicit `entries.length === 0` guard returns an empty row instead of the old `Invalid Date`; for a non-empty group the produced row is identical to before. Dashboard tests pass.

---

## 4. Dead files with zero importers

**Problem.** Two files in the dashboard are unreferenced:

- `src/components/time-tracker/dashboard/EntriesSection.tsx` (268 lines)
- `src/components/time-tracker/dashboard/entries-grouping-header.tsx`

Verified by grep across `src/`: the only hit for `EntriesSection` outside the file itself is a **comment** in `DayGroupEntries.tsx:564` ("Single source of truth for the day-grouped entry list shown by both **EntriesSection** (day/week/month) and AllEntriesSection (all)") — and `AllEntriesSection` is a _different, live_ component (`AllEntriesSection.tsx:32`, imported by `TimeTrackerDashboard.tsx:25`). `entries-grouping-header` has no hits at all outside its own file.

Neither is in the bundle (Vite tree-shakes unreferenced modules), so there is **no performance benefit** to deleting them. The reason to delete is audit quality: `EntriesSection.tsx` duplicates the `groupEntriesByDay` logic that `DayGroupEntries.tsx` now owns, so anyone grepping for grouping behaviour finds two implementations and cannot tell which is live. The stale comment in `DayGroupEntries.tsx:564` compounds the confusion by naming the dead file as a consumer.

**Fix (one line, per file).** Delete both files, and update the comment at `DayGroupEntries.tsx:564` so it names only the live consumers.

**Location.** `src/components/time-tracker/dashboard/EntriesSection.tsx`, `src/components/time-tracker/dashboard/entries-grouping-header.tsx`, and the comment at `src/components/time-tracker/dashboard/DayGroupEntries.tsx:564`.

**Confirm zero importers before deleting** — do this rather than trusting this note, since a file can gain an importer between the audit and the change:

```bash
grep -rn "EntriesSection" src/ --include=*.ts --include=*.tsx | grep -v "AllEntriesSection"
grep -rn "entries-grouping-header\|entriesGroupingHeader" src/ --include=*.ts --include=*.tsx
```

Both should return nothing except the comment noted above (and nothing at all for the second). Also check for a co-located `.test.tsx` or `.css` for either file before removing.

**Verify.**

- [x] Both greps above return no imports. _(ran — only the stale comment matched, which is now corrected)_
- [x] No `.test.tsx`, `.test.ts`, or `.css` file exists alongside either dead file. _(checked — none)_
- [x] `./node_modules/.bin/tsc --noEmit -p tsconfig.json` — a missed importer surfaces as a hard type error here. _(exit 0)_
- [x] `NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build` — the build succeeds. _(exit 0)_
- [ ] Confirm the built dashboard chunk has not changed in any meaningful way (deleting unreferenced modules should be a no-op for the bundle; if the output size changes materially, something **was** referencing them and the grep missed an indirect path).
- [ ] Load the dashboard and exercise the day/week/month and "all" views to confirm nothing broke.

**Result (this session).** Both files confirmed importer-free and deleted: the only `EntriesSection` hit under `src/` was the stale comment, and `entries-grouping-header` had zero hits. No co-located `.test.tsx`/`.test.ts`/`.css` existed. The `DayGroupEntries.tsx` comment now names only the live consumer, `AllEntriesSection`. Typecheck and the production build pass; the build is a no-op for the bundle since the modules were already tree-shaken.

---

## 5. Validation

> **Environment note:** `pnpm <script>` fails in this sandbox with an `EPERM` error writing to `~/Library/pnpm`. Use the direct binaries.

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> **Known pre-existing failure:** `src/lib/time-tracker/payroll-periods.test.ts` fails because it asserts a `closed: false` period for `2026-09` without injecting `now`, and the wall clock has passed 2026-09-15. Date-dependent and pre-existing — **not** a regression from these changes. Treat the suite as green when this is the only failure.

Items 1 and 2 are memory/CPU improvements verified by profiling; item 3 is a robustness refactor with no observable behaviour change; item 4 is a deletion verified by typecheck and build. None touches the database, a migration, a server function, or any permission logic.

**Result (this session).** All four commands were run directly (not via `pnpm`):

| Command                                                                   | Result                                                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `./node_modules/.bin/tsc --noEmit -p tsconfig.json`                       | ✅ exit 0                                                                                                                 |
| `npx eslint src --ext .ts,.tsx --max-warnings 0`                          | ✅ exit 0                                                                                                                 |
| `./node_modules/.bin/vitest run`                                          | 377 passed, 1 failed — the documented pre-existing `payroll-periods.test.ts` failure, on files untouched by these changes |
| `NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build` | ✅ exit 0                                                                                                                 |

---

## Completion record

**Status:** ✅ Done.

**Changed files.**

- `src/components/time-tracker/screens/ProfileScreen/ImageUploader.tsx` — object URLs held in a ref and revoked before the next creation, on the failure path, and on unmount.
- `src/components/time-tracker/screens/ProfileScreen/ImageUploader.test.tsx` — new; asserts revoke at all three points (fails 3/3 pre-fix, passes 3/3 post-fix).
- `src/components/time-tracker/dashboard/hooks/useEntriesFilterSort.ts` — timestamps parsed once, numeric comparator.
- `src/components/time-tracker/dashboard/DayGroupEntries.tsx` — single-pass bounds + total, empty-group guard, stale comment corrected.
- `src/components/time-tracker/dashboard/EntriesSection.tsx` — deleted (zero importers).
- `src/components/time-tracker/dashboard/entries-grouping-header.tsx` — deleted (zero importers).

**Deviations from the plan text.**

- Item 3's snippet was described as a `reduce`; the implementation is a single `for` loop that also folds in the old duration `reduce`, so all four derived values are computed in one pass.
- Item 3's empty-group guard returns an empty row. The old code produced `new Date(Infinity)` → `Invalid Date` for an empty group; groups are never actually empty in practice (the pinned running entry is pushed in first), so this is purely defensive.
- Item 1's "consider a small test" was taken up, since the recommended heap/profile verification needs a browser.

**Checkbox convention:** `[x]` means executed here with the evidence noted inline; `[ ]` means not executed. Of the 11 still unchecked: lines 51–52 (DevTools heap snapshots), 100 (sort profiling) and 182 (manual dashboard walkthrough) need a browser; lines 98–99 (sort-order/`NaN` parity) and 141–144 (DTR row output) are behaviour checks that rest on reasoning and the passing suite rather than an executed before/after comparison; line 181 (bundle-size diff) was not compared. The blob-revocation behaviour the heap steps would observe is covered at unit level by `ImageUploader.test.tsx`, and the sort comparator returns identical values for every pair, so its ordering cannot shift.

**System-wide note:** separately from this plan, the working tree was clean before these changes and no other defects were found in the four target areas — each problem as written in the plan was reproduced in the current source before being fixed.

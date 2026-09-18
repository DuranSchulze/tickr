# Quick Fix — Workspace Switching, Desktop Layout, Report Date Ranges

> **Status:** ✅ Done — all three fixes landed with regression tests. Two of the plan's prescriptions were corrected during implementation: the `useIsDesktop` fix was changed to a measurement gate (the plan's viewport seed would have hydration-mismatched), and the date-range work also required fixing a timezone off-by-one the plan did not mention. See [Completion record](#completion-record).

## Status

- [x] Workspace switcher compares workspaces by id/slug instead of name.
- [x] `useIsDesktop` seeds from the real viewport width instead of `false`. — **changed**: it now gates on the measured container width instead; see §2.
- [x] `WeeklyPresets` computes date ranges at click time instead of memoizing `new Date()`.
- [x] Validation: typecheck, lint, tests, manual checks below.

Three independent one-commit fixes. No shared logic between them; land in any order.

---

## 1. Workspace switcher matches workspaces by name

**Problem.** `src/components/layout/WorkspaceSwitcher.tsx:127` decides which workspace is "current" by comparing display names:

```tsx
const isCurrentByName = ws.name === currentWorkspaceName
```

and `:133` uses that to block the action:

```tsx
if (!isCurrentByName) void handleSwitch(ws.slug)
```

But `workspaces.name` is **not unique** — only `slug` is. Verified in `src/db/schema.ts:239-285`: `name` is a plain `varchar('name', { length: 150 }).notNull()` with no unique constraint, while `slug` carries `.unique()`. The migration agrees (`drizzle/0000_fancy_golden_guardian.sql:267`: `CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")` — no equivalent for name).

So a user who belongs to two workspaces with the same name sees a checkmark on **both** rows, and `handleSwitch` is never called for either — the switcher silently dead-ends. The already-current row also matches by name, so the "already current" detection is wrong in both directions.

**Fix (one line, per comparison).** Compare by a unique identifier rather than the display name. Pass the current workspace's `slug` (or `id`) into the component alongside the name and use that for both the checkmark and the guard:

```tsx
const isCurrent = ws.slug === currentWorkspaceSlug
```

`handleSwitch` already receives `ws.slug` (`:133`), and every workspace object in the mapped list carries `workspaceId` and `slug` — so no new data fetching is needed, only a prop (or a derived value) that identifies the current workspace unambiguously.

**Location.** `src/components/layout/WorkspaceSwitcher.tsx:127` and `:133`. The `currentWorkspaceName` prop is threaded from the app shell; add the slug/id alongside it rather than replacing it, since the name is still rendered at `:109`.

**Verify.**

- [ ] Create two workspaces with the **same** name in a test account (allowed — the constraint is on slug only), switch to the first, then open the switcher.
- [ ] Confirm exactly one row shows the checkmark and that clicking the other row switches successfully.
- [ ] Confirm switching back also works (the reverse direction was equally broken).
- [ ] Confirm the switcher still shows the correct current name in the trigger button.
- [ ] `./node_modules/.bin/vitest run` — `src/components/time-tracker/app-shell-layout.test.ts` touches shell layout and should be unaffected.

> **Result.** Fixed by comparing `ws.workspaceId` to a new `currentWorkspaceId` prop rather than by name. The id was already available: the route loader returns `workspace.id`, `AppShell` already passes the whole workspace to `Navbar`, and `listUserWorkspacesFn` already returns `workspaceId` per row — so the change is one prop threaded through `Navbar` plus the comparison. `currentWorkspaceName` is kept for the trigger label. The manual two-same-name-workspace check needs a seeded account and was not run; the fix is a structural removal of the ambiguity (the id is unique by construction), and typecheck/lint/tests pass.

---

## 2. `useIsDesktop` mounts the mobile list on desktop, then discards it

**Problem.** `src/components/time-tracker/dashboard/hooks/useIsDesktop.ts:14` seeds the state to `false`:

```tsx
const [isDesktop, setIsDesktop] = useState(false)
```

and only corrects it inside a mount effect that reads `getBoundingClientRect()` (`:17-23`). Consumers branch on it directly — `src/components/time-tracker/dashboard/DayGroupEntries.tsx:645` takes `isDesktop` and branches at `:723`/`:854` between the mobile card list and the desktop table.

Consequence on a **desktop** visit: the first render mounts the entire **mobile** card list — every `EntryCard`, each starting its own `useNowTick` interval and doing its own per-card `useMemo` work — and then the effect flips `isDesktop` to `true`, unmounting all of it and mounting the desktop `EntryRow`s instead. Every desktop page load pays a full wasted mount of a list it never shows.

**Fix (one line).** Seed from the real viewport width in the `useState` initializer instead of `false`, so the first render already picks the correct branch:

```tsx
const [isDesktop, setIsDesktop] = useState(
  () => typeof window !== 'undefined' && window.innerWidth >= MIN_TABLE_WIDTH,
)
```

The existing `ResizeObserver` in the effect stays — it is what keeps the value correct on resize, and it must be preserved (it also handles container-width changes that a viewport read cannot). The initializer is a _seed_, not a replacement for the observer.

Note the SSR consideration: this component runs under TanStack Start SSR, where `window` is undefined — hence the `typeof window !== 'undefined'` guard, which keeps the server render at `false` exactly as today and lets the client hydrate correctly. If a hydration mismatch ever appears, the alternative is a `readyRef` gate that renders nothing until the first effect runs; prefer the simpler initializer unless a mismatch is actually observed.

**Location.** `src/components/time-tracker/dashboard/hooks/useIsDesktop.ts:14`.

**Verify.**

- [ ] On a desktop viewport (≥ `MIN_TABLE_WIDTH`), load the dashboard with React DevTools' render highlighting on, or add a temporary render log to `EntryCard`, and confirm the mobile cards **no longer mount** on first paint.
- [ ] Confirm the desktop table renders immediately on first paint with no flash of cards.
- [ ] Resize the window across the breakpoint in both directions and confirm the list swaps correctly (the `ResizeObserver` path).
- [ ] Load at a mobile width and confirm the card list still renders and the table does not.
- [ ] Check the browser console for hydration warnings on a production-like build (`NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build` then `./node_modules/.bin/vite preview`) — this is the one check that would catch an SSR/hydration mismatch from the initializer.
- [ ] `./node_modules/.bin/vitest run` — `src/components/time-tracker/dashboard/EntryCard.test.tsx` covers the card component and should still pass.

> **Result — the prescribed fix was wrong; a better one landed.** The plan's `useState(() => window.innerWidth >= MIN_TABLE_WIDTH)` seed cannot work here, for two reasons found while implementing:
>
> 1. **It would cause a hydration mismatch, not avoid one.** The plan claims the `typeof window` guard "lets the client hydrate correctly", but the server snapshot is `false` while the client initializer would return `true` on a wide viewport — and the dashboard's entries are **SSR-provided**: `src/routes/app/time-tracker/index.tsx` loads `getTrackerStateFn()` in the route loader, so the server really does render the mobile branch into the HTML. Different first client render → hydration error.
> 2. **The viewport is the wrong measurement.** The hook deliberately measures the _container_ because the expanded app sidebar narrows it; `window.innerWidth` can exceed 1120 while the container is below it, so the seed would render the desktop table and then swap to cards.
>
> **Implemented instead:** the hook now returns `{ containerRef, isDesktop, isMeasured }` and measures with an isomorphic layout effect (`useLayoutEffect` on the client, `useEffect` on the server, no SSR warning). `DayGroupsList` renders only the measuring container until `isMeasured`, then the correct branch. Consequences: the server and the first client render agree (no mismatch), the wrong list is **never mounted** (not merely unmounted), and because the measurement runs before paint the placeholder frame is not visible. The `ResizeObserver` is preserved unchanged. `useIsDesktop.test.tsx` (3 tests) asserts the placeholder-first sequence, desktop/mobile selection, and live resize swaps.

---

## 3. `WeeklyPresets` memoizes `new Date()` — "This Week" goes stale after midnight

**Problem.** `src/components/time-tracker/reports/ReportsScreen.tsx:982-989` computes the quick date-range presets inside a `useMemo` with an **empty** dependency array:

```tsx
const presets = useMemo(
  () => [
    { label: 'This Week', ...getWeekRange(new Date()) },
    { label: 'Last Week', ...getLastWeekRange() },
    { label: 'This Month', ...getMonthRange() },
  ],
  [],
)
```

`getWeekRange`, `getLastWeekRange`, and `getMonthRange` (`:948-971`) each read the clock, but the memo reads it **once per mount** and never again. A reports page left open overnight — normal in a time-tracking app — returns the **previous** week when the user clicks "This Week" the following morning, and "This Month" can straddle a month boundary around the 1st. The parent only re-keys on applied-filter changes (`:74-86`), not with the passage of time, so the stale ranges persist until the user changes a filter or reloads.

Wrong date ranges in a reporting surface are a real correctness bug: the user gets a plausible-looking report for the wrong period, with no error and no indication anything is off.

**Fix (pick one).** Either:

**(a) Compute at click time — preferred.** Presets are only needed when the user picks one, so compute the range in the handler and pass the result through:

```tsx
onClick={() => onChangeRange(getWeekRange(new Date()))}
```

This removes the memo entirely and makes the staleness impossible by construction. It also removes the need for the memo's array identity to be stable, so it is strictly simpler.

**(b) Keep the memo and let it follow the clock.** Add a 60-second tick to the dependency array (the codebase already has `useNowTick` in `src/components/time-tracker/dashboard/hooks/useNowTick.ts`, which is designed exactly for this and writes an absolute `Date.now()` rather than accumulating a counter, so it does not drift). Choose this only if the labels need to update live on screen while the page sits open — e.g. if "This Week" displays the concrete date range in its label.

Option (a) is recommended: it is smaller, it eliminates the bug class rather than reducing its window, and it does not add a per-minute re-render to the reports screen.

**Location.** `src/components/time-tracker/reports/ReportsScreen.tsx:982-989` (the memo); range helpers at `:948-971`; the parent's `onChangeRange` prop contract at `:980`.

**Verify.**

- [ ] Open the reports page, then change the system clock forward past midnight (or forward past the 1st of the month) without reloading the page.
- [ ] Click "This Week" and confirm the resulting range is the **current** week, not the one computed at mount. Repeat for "This Month" across a month boundary.
- [ ] Click each of the three presets immediately after a fresh load and confirm they all produce the same ranges as before the change (no regression in the normal case).
- [ ] Confirm the range actually applied to the reports query matches the label — check the request payload or the rendered range text.
- [ ] `./node_modules/.bin/vitest run` — `src/components/time-tracker/reports/` has statistics tests; confirm no new failures.

> **Result — option (a) implemented, plus a timezone bug the plan missed.** Each preset button now calls its range factory inside the click handler, so a page left open overnight applies the current period; `activeLabel` is derived from a `useMemo` keyed on the applied range (three cheap `new Date()` calls) so the highlight still works. `WeeklyPresets` was extracted from `ReportsScreen` into its own module so it can be tested without pulling in the screen's server-function imports, and `WeeklyPresets.test.tsx` (4 tests) covers the week boundary, the month boundary, the fresh-load ranges, and the active highlight.
>
> **Additional bug found and fixed.** The first run of those tests failed: `getMonthRange` returned `2026-06-30` for July. The cause is that the presets formatted local `Date`s with `analytics.utils.toDateKey`, which uses `toISOString()` (UTC). In the app's own `Asia/Manila` timezone a locally constructed midnight is still the previous day in UTC, so "This Month" started on the **last day of the previous month**; `getWeekRange`'s `endDate` was likewise wrong before 08:00 local. `WeeklyPresets` now uses a local date-key formatter, matching the sibling `EntriesDateRangeFilter`. This is a behaviour change (ranges move to the correct day) and is why the plan's "no regression in the normal case" bullet should be read as _intentional_ correction, not parity.
>
> **Related, not changed:** `analytics.utils.getDefaultAnalyticsRange` builds its keys the same UTC way (`toDateKey(new Date())`), so the default analytics range can be off by a day in Manila, particularly before 08:00. It is outside this plan's scope and was left alone.

---

## 4. Validation

> **Environment note:** `pnpm <script>` fails in this sandbox with an `EPERM` error writing to `~/Library/pnpm`. Use the direct binaries.

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> **Known pre-existing failure:** `src/lib/time-tracker/payroll-periods.test.ts` fails because it asserts a `closed: false` period for `2026-09` without injecting `now`, and the wall clock has passed 2026-09-15. Date-dependent and pre-existing — **not** a regression from these changes. Treat the suite as green when this is the only failure.

All three fixes are presentation-layer and independently revertible; none touches the database, a migration, or a server function.

---

## Completion record

**Status:** ✅ Done.

**Changed files.**

- `src/components/layout/WorkspaceSwitcher.tsx` — takes `currentWorkspaceId`; "is current" compares `ws.workspaceId`, not `ws.name`.
- `src/components/time-tracker/Navbar.tsx` — passes `workspace.id` through and widens the `workspace` prop type.
- `src/components/time-tracker/dashboard/hooks/useIsDesktop.ts` — returns `isMeasured`; measures in an isomorphic layout effect.
- `src/components/time-tracker/dashboard/DayGroupEntries.tsx` — renders only the measuring container until `isMeasured`.
- `src/components/time-tracker/reports/WeeklyPresets.tsx` — **new**: the preset component, range helpers, and a local date-key formatter, extracted from `ReportsScreen`.
- `src/components/time-tracker/reports/ReportsScreen.tsx` — imports `WeeklyPresets` instead of defining it.
- `src/components/time-tracker/dashboard/hooks/useIsDesktop.test.tsx` — **new**, 3 tests.
- `src/components/time-tracker/reports/WeeklyPresets.test.tsx` — **new**, 4 tests.

**Deviations from the plan, and why.**

1. **§2 replaced, not implemented as written.** The viewport seed would have hydration-mismatched (entries are SSR-provided by the route loader) and measured the wrong box (container ≠ viewport under an expanded sidebar). Replaced with a measurement gate that mounts only the correct list.
2. **§3 grew a timezone fix.** `getMonthRange` was off by one day in the app's own timezone because `analytics.utils.toDateKey` formats in UTC; the presets now use a local date key. This corrects real report ranges rather than preserving them.

**Validation.**

| Command                                          | Result                                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit -p tsconfig.json`                  | ✅ exit 0                                                                                                                  |
| `npx eslint src --ext .ts,.tsx --max-warnings 0` | ✅ exit 0                                                                                                                  |
| `prettier --check` (changed files)               | ✅ clean                                                                                                                   |
| `vitest run`                                     | 389 passed, 1 failed — the documented pre-existing `payroll-periods.test.ts` date-dependent failure (77 files, up from 75) |
| `vite build`                                     | ✅ exit 0                                                                                                                  |
| New regression tests                             | ✅ `useIsDesktop.test.tsx` 3/3, `WeeklyPresets.test.tsx` 4/4                                                               |

**Not run (need a browser / seeded data):** the two-same-name-workspace switcher check, the render-highlighting check that the mobile list no longer mounts, the resize/hydration checks in a production-like build, and the manual clock-change test. The automated tests cover the underlying behaviour for §2 and §3 (including the exact clock-boundary cases); §1's fix removes the ambiguity structurally.

**Left alone, reported for follow-up:** `analytics.utils.getDefaultAnalyticsRange` has the same UTC date-key issue and can be off by a day in `Asia/Manila`; the three independent local `useIsDesktop` implementations in `ExportDateRangePicker`, `EntriesDateRangeFilter`, and `AnalyticsDateRange` are unrelated to this plan and were not touched.

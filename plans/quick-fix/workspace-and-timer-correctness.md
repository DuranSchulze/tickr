# Quick Fix — Workspace Switching, Desktop Layout, Report Date Ranges

> **Status:** 📋 Planned

## Status

- [ ] Workspace switcher compares workspaces by id/slug instead of name.
- [ ] `useIsDesktop` seeds from the real viewport width instead of `false`.
- [ ] `WeeklyPresets` computes date ranges at click time instead of memoizing `new Date()`.
- [ ] Validation: typecheck, lint, tests, manual checks below.

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

# Lazy-Load the Entry Location Map (Remove MapLibre from the Dashboard Bundle)

> **Status:** 📋 Planned

## Status

- [ ] Verified the eager MapLibre chunk in a local production build (chunk name, raw and gzip size, `__vite__mapDeps` membership).
- [ ] Confirmed the 5-hop static import chain and that no dynamic import exists on it.
- [ ] Lazy-loaded `EntryLocationMap` behind the existing coordinate guard, with a same-height `Suspense` skeleton.
- [ ] Confirmed the map still renders and behaves identically when an entry has coordinates.
- [ ] Applied the same treatment to the other two map consumers (`MemberActivityMap`, `LocationHistoryScreen`).
- [ ] Decided the disposition of the module-scope unpkg worker URL in `components/ui/map.tsx` (fix here or defer with a tracked item).
- [ ] Decided whether to add `manualChunks` to `vite.config.ts` (open question — see §13).
- [ ] Validation: typecheck, lint, tests, bundle-size re-measure, manual smoke test.

## Verify First (No Code Change)

Reproduce and quantify the problem before writing any code. Nothing in this section modifies a file.

### Static inspection (no app, no browser needed)

- [ ] **1. Build for production and locate the MapLibre chunk.**

  ```bash
  cd /Users/zafajardo/Documents/Development/Tickr
  NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
  ls -laS .output/public/assets/*.js | head -5
  ```

  Expected: `useAppTheme-D-ys7bb4.js` near the top at roughly **970,788 B** raw. The hash will change if any source changes — identify the chunk by size and content, not by hash, if you have already edited code.

- [ ] **2. Confirm the chunk is actually MapLibre** (the name is misleading — it is named after an unrelated module):

  ```bash
  cd .output/public/assets
  grep -c "maplibre" useAppTheme-D-*.js        # expect ~277
  wc -c < useAppTheme-D-*.js                    # expect ~970,788
  gzip -c useAppTheme-D-*.js | wc -c            # expect ~250,628
  ```

- [ ] **3. Confirm the MapLibre CSS is a separate eager cost.**

  ```bash
  cd .output/public/assets
  wc -c < useAppTheme-*.css                     # expect ~82,869
  ```

- [ ] **4. Confirm the chunk is in the `/app/time-tracker` route's preload list.** The route chunk carries a `__vite__mapDeps` array listing every dependency Vite preloads when the route is dynamically imported. Find the route chunk (it is the one whose array mentions `utils-Dngkx5Vl.js` and `useAppTheme-D-ys7bb4.js` together) and confirm both entries are present in the same array:

  ```bash
  cd .output/public/assets
  grep -l "useAppTheme-D-ys7bb4.js" *.js
  grep -o '__vite__mapDeps=.\{0,400\}' <route-chunk>.js | head -c 1200
  ```

  Also check that the reference is a **static** import on at least one path in the graph, not only a dynamic one:

  ```bash
  grep -o 'from"\./useAppTheme-D-ys7bb4\.js"' *.js   # a static import, not import(...)
  ```

- [ ] **5. Confirm the 5-hop chain is entirely static** (no `lazy(` / `import(` anywhere on it). Read each of these and check the import statement:

  ```
  src/routes/app/time-tracker/index.tsx:2        → #/components/time-tracker/dashboard/TimeTrackerDashboard
  src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx:27 → ./EditEntryDrawer
  src/components/time-tracker/dashboard/EditEntryDrawer.tsx:14      → ./EntryOriginSection
  src/components/time-tracker/dashboard/EntryOriginSection.tsx:2    → ./EntryLocationMap
  src/components/time-tracker/dashboard/EntryLocationMap.tsx:1      → #/components/ui/map
  src/components/ui/map.tsx:3                    → import * as MapLibreGL from "maplibre-gl"
  ```

  ```bash
  grep -rn "lazy(\|import(" src/components/time-tracker/dashboard/EditEntryDrawer.tsx \
    src/components/time-tracker/dashboard/EntryOriginSection.tsx \
    src/components/time-tracker/dashboard/EntryLocationMap.tsx   # expect: no output
  ```

- [ ] **6. Confirm the render is guarded but the import is not.** `EntryOriginSection.tsx:77-85` wraps `<EntryLocationMap … />` in `{hasCoords && (…)}`, so the map only _renders_ with coordinates — yet the module (and therefore `maplibre-gl`) is evaluated on import regardless. Read the file to confirm.

- [ ] **7. Confirm the other two routes pull the same chain** (`ReportsScreen.tsx:35` and `analytics/department/DepartmentMemberDetailScreen.tsx:19` both import `EditEntryDrawer`):

  ```bash
  grep -rn "EditEntryDrawer" src/ --include=*.tsx | grep -v "dashboard/EditEntryDrawer.tsx"
  ```

- [ ] **8. Record the second, independent defect.** `src/components/ui/map.tsx:26-30` runs a **module-scope** side effect pointing MapLibre's worker at a third-party CDN:

  ```ts
  if (typeof window !== 'undefined' && !MapLibreGL.getWorkerUrl()) {
    MapLibreGL.setWorkerUrl(
      `https://unpkg.com/maplibre-gl@${MapLibreGL.getVersion()}/dist/maplibre-gl-worker.mjs`,
    )
  }
  ```

  Confirm the CSP does not restrict it — `vercel.json` sets only `frame-ancestors` for `/(.*)`, with no `script-src` or `worker-src`.

- [ ] **9. Confirm `vite.config.ts` has no `manualChunks`** (this is why MapLibre landed in a chunk named after `useAppTheme`):

  ```bash
  grep -n "manualChunks\|rollupOptions" vite.config.ts   # expect: no output
  ```

### Requires a running app / browser

- [ ] **10. Reproduce the eager download.** Start the dev server (or serve the production build), open DevTools → **Network**, clear, and load `/app/time-tracker`. Without opening any entry drawer, confirm the ~250 KB gzip MapLibre chunk is fetched (filter by `useAppTheme` and by size). Compare against a baseline route such as `/app/reports` — both fetch it.

- [ ] **11. Confirm the map never renders for a typical entry.** Open an entry with no `latitude`/`longitude` (or a workspace with location tracking disabled). Confirm no map canvas appears — establishing that the payload was downloaded purely for a code path that did not run.

- [ ] **12. Record a "before" Profile** in Chrome DevTools → Performance: load `/app/time-tracker`, then read **Scripting** time and the transferred JS total from the Network summary. Keep this number for the §10 comparison.

## 1. Goal

Remove MapLibre GL — roughly **250 KB gzip of JavaScript plus ~83 KB of CSS** — from the eager module graph of the main time-tracker dashboard, the reports screen, and the department member-detail screen, by lazy-loading the one leaf component that actually needs it.

The map in question is a **160 px-tall, non-interactive preview** inside the edit-entry drawer (`EntryLocationMap`), which only renders when a time entry carries `latitude`/`longitude`. Today the full WebGL map engine is downloaded, parsed, and evaluated on every dashboard visit — roughly **9× the size of the route chunk itself** — for a code path that most visits never execute.

A second, independent defect lives in the same module (a runtime dependency on a public CDN for the MapLibre worker) and is documented here so it is handled or explicitly deferred rather than lost.

## 2. Context Summary

### The measured cost

Verified at byte level in a local production build (`.output/public/assets`):

| Artifact                                 | Raw       | Gzip          | Notes                                            |
| ---------------------------------------- | --------- | ------------- | ------------------------------------------------ |
| `assets/useAppTheme-D-ys7bb4.js`         | 970,788 B | **250,628 B** | 277 `maplibre` hits — this is the MapLibre chunk |
| `assets/useAppTheme-CKRTiAqP.css`        | 82,869 B  | ~10,409 B     | MapLibre stylesheet                              |
| `assets/time-tracker-*.js` (route chunk) | ~113 KB   | ~27.9 KB      | for comparison — ~9× smaller                     |

The JS chunk appears in the `/app/time-tracker` route's `__vite__mapDeps` preload array, and at least one chunk in the graph imports it **statically** (`import{a as h,…}from"./useAppTheme-D-ys7bb4.js"`), so Vite's preload helper emits a `<link rel="modulepreload">` for it (plus a stylesheet link for the CSS) when the route loads.

### The static import chain — 5 hops, no dynamic import anywhere

```
src/routes/app/time-tracker/index.tsx:2
  → src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx:27
    → src/components/time-tracker/dashboard/EditEntryDrawer.tsx:14
      → src/components/time-tracker/dashboard/EntryOriginSection.tsx:2
        → src/components/time-tracker/dashboard/EntryLocationMap.tsx:1
          → src/components/ui/map.tsx:3   (import * as MapLibreGL from "maplibre-gl")
```

`src/components/ui/map.tsx:3-5` is the only place `maplibre-gl` is imported for this path:

```ts
import * as MapLibreGL from 'maplibre-gl'
import type { PopupOptions, MarkerOptions } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
```

### The render is guarded; the import is not

`EntryOriginSection.tsx:74-87` renders the map only when the entry has coordinates:

```tsx
{
  hasCoords && (
    <EntryLocationMap
      latitude={latitude}
      longitude={longitude}
      location={location}
      source={locationSource}
      accuracyMeters={locationAccuracyM}
    />
  )
}
```

So the component tree already treats the map as conditional. Only the _module graph_ does not. That asymmetry is the whole defect.

### Reachability beyond the dashboard

Two more screens pull the same chain by importing `EditEntryDrawer`:

- `src/components/time-tracker/reports/ReportsScreen.tsx:35`
- `src/components/time-tracker/analytics/department/DepartmentMemberDetailScreen.tsx:19`

### Why the chunk is named after `useAppTheme`

`vite.config.ts` defines no `manualChunks` / `rollupOptions`, so Rollup's default chunking named the MapLibre bundle after whichever module it happened to land beside. This is cosmetic — **except** that it makes the problem hard to spot from build output, which is likely why it went unnoticed. Whether to add explicit chunking is an open question (§13), not an assumed part of the fix.

### Second defect in the same file: the CDN worker dependency

`src/components/ui/map.tsx:26-30` runs at **module scope**:

```ts
if (typeof window !== 'undefined' && !MapLibreGL.getWorkerUrl()) {
  MapLibreGL.setWorkerUrl(
    `https://unpkg.com/maplibre-gl@${MapLibreGL.getVersion()}/dist/maplibre-gl-worker.mjs`,
  )
}
```

Consequences:

- MapLibre's worker is fetched at runtime from **`unpkg.com`**, a public third-party CDN. If unpkg is unavailable, blocked by a corporate proxy, or the pinned version is removed, maps break at runtime with no build-time signal.
- It also means the app has a runtime dependency on a CDN that is not part of its supply-chain controls.
- The app's CSP does not constrain it: `vercel.json` sets only `frame-ancestors 'self' chrome-extension://*` on `/(.*)`, with no `script-src` or `worker-src`, so nothing would stop a substituted response from executing.

**Interaction with this fix:** lazy-loading shrinks the blast radius, because the module no longer evaluates on every dashboard visit — the `setWorkerUrl` call happens only when a user actually opens an entry that has coordinates. It does **not** fix the defect. That is why this plan asks for an explicit disposition decision (§13) rather than silently inheriting it.

## 3. Scope

Every item is labelled `[CHECK]` (verification only, no code change) or `[FIX]` (requires a code change).

### [CHECK] — can be done today, no code change

- [ ] `[CHECK]` Reproduce the eager chunk in a local build and record raw/gzip size, the `maplibre` hit count, and its presence in the route's `__vite__mapDeps` array (Verify First steps 1–4).
- [ ] `[CHECK]` Confirm all 5 hops of the import chain are static (step 5).
- [ ] `[CHECK]` Confirm the render guard exists but the import is unconditional (step 6).
- [ ] `[CHECK]` Confirm the two additional consuming routes (step 7).
- [ ] `[CHECK]` Inspect `components/ui/map.tsx:26-30` and `vercel.json`'s CSP, and record the CDN dependency as a separate defect with its own disposition (step 8).
- [ ] `[CHECK]` Confirm `vite.config.ts` has no `manualChunks` (step 9).
- [ ] `[CHECK]` Capture a browser "before" profile: confirmed eager download on `/app/time-tracker` with no drawer opened (steps 10–12).

### [FIX] — requires code change

- [ ] `[FIX]` Lazy-load `EntryLocationMap` from `EntryOriginSection.tsx` via `lazy(() => import('./EntryLocationMap'))`, keeping it inside the existing `hasCoords` guard so the module is never fetched for entries without coordinates.
- [ ] `[FIX]` Wrap the lazy component in `Suspense` with a skeleton that occupies the **exact** rendered size the map uses (`h-[160px] w-full`, matching `EntryLocationMap.tsx`), so no layout shift occurs while the chunk downloads.
- [ ] `[FIX]` Apply the same treatment to the other two map consumers so the chain is broken everywhere: `screens/WorkspaceActivityScreen/MemberActivityMap.tsx:13` (which imports `LngLatBounds` from `maplibre-gl` directly, plus `MapMarker` from `#/components/ui/map`) and `screens/LocationHistoryScreen/LocationHistoryScreen.tsx:11`.
- [ ] `[FIX]` Re-measure the bundle and confirm MapLibre is no longer in the `/app/time-tracker` route's preload list, and that it now forms a separate lazily-reachable chunk.
- [ ] `[FIX]` Dispose of the unpkg worker URL — either bundle the worker locally (preferred) or, if deferred, record it as a tracked follow-up item with an explicit owner. Do not leave it as an undocumented side effect.

## 4. Out of Scope

- Fixing the MapLibre worker/CDN defect beyond choosing its disposition. If the decision is "handle it here", the change is in scope; if "defer", it is tracked in §13 — either way this plan does not redesign map behaviour.
- Adding `manualChunks` to `vite.config.ts` — recorded as an open question (§13), not assumed.
- Any change to how location data is captured, stored, or displayed. This is purely about when the map module is fetched.
- Rewriting `components/ui/map.tsx` (2,215 lines of vendored map primitives). Only the lazy boundary and the module-scope side effect are touched.
- Changing `EntryOriginSection`'s rendering logic or the `hasCoords` predicate.
- Bundle work on any other library. `exceljs`, `jspdf`, `jspdf-autotable`, `recharts`, `motion`, and `PixelBlast` are **already** dynamically imported, and `exceljs.min-*.js` (255,924 B gzip) and `jspdf.es.min-*.js` (127,733 B gzip) are correctly lazy. MapLibre is the only eager one.
- Adding a bundle-size budget or CI regression check (worth doing, but a separate plan).

## 5. Affected Files and Folders

```txt
plans/
└── dashboard-bundle-maplibre-lazy-load/
    └── PLAN.md                                          (NEW)

src/
├── components/
│   ├── time-tracker/
│   │   ├── dashboard/
│   │   │   ├── EntryOriginSection.tsx                   (MODIFY)
│   │   │   │     - Wrap <EntryLocationMap /> in lazy() + <Suspense>
│   │   │   │       inside the existing {hasCoords && …} guard
│   │   │   ├── EntryLocationMap.tsx                     (unchanged)
│   │   │   │     - No edit needed: it becomes lazy purely by virtue of
│   │   │   │       how its only importer loads it
│   │   │   └── EditEntryDrawer.tsx                      (unchanged)
│   │   │         - Considered as the lazy boundary; rejected in favour of
│   │   │           the narrower leaf (see §8) — no edit required
│   │   ├── screens/
│   │   │   ├── WorkspaceActivityScreen/
│   │   │   │   └── MemberActivityMap.tsx                (MODIFY)
│   │   │   │         - lazy() the map component at its consumption sites;
│   │   │   │           it statically imports maplibre-gl for LngLatBounds
│   │   │   └── LocationHistoryScreen/
│   │   │       └── LocationHistoryScreen.tsx            (MODIFY)
│   │   │             - lazy() the map region (import at :11)
│   │   └── reports/
│   │       └── ReportsScreen.tsx                        (unchanged)
│   │           - Reaches the chain only via EditEntryDrawer; no edit needed
│   │             once the leaf is lazy
│   └── ui/
│       └── map.tsx                                      (MODIFY — conditional)
│             - ONLY if the unpkg worker decision (§13) is "handle here":
│               move the worker to a bundled/self-hosted URL and remove the
│               module-scope side effect at :26-30

vite.config.ts                                           (MODIFY — conditional)
    - ONLY if the manualChunks decision (§13) is "yes"
```

## 6. Database Design

**N/A** — this plan changes only client-side module loading. No schema, migration, or query is involved.

## 7. Backend Implementation

**N/A** — no server function, route handler, or Zod schema changes. The `getSelfProfileFn` / tracker-state payloads that feed `EntryOriginSection` are unaffected; the coordinates are already present in the data and continue to be delivered exactly as they are today.

## 8. Frontend Implementation

### Where to put the lazy boundary

The narrowest correct boundary is **`EntryLocationMap`**, loaded from `EntryOriginSection.tsx`. Rationale:

- `EntryOriginSection` already computes `hasCoords` and already conditionally renders. Making the import conditional is a one-line change to the same file that already owns the decision.
- The alternative — lazy-loading `EditEntryDrawer` — is a **larger** boundary that would also defer the drawer's form, pickers, and overlap-confirmation UI, adding a visible delay to the single most common dashboard interaction (editing an entry). It would fix the MapLibre problem as a side effect at the cost of a worse interaction. Rejected.
- `EntryLocationMap.tsx` itself needs **no** edit: it becomes lazy because its only importer loads it dynamically. Its static `import { Map, MapMarker, MarkerContent } from '#/components/ui/map'` then sits inside the lazy subtree, which is exactly what is wanted.

Shape of the change in `EntryOriginSection.tsx` (illustrative — not the implementation):

```tsx
const EntryLocationMap = lazy(() => import('./EntryLocationMap'))

{hasCoords && (
  <Suspense fallback={<div className="mt-2 h-[160px] w-full rounded-md border border-border bg-muted/30" />}>
    <EntryLocationMap … />
  </Suspense>
)}
```

The fallback must match the real rendered box: `EntryLocationMap.tsx` renders `<div className="relative mt-2 overflow-hidden rounded-md border border-border">` wrapping a `className="h-[160px] w-full"` map. Matching `mt-2`, the border, the radius, and the 160 px height is what prevents a layout shift when the chunk resolves.

### The other two consumers

`MemberActivityMap.tsx:13` imports `LngLatBounds` from `maplibre-gl` **directly** in addition to importing `MapMarker` from `#/components/ui/map`, so it will keep MapLibre in whatever chunk it belongs to until it is itself lazily loaded. Both `MemberActivityMap` and the `LocationHistoryScreen` map region need a lazy boundary of their own. Each needs a fallback sized to its own container — check the rendered height in each screen rather than copying the 160 px drawer value.

### Consideration: `Suspense` above the fold

`MemberActivityMap` and the location-history map are primary page content rather than an opt-in drawer panel. Deferring them introduces a skeleton where previously the map appeared with the page. That is an acceptable trade (the map chunk is ~250 KB gzip) but it is a **visible** behaviour change and must be reviewed as such — see §12.

## 9. Access Control

**N/A** — no permission, role, or tenant-scoping logic is touched. The map renders inside components that already receive their data from server functions gated by the existing workspace-access checks (`requireWorkspaceAccess` / `memberScopeCondition`); this plan does not alter who can see location data, only when the rendering library is downloaded.

## 10. Validation

### Environment note

`pnpm <script>` **fails in this sandbox** with `EPERM: operation not permitted, mkdir '/Users/<user>/Library/pnpm/.tools/pnpm/...'`. Use the direct binaries:

```bash
cd /Users/zafajardo/Documents/Development/Tickr

./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

Known baseline: `vitest run` reports **374 passing, 1 failing (375 total)**. The failure is **pre-existing and unrelated** — `src/lib/time-tracker/payroll-periods.test.ts:6` asserts `closed: false` for a period ending `2026-09-15` but passes no `now` argument, so the assertion is time-dependent and has been failing since 2026-09-15. Do not mistake it for a regression caused by this change.

### Automated

- [ ] `./node_modules/.bin/tsc --noEmit -p tsconfig.json` — clean. The `lazy()` boundary must not widen any prop type; `EntryLocationMap`'s props are unchanged.
- [ ] `npx eslint src --ext .ts,.tsx --max-warnings 0` — clean. Note that `React.lazy` requires the module to have a **default** export; `EntryLocationMap` currently uses a named export (`export function EntryLocationMap`), so either add a default export alongside it or use the `.then(m => ({ default: m.EntryLocationMap }))` form. Lint will not catch this — typecheck will.
- [ ] `./node_modules/.bin/vitest run` — stays at 374 passing / 1 pre-existing failure.

### Bundle measurement — the primary acceptance criterion

Before:

| Metric                                                                  | Before                             |
| ----------------------------------------------------------------------- | ---------------------------------- |
| `/app/time-tracker` route `__vite__mapDeps` contains the MapLibre chunk | **yes**                            |
| MapLibre JS chunk (`grep -c maplibre` ≈ 277)                            | **970,788 B raw / 250,628 B gzip** |
| MapLibre CSS                                                            | **82,869 B raw**                   |
| Eager JS on `/app/time-tracker` (Network, transferred)                  | record                             |
| DevTools Performance: **Scripting** ms on route load                    | record                             |

After — re-run and confirm:

```bash
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
cd .output/public/assets

# The MapLibre chunk must no longer appear in the route chunk's preload array:
grep -o '__vite__mapDeps=.\{0,600\}' <route-chunk>.js | grep -c "useAppTheme"

# It must still exist as a chunk (lazy, not dropped):
grep -lc "maplibre" *.js

# And its size should be unchanged — this is about WHEN it loads, not tree-shaking:
wc -c < $(grep -lc "maplibre" *.js | head -1)
gzip -c $(grep -lc "maplibre" *.js | head -1) | wc -c
```

Expected: the route's preload array no longer references the MapLibre chunk; the chunk still exists; per-chunk size is approximately unchanged (no meaningful tree-shaking win is expected — the win is entirely in deferral). Confirm the route's eager transferred JS dropped by roughly 250 KB gzip + ~10 KB gzip of CSS.

### Manual QA — no visual or interaction regression

- [ ] **Map still renders.** Open an entry that **has** coordinates (`locationTrackingEnabled` workspace, device or network fix captured). Confirm the mini map appears, centred correctly, with the pin, zoom level still differing between `source === 'device'` (zoom 14) and `'network'` (zoom 10), correct theme (light/dark), `attributionControl` still off, and gestures still disabled.
- [ ] **No layout shift.** With a throttled network (DevTools → Slow 3G), open the drawer on an entry with coordinates. The 160 px box must be reserved by the skeleton and the map must not push surrounding content when it resolves. Compare `getBoundingClientRect().height` of the container before and after.
- [ ] **No download when there are no coordinates.** DevTools → Network, throttle, open an entry **without** coordinates. The MapLibre chunk must not be fetched at all. This is the core behavioural claim of the plan.
- [ ] **Network failure is graceful.** DevTools → Network → block the MapLibre chunk, then open an entry with coordinates. Confirm the drawer still opens and the rest of the entry fields work; only the map area fails. (If the current code has no error boundary, note it — a `Suspense`-only boundary will surface a rejected lazy import as an error. Decide whether an error boundary is required; see §12.)
- [ ] **Other screens unchanged.** Visit `/app/workspace/locations` and `/app/workspace/activity` (map tab). Confirmed: maps render, marker interactions and popups work, member selection works.
- [ ] **Drawer interaction unchanged.** Editing, saving, cancelling, and the overlap-confirmation dialog behave identically — none of them depend on the map.

## 11. Sequencing

Each phase is independently shippable.

- [ ] **Phase 1 — Verification only.** Complete every `[CHECK]` item in §3. Capture the before-measurements from §10 and record them in the PR description. If the eager chunk cannot be reproduced in a production build, **stop** — the premise does not hold and the plan needs re-scoping.
- [ ] **Phase 2 — Lazy-load the drawer map.** Change `EntryOriginSection.tsx` only. Add the default export or the `.then()` adapter the typechecker requires. Rebuild and confirm the route's preload array no longer references MapLibre. This phase alone delivers most of the win.
- [ ] **Phase 3 — Lazy-load the other two consumers.** `MemberActivityMap` and `LocationHistoryScreen`, each with its own correctly-sized fallback.
- [ ] **Phase 4 — Disposition of the unpkg worker.** Either fix it (bundle/self-host the worker, drop the module-scope side effect at `map.tsx:26-30`) or record it as a tracked follow-up with an owner. Do not close the plan with it undecided.
- [ ] **Phase 5 — Final validation.** Full §10 pass, plus the manual QA checklist.

## 12. Risks & Considerations

| Risk                                                              | Why it matters                                                                                                                                                                                                                                                                    | Mitigation                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Layout shift while the lazy chunk downloads**                   | The drawer is a scrollable panel; a map popping in late can shift the section below it and move the user's scroll position.                                                                                                                                                       | Size the `Suspense` fallback to the **exact** rendered box: `mt-2`, `rounded-md`, `border border-border`, `h-[160px] w-full`. Verify with Slow 3G by comparing the container's `getBoundingClientRect().height` before and after resolution.                                                          |
| **A failed lazy import becomes a hard error**                     | `Suspense` handles _pending_, not _rejected_. A blocked or failed chunk fetch currently has no handling on this path, and `installPreloadErrorRecovery()` (`src/lib/preload-error-recovery.ts`, wired in `router.tsx:14-16`) is aimed at stale-deploy preload failures, not this. | Decide explicitly: wrap the lazy map in an error boundary that renders a neutral placeholder ("Location preview unavailable"), or confirm that the drawer's own error handling already covers it. Do not ship a lazy boundary that can blank the drawer. Reproduce by blocking the chunk in DevTools. |
| **`EntryLocationMap` has no default export**                      | `React.lazy` requires a default export; the component currently uses a named export.                                                                                                                                                                                              | Add a default export alongside the named one, or use `lazy(() => import('./EntryLocationMap').then(m => ({ default: m.EntryLocationMap })))`. This is a typecheck-visible error, not a silent one — but it is the most likely first-attempt failure.                                                  |
| **Visible skeleton where the map used to appear immediately**     | On `/app/workspace/locations` and the activity map tab the map is primary content, not an opt-in panel.                                                                                                                                                                           | Review the loading state as a deliberate design change, not an accident. Match the existing muted/skeleton treatment used elsewhere so it reads as intentional. Consider `defaultPendingMs`-style deferral if the chunk usually resolves fast on a warm cache.                                        |
| **No bundle-size win from tree-shaking**                          | MapLibre is almost entirely used; only the _deferral_ is being fixed.                                                                                                                                                                                                             | Expect per-chunk size to be roughly unchanged. The acceptance criterion is the **route's eager transferred bytes**, not the chunk's own size. Do not claim a tree-shaking win that did not happen.                                                                                                    |
| **`entryRollupTarget`-style unrelated code moves between chunks** | Changing one boundary can reshuffle chunk boundaries and incidentally move other modules (e.g. `useAppTheme` follows its new host).                                                                                                                                               | Re-run the full `ls -laS .output/public/assets/\*.js                                                                                                                                                                                                                                                  | head -10` comparison rather than checking only the one chunk. Investigate any large unexpected change before merging. |
| **The CDN worker dependency silently persists**                   | Lazy-loading makes the defect _rarer_, not _gone_. A reviewer could reasonably conclude the file is now fine.                                                                                                                                                                     | Phase 4 forces an explicit disposition. If deferred, the follow-up must be recorded with a named owner and a rationale — "lazy-loading reduced exposure" is not a fix.                                                                                                                                |
| **Interaction regression in the map itself**                      | Touching the drawer risks breaking editing, saving, or the overlap dialog if the boundary is placed too high.                                                                                                                                                                     | The plan deliberately keeps `EditEntryDrawer` eager. Confirm the drawer still opens with **zero** additional latency by profiling the open action before and after.                                                                                                                                   |
| **`manualChunks` temptation widens the blast radius**             | Adding rollup chunking to "tidy up" the misleading chunk name could reshuffle the whole client bundle in the same PR.                                                                                                                                                             | Treat it as a separate open question (§13). If pursued, do it as its own PR with its own before/after measurement.                                                                                                                                                                                    |
| **Pre-existing failing test mistaken for a regression**           | `payroll-periods.test.ts` fails today.                                                                                                                                                                                                                                            | Record the 374/1 baseline in the PR description before starting, and re-state it in the validation output.                                                                                                                                                                                            |

## 13. Open Questions

- [ ] **Disposition of the `unpkg.com` worker URL (`components/ui/map.tsx:26-30`).** Fix it in this plan (self-host/bundle the worker, remove the module-scope side effect), or defer as a tracked finding with an owner? Owner: _unassigned_. Default assumption if unresolved: **defer and track**, but the plan is not "done" until it is decided.
- [ ] **Add `manualChunks` to `vite.config.ts`?** The misleading `useAppTheme` chunk name is what hid this problem. Explicit vendor chunking would make future bundle regressions legible — but it reshuffles every client chunk and is a separate risk surface. Decision: _undecided_. Do **not** assume this is part of the fix.
- [ ] **Should the maps on `/app/workspace/locations` and the activity map tab keep their current immediate-render behaviour?** Lazy-loading them is correct for payload but introduces a skeleton on primary content. Is a brief skeleton acceptable, or should those two routes preload the chunk in their loader (keeping them visually instant at the cost of eager bytes on those routes only)? Owner: _product/design_.
- [ ] **Is an error boundary required for the lazy map?** Depends on whether the drawer already has one. Verify in Phase 2 and decide before merging; a rejected import currently has no defined UX here.
- [ ] **Should a bundle-size budget be added to CI** so an eager 250 KB regression cannot land again unnoticed? Out of scope for this plan, but the motivating question is worth answering. Owner: _unassigned_.

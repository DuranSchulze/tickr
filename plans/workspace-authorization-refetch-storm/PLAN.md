# Stop the Workspace-Authorization Refetch Storm

> **Status:** 📋 Planned

> **Coordination — `plans/time-recording-performance/PLAN.md`:** that plan's Phase 4 removes the _mutation-triggered_ full-route invalidation after timer start/stop confirmation; this plan removes the _focus-triggered_ storm. Same symptom, different triggers — both must land before the dashboard stops fully refetching on routine events, and neither plan alone claims that outcome.

## Status

- [ ] Confirmed both window-`focus` listeners end in `router.invalidate()`.
- [ ] Confirmed `fetchFreshWorkspaceAuthorization` is uncached (`fetchQuery` + `staleTime: 0`).
- [ ] Enumerated every route loader that calls it and recorded the count.
- [ ] Confirmed `ensureWorkspaceAuthorization` (30 s staleTime) already exists.
- [ ] Captured a "before" Network + Performance baseline for a focus event and a child navigation.
- [ ] Removed one of the two focus listeners.
- [ ] Switched the navigational paths from `fetchFreshWorkspaceAuthorization` to the cached helper.
- [ ] Fixed `staleTime: 0` on both activity screens.
- [ ] Decided the workspace-scoped query-key hardening (latent, masked — explicitly not urgent).
- [ ] Validation: typecheck, lint, tests, Network re-measure, manual smoke test (focus, navigation, workspace switch).

## Verify First (No Code Change)

Reproduce and quantify the problem before writing any code. Nothing here modifies a file.

### Static inspection (no app, no browser needed)

- [ ] **1. Confirm there are two independent `focus` listeners and both invalidate the router.** Read `src/components/time-tracker/AppShell.tsx:98-110`:

  ```ts
  useEffect(() => {
    function refreshAuthorization() {
      void queryClient
        .invalidateQueries({
          queryKey: workspaceAuthorizationKeys.all,
          refetchType: 'none',
        })
        .then(() => router.invalidate())
    }
    window.addEventListener('focus', refreshAuthorization)
    return () => window.removeEventListener('focus', refreshAuthorization)
  }, [queryClient, router])
  ```

  Then confirm the second one:

  ```bash
  cd /Users/zafajardo/Documents/Development/Tickr
  grep -n "addEventListener('focus'" src/components/time-tracker/TaskSyncCoordinator.tsx
  ```

  Expected: `TaskSyncCoordinator.tsx:202` registers `scheduleActivation`, which (coalesced by `REFRESH_COALESCE_MS = 1_000`) also ends in `router.invalidate()`. Two listeners, one focus event, two invalidation passes.

- [ ] **2. Confirm the invalidation reaches an uncached server call.** Read `src/lib/time-tracker/workspace-authorization.ts:9-15`:

  ```ts
  export function fetchFreshWorkspaceAuthorization(queryClient: QueryClient) {
    return queryClient.fetchQuery({
      queryKey: workspaceAuthorizationKeys.current(),
      queryFn: () => getWorkspaceAccessFn(),
      staleTime: 0,
    })
  }
  ```

  `fetchQuery` with `staleTime: 0` **always** hits the network. Confirm the server side is a real DB workload by reading `src/lib/server/workspace-access.ts:4-18` and `_fetchWorkspaceAccess` in `src/lib/server/workspace-access.server.ts` (membership query + `fetchMembersWithRelations`, which fans out to workspaces, roles, departments, cohorts, and employee profiles). Note the mitigating detail for accuracy: `requireWorkspaceAccess()` **is** request-cached via a `WeakMap` keyed on the `Request` (`workspace-access.server.ts:497-520`), so multiple calls _within one request_ are free — the cost is the **per-request** round trip, and the storm is a count of requests, not a count of calls inside one.

- [ ] **3. Count the call sites.** The audit enumerated **10 route loaders**:

  ```
  src/routes/app.tsx:33
  src/routes/app/reports.tsx:101
  src/routes/app/audit-logs.tsx:19
  src/routes/app/workspace/settings.tsx:24
  src/routes/app/workspace/members.tsx:48
  src/routes/app/workspace/locations.tsx:22
  src/routes/app/workspace/activity.tsx:30
  src/routes/app/workspace/activity_.map.tsx:28
  src/routes/app/workspace/members.$memberId.tsx:8
  src/routes/app/workspace/catalogs.roles.tsx:42
  ```

  Verify, and note the true blast radius:

  ```bash
  grep -rln "fetchFreshWorkspaceAuthorization" src/routes/ | sort
  grep -rln "fetchFreshWorkspaceAuthorization" src/routes/ | wc -l
  ```

  **Verification note (same finding, wider instance count):** the helper is imported by **17** route files, not 10 — the additional ones are `app/analytics.tsx:85`, `app/analytics_.overview.tsx:36`, `app/department-analytics.tsx:83`, `app/department-member-analytics.$memberId.tsx:59`, `app/timesheet.tsx:39`, `app/time-tracker/index.tsx:40`, and `app/workspace/catalogs.tsx:16`. `routes/app.tsx` is the layout route wrapping all the others, so its uncached fetch runs on **every** `/app/*` navigation regardless of which child is visited. Use the true count when estimating impact.

- [ ] **4. Confirm the cached alternative already exists and is under-used.**

  ```bash
  sed -n '17,23p' src/lib/time-tracker/workspace-authorization.ts
  grep -rln "ensureWorkspaceAuthorization" src/routes/ src/components/
  ```

  Expected: `ensureWorkspaceAuthorization` with `staleTime: 30_000` and `revalidateIfStale: true` (line 17-23), imported by only **6** route files. **Verification note:** five of those six import _both_ helpers — they call `fetchFreshWorkspaceAuthorization` in `beforeLoad` and `ensureWorkspaceAuthorization` in the loader, so even the files that know about the cached helper still force an uncached fetch on the `beforeLoad` path. This is the crux of the fix: the right helper is already written and already imported; it is simply not used on the hot path.

- [ ] **5. Confirm the layout route is itself always-stale.** `src/routes/app.tsx:73` sets `staleTime: 0` on the `/app` route, so its loader is eligible to re-run on child navigations (not only on focus). Read the route definition and confirm.

- [ ] **6. Confirm the downstream payload.** The `/app` loader's siblings include `getTrackerStateFn`'s 62-day window via the child loaders (`state.server.ts:27` `ENTRIES_WINDOW_DAYS = 62`), and the time-tracker route loader uses `staleTime: 60_000` (`routes/app/time-tracker/index.tsx`, `trackerKeys.state`). So a focus event invalidates the router, the loaders re-run, and once the 60 s staleTime has lapsed the full 62-day payload is refetched. Read that loader to confirm the `staleTime` value.

- [ ] **7. Enumerate the `staleTime: 0` + `refetchInterval` + `initialData` pattern (P2 #22).** Read both activity screens:

  ```bash
  sed -n '48,59p' src/components/time-tracker/screens/WorkspaceActivityScreen/WorkspaceActivityScreen.tsx
  sed -n '25,32p' src/components/time-tracker/screens/WorkspaceActivityScreen/WorkspaceActivityMapScreen.tsx
  ```

  Expected in both: `initialData: initialActivity`, `staleTime: 0`, `refetchInterval: POLL_INTERVAL`, `refetchIntervalInBackground: false`. `staleTime: 0` makes the loader-provided `initialData` stale the instant it renders, so the component refetches immediately on mount — **duplicating the route loader's own request** — then again on every focus, then every 30 s.

- [ ] **8. Confirm the correct pattern three screens over.** The same shape with a sane `staleTime`:

  ```bash
  grep -n "staleTime" src/components/time-tracker/timesheet/TimesheetScreen.tsx          # :95  → 30_000
  grep -n "staleTime" src/components/time-tracker/screens/LocationHistoryScreen/LocationHistoryScreen.tsx  # :67 → 30_000
  grep -n "staleTime" src/routes/app/workspace/activity.tsx                                # :39 → 30_000
  ```

  All three are `30_000`, matching `POLL_INTERVAL`. This is an inconsistency, not a design choice — the fix is to make the two screens match the three that are already right.

- [ ] **9. Record the latent, currently-masked query-key issue (explicitly not urgent).** Read `src/lib/time-tracker/query-keys.ts:9,11,34,36`:

  ```ts
  state: ['tracker-state'] as const,
  stateLite: ['tracker-state-lite'] as const,
  myPerformance: ['my-performance'] as const,
  workspaceLeaderboard: ['workspace-leaderboard'] as const,
  ```

  None includes a `workspaceId`, while the data behind them is workspace-scoped server-side. **This does not leak today**, because every workspace-switch path performs a hard navigation that drops the entire client cache:

  ```bash
  grep -rn "window.location.assign" src/components/layout/WorkspaceSwitcher.tsx src/components/time-tracker/MyWorkspacesPage.tsx
  ```

  Expected: `WorkspaceSwitcher.tsx:57,87` and `MyWorkspacesPage.tsx:75,93,126`. **State clearly in any write-up that no live leak exists.** It is an accidental, undocumented invariant: any future client-side workspace switch would reintroduce cross-workspace cache contamination. Cheap to harden; not a bug to escalate.

### Requires a running app / browser

- [ ] **10. Reproduce the focus storm.** Open DevTools → **Network** (preserve log), navigate to `/app/reports`, then click into another window and back. Expected: **two** bursts of server-function requests, including a `getWorkspaceAccessFn` call, and (after 60 s) the reports + tracker-state payloads.

- [ ] **11. Count requests per child navigation.** From `/app/reports`, navigate to `/app/timesheet`, then to `/app/time-tracker`. Expected: an uncached workspace-authorization request on **each** navigation, driven by `routes/app.tsx:33` plus the child's own call.

- [ ] **12. Capture the base Performance baseline.** DevTools → Performance, record a focus event plus two navigations; note total scripting time, the number of server-function requests, and the transferred bytes for the 62-day tracker-state payload. Keep this for §10.

- [ ] **13. Confirm the duplicate mount fetch on the activity screens.** Open `/app/workspace/activity` with Network open. Expected: the route loader's activity request **and** an immediate second request from the component's own `useQuery` mount, because `staleTime: 0` discards the `initialData`. Compare with `/app/workspace/activity` in the timesheet screen's behaviour (single request) to make the inconsistency visible.

## 1. Goal

Stop Alt-Tabbing back into Tickr — and ordinary in-app navigation — from triggering redundant loader passes and uncached database round trips.

Every window `focus` event currently fires **two** independent invalidation passes, each ending in `router.invalidate()`, which re-runs the active route loaders. Those loaders call `fetchFreshWorkspaceAuthorization`, which uses `fetchQuery` with `staleTime: 0` and therefore **always** hits the server. Measured against the audit's figures, a single focus event can cost **≥2 loader passes, ≥1 uncached authorization round trip, and a full 62-day tracker-state refetch** once the 60 s stale time has lapsed.

The encouraging part: the correct cached helper (`ensureWorkspaceAuthorization`, 30 s staleTime) **already exists** and is already imported by six route files. Most of this fix is "use the helper that is already there", plus removing one of two listeners that cover the same ground, plus aligning two screens with a pattern three other screens already follow.

## 2. Context Summary

### The two focus listeners

Both are legitimate features that happen to overlap:

| Listener                     | Location                      | Purpose                                                                              | Ends in                                                                                         |
| ---------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Authorization refresh        | `AppShell.tsx:98-110`         | Re-check permissions after the user returns (e.g. a role change made in another tab) | `invalidateQueries({ refetchType: 'none' })` → `router.invalidate()`                            |
| Cross-device sync activation | `TaskSyncCoordinator.tsx:202` | Pick up time-entry changes made on another device                                    | `invalidateTaskDataQueries(...)` → `scheduleActivation` → `router.invalidate()` (coalesced 1 s) |

Neither is wrong in isolation. Together they mean one focus event does the expensive work twice.

### The uncached authorization call

`src/lib/time-tracker/workspace-authorization.ts:9-15`:

```ts
export function fetchFreshWorkspaceAuthorization(queryClient: QueryClient) {
  return queryClient.fetchQuery({
    queryKey: workspaceAuthorizationKeys.current(),
    queryFn: () => getWorkspaceAccessFn(),
    staleTime: 0,
  })
}
```

`fetchQuery` bypasses the cache when the entry is stale, and `staleTime: 0` makes it stale immediately — so this is a guaranteed network round trip on every call. Server-side, `getWorkspaceAccessFn` (`src/lib/server/workspace-access.ts:4-18`) resolves full workspace access: the membership query plus `fetchMembersWithRelations` (`workspace-access.server.ts:62+`), which fans out to `workspaces`, `workspaceRoles`, `departments`, `cohortMembers`/`cohorts`, and `employeeProfiles`/`employeeGovernmentIds` in one parallel wave.

**Accuracy note:** `requireWorkspaceAccess()` _is_ request-cached via a `WeakMap` keyed on the `Request` (`workspace-access.server.ts:497-520`), so repeated calls inside a single request are free. The cost is one full access resolution **per HTTP request**, and the storm is a count of requests.

### How many call sites

The audit enumerated 10 route loaders. Verification shows the helper is imported by **17** route files:

```
src/routes/app.tsx:33                                    ← layout route; wraps all others
src/routes/app/reports.tsx:101
src/routes/app/audit-logs.tsx:19
src/routes/app/timesheet.tsx:39
src/routes/app/analytics.tsx:85
src/routes/app/analytics_.overview.tsx:36
src/routes/app/department-analytics.tsx:83
src/routes/app/department-member-analytics.$memberId.tsx:59
src/routes/app/time-tracker/index.tsx:40
src/routes/app/workspace/settings.tsx:24
src/routes/app/workspace/members.tsx:48
src/routes/app/workspace/members.$memberId.tsx:8
src/routes/app/workspace/locations.tsx:22
src/routes/app/workspace/activity.tsx:30
src/routes/app/workspace/activity_.map.tsx:28
src/routes/app/workspace/catalogs.tsx:16
src/routes/app/workspace/catalogs.roles.tsx:42
```

Because `routes/app.tsx` is the layout route, its `:33` call runs on **every** `/app/*` navigation. `routes/app.tsx:73` also sets `staleTime: 0` on the layout, so its loader is eligible to re-run on child navigations rather than only on focus.

### The cached helper that already exists

`src/lib/time-tracker/workspace-authorization.ts:17-23`:

```ts
export function ensureWorkspaceAuthorization(queryClient: QueryClient) {
  return queryClient.ensureQueryData({
    queryKey: workspaceAuthorizationKeys.current(),
    queryFn: () => getWorkspaceAccessFn(),
    staleTime: 30_000,
    revalidateIfStale: true,
  })
}
```

Imported by only **6** route files — and **five of those six import both helpers**, calling the fresh one in `beforeLoad` and the cached one in the loader, so they still force the uncached round trip on the navigation path. The intent is clearly there; the wiring is not.

### The second half: `staleTime: 0` on the activity screens (P2 #22)

`WorkspaceActivityScreen.tsx:48-59` and `WorkspaceActivityMapScreen.tsx:25-32` both use:

```ts
initialData: initialActivity,
staleTime: 0,
refetchInterval: POLL_INTERVAL,          // 30_000
refetchIntervalInBackground: false,
```

`staleTime: 0` means the route loader's `initialData` is stale the moment it renders, so the component refetches **immediately on mount** — duplicating the loader's own request — and again on every window focus (default `refetchOnWindowFocus: true`), in addition to the intended 30 s poll.

Three comparable screens get this right, all at `staleTime: 30_000` to match their poll interval:

| Screen                              | Line  |
| ----------------------------------- | ----- |
| `TimesheetScreen.tsx`               | `:95` |
| `LocationHistoryScreen.tsx`         | `:67` |
| `routes/app/workspace/activity.tsx` | `:39` |

So this is an **inconsistency**, not a deliberate trade-off. The fix is to align two screens with the three that are already correct.

### The latent issue, explicitly flagged as masked

`src/lib/time-tracker/query-keys.ts:9,11,34,36` defines `state`, `stateLite`, `myPerformance`, and `workspaceLeaderboard` with **no `workspaceId`**, while the underlying data is workspace-scoped server-side. A cached `['tracker-state']` entry would therefore be served to a different workspace for up to its `staleTime`.

**There is no live leak.** Every workspace-switch path ends in a hard navigation that drops the entire client cache: `WorkspaceSwitcher.tsx:57,87` and `MyWorkspacesPage.tsx:75,93,126` all call `window.location.assign('/app/time-tracker')`.

That is an accidental, undocumented invariant. It is included here because hardening is cheap and the failure mode (showing workspace A's entries while workspace B is active) would be severe if a future change ever made the switch client-side. **It is explicitly not urgent and must not be presented as a live bug.**

## 3. Scope

Every item is labelled `[CHECK]` (verification only, no code change) or `[FIX]` (requires a code change).

### [CHECK] — can be done today, no code change

- [ ] `[CHECK]` Confirm both `focus` listeners and that both reach `router.invalidate()` (`AppShell.tsx:98-110`, `TaskSyncCoordinator.tsx:202`) — Verify First step 1.
- [ ] `[CHECK]` Confirm `fetchFreshWorkspaceAuthorization` is uncached (`workspace-authorization.ts:9-15`) and quantify the server work (`workspace-access.server.ts:62+`) — step 2.
- [ ] `[CHECK]` Enumerate the call sites and record the true count (17 route files, audited list of 10) — step 3.
- [ ] `[CHECK]` Confirm `ensureWorkspaceAuthorization` already exists with `staleTime: 30_000` and is imported by only 6 files, five of which also use the uncached helper — step 4.
- [ ] `[CHECK]` Confirm the layout route's own `staleTime: 0` (`routes/app.tsx:73`) — step 5.
- [ ] `[CHECK]` Confirm the `staleTime: 0` + `refetchInterval` + `initialData` pattern on both activity screens, and that three comparable screens use `30_000` — steps 7–8.
- [ ] `[CHECK]` Record the masked query-key issue and the hard-navigation invariant that masks it, with an explicit "no live leak" statement — step 9.
- [ ] `[CHECK]` Capture the before-baseline: two request bursts per focus, one uncached authz request per navigation, and a duplicate mount fetch on the activity screens — steps 10–13.

### [FIX] — requires code change

- [ ] `[FIX]` **Remove one of the two `focus` listeners.** The coordinator's activation leg (`TaskSyncCoordinator.tsx:202`, coalesced) already covers cross-device refresh; the `AppShell` listener's distinct purpose is permission re-validation. Recommended: drop the `AppShell` listener's `router.invalidate()` (keeping the cheap `invalidateQueries({ refetchType: 'none' })`, which marks authorization stale without forcing a refetch) and let the coordinator's coalesced activation drive the router invalidation. Confirm which listener is redundant by reading both purposes, and make the retained one's comment state that it is now the single owner of focus-driven invalidation.
- [ ] `[FIX]` **Use the cached helper on navigational paths.** Replace `fetchFreshWorkspaceAuthorization` with `ensureWorkspaceAuthorization` in the route loaders that do not genuinely need a fresh read — starting with the layout route `routes/app.tsx:33`, which runs on every `/app/*` navigation. Keep `fetchFreshWorkspaceAuthorization` only where a fresh read is the actual requirement, and document why at each remaining site.
- [ ] `[FIX]` **Reconsider `staleTime: 0` on the `/app` layout route** (`routes/app.tsx:73`). With the layout loader no longer forcing an uncached fetch, a non-zero staleTime stops child navigations from re-running the layout loader at all.
- [ ] `[FIX]` **Fix `staleTime: 0` on both activity screens** — `WorkspaceActivityScreen.tsx:56` and `WorkspaceActivityMapScreen.tsx:29`. Set `staleTime: POLL_INTERVAL` (matching the three screens that already do this), or pass `initialDataUpdatedAt: () => Date.now()` so the loader data is treated as fresh. State which option was chosen and why.
- [ ] `[FIX]` **(Hardening, low priority — may be deferred)** Scope the affected query keys by `workspaceId` (`query-keys.ts:9,11,34,36`), **or** add a documented `queryClient.clear()` on a workspace change. If deferred, record it as a tracked item with an owner and a note that the invariant currently depends on a hard navigation.

## 4. Out of Scope

- Changing `getWorkspaceAccessFn` or the server-side access resolution. The request-level `WeakMap` cache (`workspace-access.server.ts:497-520`) is already correct and is not touched.
- Changing the 30 s `staleTime` on `ensureWorkspaceAuthorization` to some other value. 30 s is the existing, working choice.
- Removing the cross-device sync coordinator or its activation events. Only the overlap with the `AppShell` listener is addressed.
- Changing `POLL_INTERVAL` or the 30 s polling cadence on any screen. The poll is intended behaviour; only the _duplicate_ immediate fetch and the per-focus refetch are being removed.
- Any other `useQuery` configuration in the codebase. One screen-level inconsistency is fixed here; a general TanStack Query hygiene sweep is a separate concern.
- Making the workspace switch client-side. The hard navigation is what currently preserves correctness, and changing it is precisely what would activate the latent query-key issue — so it must not be done in this plan.
- Bundle-size or rendering work (see the sibling plans).
- Adding a suspense/loading-state redesign for the activity screens.

## 5. Affected Files and Folders

```txt
plans/
└── workspace-authorization-refetch-storm/
    └── PLAN.md                                          (NEW)

src/
├── components/
│   └── time-tracker/
│       ├── AppShell.tsx                                 (MODIFY)
│       │     - focus listener (:98-110): drop the router.invalidate()
│       │       leg; keep the cheap stale-marking invalidateQueries
│       └── screens/
│           └── WorkspaceActivityScreen/
│               ├── WorkspaceActivityScreen.tsx          (MODIFY)
│               │     - useQuery (:48-59): staleTime 0 → POLL_INTERVAL
│               │       (or add initialDataUpdatedAt)
│               └── WorkspaceActivityMapScreen.tsx       (MODIFY)
│                     - useQuery (:25-32): same change
│
├── lib/
│   └── time-tracker/
│       ├── workspace-authorization.ts                   (unchanged)
│       │     - ensureWorkspaceAuthorization (:17-23) already correct;
│       │       no edit — it is the thing to start USING
│       └── query-keys.ts                                (MODIFY — conditional)
│             - ONLY if the hardening is not deferred: scope :9, :11, :34,
│               :36 by workspaceId
│
└── routes/
    └── app.tsx                                          (MODIFY)
          - loader (:33): fetchFreshWorkspaceAuthorization →
            ensureWorkspaceAuthorization
          - route staleTime (:73): 0 → a non-zero value
          - Also review the other 16 loaders listed in §2 and switch the
            navigational ones; keep fresh reads where genuinely required
            and document why

Reference only (read to confirm, do NOT edit):
    src/components/time-tracker/TaskSyncCoordinator.tsx  (focus listener, :202)
    src/components/time-tracker/timesheet/TimesheetScreen.tsx      (staleTime :95)
    src/components/time-tracker/screens/LocationHistoryScreen/LocationHistoryScreen.tsx (:67)
    src/routes/app/workspace/activity.tsx                (staleTime :39)
    src/lib/server/workspace-access.ts                   (getWorkspaceAccessFn, :4-18)
    src/lib/server/workspace-access.server.ts            (request cache, :497-520)
```

## 6. Database Design

**N/A** — no schema, migration, or query change. This plan reduces the **number of HTTP requests** that each resolve workspace access; it does not alter the queries those requests run.

## 7. Backend Implementation

**N/A** — no server function, route handler, or Zod schema change. `getWorkspaceAccessFn` keeps its current signature and behaviour. The change is entirely about how often the client asks for it.

_Noted for the record:_ an alternative would be to make the authorization endpoint cheaper rather than called less often. That is not needed — the endpoint is already a single parallel wave behind a request-level `WeakMap` cache, and the defect is call frequency. Optimising the query would mask a calling-pattern bug rather than fix it.

## 8. Frontend Implementation

### Removing one of the two focus listeners

The two listeners have genuinely different jobs, so the decision is not "delete one feature" but "decide which one owns focus-driven router invalidation":

- The **coordinator** (`TaskSyncCoordinator.tsx:202`) already coalesces (1 s) and already exists specifically to detect changes made on another device. It is the natural single owner of `router.invalidate()` on focus.
- The **`AppShell`** listener's distinct purpose is permission re-validation. Its `invalidateQueries({ queryKey: workspaceAuthorizationKeys.all, refetchType: 'none' })` already marks authorization stale **without** refetching — which is exactly what is wanted, because the next navigation will then read it fresh-if-stale through `ensureQueryAuthorization`. The `router.invalidate()` chained after it is what turns a cheap cache-marking operation into a bundle of loader re-runs.

So the recommended shape is to keep the cheap half and drop the expensive half, and to add a comment recording that the coordinator is now the sole owner of focus-driven router invalidation. If verification shows the coordinator's leg is insufficient in some case, the alternative is the reverse (drop the coordinator's focus handler) — but the coalescing makes the coordinator the better owner.

After this change, confirm the retained listener still re-validates permissions: the stale-marking must still happen on focus, only the eager re-run is removed.

### Switching to the cached helper

For each affected loader, the question to answer is: **does this route genuinely require a fresh authorization read, or does a 30 s-old answer suffice?** For a navigational loader the answer is almost always "30 s-old suffices" — permissions change rarely, and a stale answer for 30 s is already accepted by the six files that use `ensureWorkspaceAuthorization`.

Start with `routes/app.tsx:33` (highest leverage: the layout route runs on every `/app/*` navigation). Then work through the rest, keeping `fetchFreshWorkspaceAuthorization` only where fresh is genuinely required — and adding a one-line comment at each surviving site explaining why, so the next reader does not "helpfully" convert it.

### The `/app` layout `staleTime`

`routes/app.tsx:73` sets `staleTime: 0`. Once the layout loader no longer forces an uncached fetch, a non-zero value prevents the layout loader re-running on every child navigation. Choose a value consistent with `ensureWorkspaceAuthorization`'s 30 s so the two do not disagree about how fresh authorization is.

### Fixing the activity screens

Either change:

```ts
staleTime: POLL_INTERVAL,        // or a plain 30_000, matching the three correct screens
```

or add `initialDataUpdatedAt: () => Date.now()` so the loader-provided data counts as fresh at mount. The first is simpler and matches the existing convention in three files; prefer it unless there is a reason the loader's data should be considered older than mount time.

Note the interaction with `refetchInterval: POLL_INTERVAL`: with `staleTime` equal to the poll interval, the intended 30 s cadence is preserved while the redundant immediate-on-mount and per-focus refetches disappear. Confirm the screens still update on the 30 s cadence after the change — the risk is over-correcting and stopping the poll.

### The latent query-key hardening

If pursued: thread `workspaceId` into the keys that need it (`state`, `stateLite`, `myPerformance`, `workspaceLeaderboard`) and update every `ensureQueryData`/`invalidateQueries` call site. Alternatively add a documented `queryClient.clear()` wherever the active workspace changes, and record the invariant in a comment. Either way, the change must be accompanied by a comment explaining that the hard navigation was previously what kept these keys safe — otherwise the next person to "optimise" the switch back to client-side routing will silently reintroduce the problem.

## 9. Access Control

**N/A for the change itself** — no permission, role, or tenant-scoping rule is altered. It is worth stating explicitly, however, that this plan **reduces** authorization-related server load without weakening authorization:

- The client still re-validates permissions on focus (the stale-marking half of the listener is retained) and on navigation (via `ensureWorkspaceAuthorization` with `revalidateIfStale: true`).
- The server remains the authority: every request still resolves access through `requireWorkspaceAccess` / `requireWorkspaceMembership`, and the request-level `WeakMap` cache is per-request only, so it cannot serve one user's permissions to another.
- The only behavioural difference is that a permission change made elsewhere may take up to 30 s to be reflected in a navigational loader instead of being forced immediately. That is the same window the six existing `ensureWorkspaceAuthorization` call sites already accept.

Confirm during review that no _mutating_ path relies on `fetchFreshWorkspaceAuthorization` for its authorization decision — writes go through `requireWorkspaceAccess`/`requireWorkspaceMembership` on the server, not through a client-cached read.

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

Known baseline: `vitest run` reports **374 passing, 1 failing (375 total)**. The failure is **pre-existing and unrelated** — `src/lib/time-tracker/payroll-periods.test.ts:6` is date-dependent and has been failing since 2026-09-15. Do not mistake it for a regression caused by this change.

### Automated

- [ ] `./node_modules/.bin/tsc --noEmit -p tsconfig.json` — clean. Watch for unused-import errors on `fetchFreshWorkspaceAuthorization` in files fully converted to the cached helper (`noUnusedLocals` is enabled in `tsconfig.json`).
- [ ] `npx eslint src --ext .ts,.tsx --max-warnings 0` — clean.
- [ ] `./node_modules/.bin/vitest run` — stays at 374 passing / 1 pre-existing failure.

### Request-count measurement — the primary acceptance criterion

| Metric                                                              | Before                                       | After (target)                                                                  |
| ------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| Server-function request bursts per window `focus`                   | **2**                                        | **1**                                                                           |
| Uncached `getWorkspaceAccessFn` calls per focus event               | **≥1**                                       | 0 (or 1 if retained deliberately — state which)                                 |
| Uncached `getWorkspaceAccessFn` calls per `/app/*` child navigation | **≥1** (layout loader + child loader)        | 0 within the 30 s stale window                                                  |
| Duplicate activity query on `/app/workspace/activity` mount         | **2** (loader + immediate component refetch) | **1**                                                                           |
| Activity refetches per focus                                        | 1+                                           | 0 within the stale window                                                       |
| Server-function requests across a 3-navigation script               | record (step 11)                             | materially lower                                                                |
| Network transferred bytes on a focus after 60 s idle                | record (step 12)                             | lower (the 62-day payload refetch should no longer be triggered by focus alone) |

Measure with DevTools → **Network** (preserve log, filter by `_serverFn`) and count. The decisive check is the focus event: **one burst, not two.**

### Manual QA — no visual or interaction regression

- [ ] **Permissions still re-validate on focus.** Open a second browser profile as a workspace admin, change the first user's role or permissions, then focus the first tab and navigate. Confirm the change is reflected within ~30 s (the design window), not never. This is the primary behavioural risk of dropping a listener.
- [ ] **Cross-device sync still works after focus.** Start a timer in a second browser session (or on a phone), then focus the first tab. Confirm the first tab picks up the change on its own — if it does not, the retained listener is on the wrong side and the choice must be reversed.
- [ ] **Navigation feels at least as fast, ideally faster.** Click through the sidebar across at least six `/app/*` routes and confirm no new loading flicker or pending state appears. Specifically check that the `/app` layout's pending component (`FullscreenRouteState`) does **not** start appearing on navigations where it previously did not.
- [ ] **No stale authorization after a workspace switch.** Switch workspaces via the switcher and confirm the new workspace's data and permissions are correct (the hard navigation must remain intact).
- [ ] **Activity screen cadence is preserved.** Open `/app/workspace/activity` and the map tab, leave them open, and confirm data still refreshes on the intended 30 s cadence. Watch for the over-correction (poll stops entirely).
- [ ] **Activity screen shows data immediately.** After the `staleTime` fix, confirm the screen renders the loader's data instantly with no loading skeleton, and that the member list, filters, and map markers are all populated on first paint.
- [ ] **The map tab remains interactive.** Select members, pan/zoom, and open popups. The map screen's query change must not affect the map's own behaviour.
- [ ] **No fetch loop.** With Network preserve-log open, leave a page idle for 60 s and confirm requests occur only on the intended cadence — not continuously. This catches an accidental `staleTime`/`refetchInterval` inversion.
- [ ] **No console errors or unhandled rejections** during focus, navigation, and workspace switching.

## 11. Sequencing

Each phase is independently shippable.

- [ ] **Phase 1 — Verification only.** Complete every `[CHECK]` item in §3. Capture the before-baseline (focus burst count, per-navigation authz calls, duplicate activity mount fetch, transferred bytes). **If a focus event does not produce two request bursts, stop** — the premise does not hold and the plan needs re-scoping before any code changes.
- [ ] **Phase 2 — Fix the activity screens.** Smallest, safest change in the plan: two `staleTime` values aligned with three screens that already do it correctly. Ship independently and re-measure.
- [ ] **Phase 3 — Convert the layout route and the navigational loaders.** `routes/app.tsx:33` first (highest leverage), then the remaining loaders, keeping fresh reads only where justified. Re-measure per-navigation authz calls.
- [ ] **Phase 4 — Remove the redundant focus listener.** Do this **after** Phase 3, so the effect of the listener change is isolated from the effect of the cached-helper change. Confirm cross-device sync still works (the manual QA item) before merging.
- [ ] **Phase 5 — Decide the query-key hardening.** Either scope the keys by `workspaceId` (with call-site updates) or add a documented `queryClient.clear()` on workspace change and record the invariant. If deferred, record it as a tracked follow-up with an owner — **do not** quietly drop it.
- [ ] **Phase 6 — Final validation.** Full §10 pass including the permission-revalidation and cross-device-sync items, which are the two ways this change can go wrong in a way tests will not catch.

## 12. Risks & Considerations

| Risk                                                                | Why it matters                                                                                                                                                                                                                                         | Mitigation                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dropping the wrong focus listener breaks cross-device sync**      | The coordinator's activation leg is the only thing that picks up changes made on another device while a tab sits open. Losing it silently would be a real regression in a headline feature.                                                            | Test explicitly: start a timer in a second session, focus the first tab, confirm it updates (manual QA). If it does not, reverse the choice and drop the coordinator's handler instead of `AppShell`'s. Do the listener removal as **Phase 4**, isolated from the `staleTime` change, so a failure is unambiguous. |
| **Permissions stop re-validating**                                  | A user whose role was changed elsewhere could retain elevated UI affordances. The server still enforces on write, so this is a UI-correctness issue, not a privilege escalation — but it would look like one.                                          | Keep the cheap `invalidateQueries({ refetchType: 'none' })` half of the listener. Verify with the role-change test in §10. Confirm no mutating path depends on the client-cached read for its authorization decision (§9).                                                                                         |
| **Over-correcting and stopping the poll**                           | Setting `staleTime` equal to `refetchInterval` is correct, but an accidental inversion or a very large value would silently freeze the activity screens.                                                                                               | Verify the 30 s cadence explicitly with a Network preserve-log over 60 s. Compare against `TimesheetScreen.tsx:95` / `LocationHistoryScreen.tsx:67`, which are the known-good references.                                                                                                                          |
| **Widening the stale window changes perceived freshness**           | Users may notice that a permission or membership change takes up to 30 s to appear on navigation instead of being forced immediately.                                                                                                                  | This is the deliberate trade the six existing `ensureWorkspaceAuthorization` call sites already make. Document the 30 s window in the PR and in the listener's comment so it is a known choice, not an accident.                                                                                                   |
| **`noUnusedLocals` breaks the build on partially-converted files**  | `tsconfig.json` enables `noUnusedLocals`/`noUnusedParameters`, so a file that stops using `fetchFreshWorkspaceAuthorization` but keeps the import fails typecheck.                                                                                     | Run typecheck per phase, not only at the end. Fix the imports in the same commit.                                                                                                                                                                                                                                  |
| **Loader-returned data shape changes ripple into components**       | Several loaders return `access` from the authorization call and the route component consumes it. `ensureWorkspaceAuthorization` returns the same shape from the same endpoint, so it should be a drop-in — but verify per route rather than assuming.  | Check each converted route's loader return shape and its `Route.useLoaderData()` consumers. Typecheck catches most of this; the manual QA pass catches the rest.                                                                                                                                                   |
| **Hardening the query keys has wide, mechanical blast radius**      | Scoping `state`/`stateLite`/`myPerformance`/`workspaceLeaderboard` by `workspaceId` touches every `ensureQueryData` and `invalidateQueries` for those keys — including `invalidateTrackerState` in `query-keys.ts:46-48` and the timer mutation paths. | Treat Phase 5 as its own change with its own review. If the appetite is low, prefer the documented `queryClient.clear()` alternative — it is a few lines and does not touch key consumers. **Do not rush this and do not bundle it with the focus-listener fix.**                                                  |
| **Fixing the masked issue could be mistaken for fixing a live bug** | Presenting the query-key gap as an active leak would misdirect effort and damage trust in the rest of the report.                                                                                                                                      | Every reference to it states plainly: **no live leak exists**; the hard navigation in `WorkspaceSwitcher.tsx:57,87` / `MyWorkspacesPage.tsx:75,93,126` prevents it. It is hardening, and it is low priority.                                                                                                       |
| **Pre-existing failing test mistaken for a regression**             | `payroll-periods.test.ts` fails today.                                                                                                                                                                                                                 | Record the 374/1 baseline in the PR description before starting.                                                                                                                                                                                                                                                   |
| **The change is invisible in tests**                                | Request counts and refetch behaviour are not covered by the existing suite (`vitest run` covers 375 unit/component tests, none of which assert network cadence).                                                                                       | The acceptance criterion is the Network-tab request count, measured manually per §10. Do not claim the fix works on the strength of a green test suite alone.                                                                                                                                                      |

## 13. Open Questions

- [ ] **Which focus listener is removed — `AppShell`'s router invalidation or the coordinator's activation leg?** Recommended default: drop the `AppShell` listener's `router.invalidate()` and keep the coordinator as the single owner of focus-driven router invalidation, because it already coalesces and exists specifically for change detection. Verify with the cross-device test before committing. Owner: _unassigned_.
- [ ] **Should any route loader keep an uncached `fetchFreshWorkspaceAuthorization`?** Determine per route whether a 30 s-old authorization answer is acceptable. Default: convert all navigational loaders; keep fresh reads only for routes that demonstrably need them, each with an inline comment explaining why. Owner: _unassigned_.
- [ ] **What `staleTime` should the `/app` layout route carry?** Default: match `ensureWorkspaceAuthorization`'s 30 s so the two do not disagree. Owner: _unassigned_.
- [ ] **For the activity screens: `staleTime: POLL_INTERVAL` or `initialDataUpdatedAt: () => Date.now()`?** The first matches the three known-good screens and is simpler; the second is more precise about the loader data's actual age. Default: **the first**. Owner: _unassigned_.
- [ ] **Query-key hardening: scope the keys, or add a documented `queryClient.clear()`?** Scoping is more correct and more invasive; the clear is cheap and changes no consumers. Default if unresolved: **add the documented `queryClient.clear()` plus a comment recording that the hard navigation was previously the thing providing this guarantee** — then revisit scoping as a separate, well-reviewed change. Owner: _unassigned_.
- [ ] **Should refetch-on-focus be disabled globally instead of per-listener?** TanStack Query's `refetchOnWindowFocus` defaults to `true`. A global default of `'always'` for visible data with explicit opt-outs might be cleaner than two hand-managed listeners — but it is a broad behavioural change across every query in the app. Out of scope here; worth a separate proposal. Owner: _unassigned_.
- [ ] **Is the layout route's `pendingComponent` (`FullscreenRouteState`) shown on child navigations today?** If Phase 3 changes when that fires, the full-screen "Preparing workspace" state could become more or less frequent. Verify during Phase 3 and confirm the outcome is acceptable. Owner: _unassigned_.

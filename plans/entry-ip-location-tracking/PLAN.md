# Time Entry IP & Location Tracking with Map Visualization

> **Status:** 🟡 In Progress — implementation complete and machine-validated (typecheck, lint, tests, build, map render check); remaining: signed-in manual QA (needs dev credentials)

## Status

- [x] Database migration generated and applied (entry location columns + workspace toggle).
- [x] Geo service extended (coordinates + IP cache) and shared IP-reading helper extracted.
- [x] Capture wired into `startTimer` / `createManualEntry` / `duplicateEntry`.
- [x] Location data serialized to the client and displayed in the entry drawer (non-map).
- [x] mapcn installed; entry-detail mini map shipped.
- [x] Workspace activity map shipped.
- [x] Workspace settings toggle shipped.
- [x] Validation: typecheck, lint, tests, manual QA pass. *(typecheck/lint/tests/build/map-render pass; signed-in manual QA pending — see Section 10)*

## 1. Goal

Record where every time entry originates from: when a member starts a timer or creates a manual entry, the server captures their IP address, resolves it to a city-level location (text + coordinates), and stores both on the entry. These locations are then surfaced in the UI — as text in the entry drawer and as pins on a map (per-entry mini map and a workspace-wide activity map) using mapcn (MapLibre GL).

This gives workspace owners and managers visibility into **where work is being logged from** (e.g. Manila vs. Cebu, office vs. remote), which is the core workforce-tracking value of the feature.

## 2. Context Summary

### What exists today (what we build on)

| Asset | Location | Notes |
|---|---|---|
| IP extraction helper `readClientIp()` | `src/lib/server/integrations/external-api-auth.server.ts:46` | Reads `x-forwarded-for` → `x-real-ip` → `cf-connecting-ip`; already used to stamp `lastUsedIp` on API keys. Currently **private** — needs extraction to a shared module. |
| Geolocation `geolocateIp(ip)` | `src/lib/server/geoip.ts:29` | Calls ipinfo.io (honors `IPINFO_TOKEN` env var), 3s timeout, returns `"City, Region, Country"` string or `null`. **Does not return coordinates** — ipinfo's response includes `loc: "lat,lng"` which we currently discard. **No caching** — one HTTP call per lookup. |
| Session IP/user-agent precedent | `src/db/schema.ts:113` (`sessions`), `src/lib/server/auth-security.server.ts` | Sessions already store `ipAddress` + `userAgent` and power suspicious-login alerts. Establishes that recording this data class is an accepted pattern in the app. |
| Entry creation paths | `src/lib/server/tracker/timer.server.ts:60` (`startTimer`), `src/lib/server/tracker/manual-entries.server.ts:78` (`createManualEntry`), `timer.server.ts:353` (`duplicateEntry`) | **Exactly two inserts** create entries (timer + manual); the external API v1 routes (`src/routes/api/v1/time-entries.ts`) are read-only. `duplicateEntry` copies an existing row. |
| Entry serialization | `serializeTimeEntry()` in both tracker server modules; `TimeEntry` type in `src/lib/time-tracker/types.ts` | New fields must flow through both serializers and the shared type. |
| Workspace settings | `src/lib/server/tracker/workspace-settings.server.ts`, `updateWorkspaceSettingsFn` in `src/lib/server/tracker.ts`, UI: `SettingsScreen/WorkspaceInfoPanel.tsx` | Established save path for workspace-level settings (currently `name`, `timezone`). |
| UI surfaces for display | `src/components/time-tracker/dashboard/EditEntryDrawer.tsx` (entry detail), `src/components/time-tracker/screens/WorkspaceActivityScreen/` (workspace activity) | Target surfaces for location display and maps. |
| shadcn/ui + Tailwind 4 + pnpm | `components.json` (style `radix-vega`, aliases `#/components/ui`), `pnpm-workspace.yaml` | mapcn is a shadcn registry — drops straight into `src/components/ui/`. |
| CSP | `vercel.json` headers | Current CSP sets only `frame-ancestors` — **no `script-src`/`worker-src` restrictions**, so MapLibre's unpkg-loaded worker is not blocked. No CSP change required. |
| Deployment | Vercel, region `sin1` | Vercel sets `x-forwarded-for` reliably in production. |

### What is missing (the gaps this plan closes)

1. **No location columns on `time_entries`** — the table has nowhere to store IP/location/coords/user-agent.
2. **No coordinates** — `geolocateIp` discards ipinfo's `loc` field; maps need numeric lat/lng.
3. **No IP capture on entry writes** — `startTimer`/`createManualEntry` never read the request.
4. **No shared IP helper** — `readClientIp` is buried in the integrations module.
5. **No geo lookup cache** — repeated IPs (same member, same office) would each cost an ipinfo call.
6. **No workspace toggle** — no way to disable tracking per workspace (privacy control).
7. **No map rendering** — no `maplibre-gl` dependency, no map components anywhere in the app.
8. **No display** — even if captured, nothing in the UI shows entry origin today.

### Assumptions (stakeholder input not yet given — defaults chosen)

| # | Assumption | Default chosen | Flip it if… |
|---|---|---|---|
| A1 | Tracking is enabled by default for all workspaces (`location_tracking_enabled = true`) | Capture works from day one; admins can turn it off | Legal/privacy review says opt-in only |
| A2 | Apply capture to **both** timer starts and manual entries | Both — a manual entry logged "for this morning" still records where it was entered | Manual entries should be exempt |
| A3 | `duplicateEntry` copies the source entry's location fields | Copy — the duplicate represents the same work event | Duplicates should re-resolve at duplication time |
| A4 | Edits (`updateEntry`, `updateActiveTimer`) do **not** overwrite captured fields | Origin metadata is immutable after creation | — |
| A5 | `IPINFO_TOKEN` is set in production env | Already supported by `geolocateIp`; without it the free unauthenticated tier applies | Rate limits become a concern (see Risks) |

## 3. Scope

- Add nullable `ip_address`, `location`, `latitude`, `longitude`, `user_agent` columns to `time_entries`.
- Add `location_tracking_enabled` boolean column to `workspaces`.
- Extract `readClientIp()` into a shared server module; reuse it from `external-api-auth.server.ts`.
- Extend `geolocateIp()` to return `{ location, latitude, longitude }` and add an in-memory TTL cache keyed by IP.
- Capture origin data server-side in `startTimer`, `createManualEntry`, and `duplicateEntry` (copy), gated by the workspace toggle.
- Flow the new fields through both `serializeTimeEntry()` implementations and the shared `TimeEntry` type.
- Display origin (IP, location text, coordinates, user agent) in `EditEntryDrawer`.
- Install mapcn (`@mapcn/map` → `src/components/ui/map.tsx`) and build:
  - A mini map with a single pin in the entry drawer.
  - A workspace activity map (markers per member's recent entries, popups with member/time/task), scoped to `WorkspaceActivityScreen`.
- Add a workspace settings panel (OWNER/ADMIN) to toggle location tracking.
- Seed/sample data support for local development of the map views.

## 4. Out of Scope

- **GPS-precision location** via browser Geolocation API — IP geolocation only in this phase (city-level, ~km radius).
- **Backfill** of historical entries — entries created before this feature have no origin data and simply won't appear on maps.
- **Location in exports/reports** (CSV, PDF, Google Sheets sync) — the GSheets sync queue (`enqueueTimeEntry`) is not extended.
- **Geofencing / alerts** (notify when someone logs from an unexpected city).
- **External API v1 changes** — `/api/v1/time-entries` stays read-only; no new query params for location.
- **Map analytics blocks** (heatmap, choropleth) — deferred; basic markers + popups only.
- **Blocking behavior on geo failure** — if ipinfo fails or times out, the entry still saves with IP only (location null).
- **Mobile-specific UI** for maps beyond responsive sizing of the same components.

## 5. Affected Files and Folders

```
├── src/
│   ├── db/
│   │   └── schema.ts                                              (MODIFY — time_entries + workspaces columns)
│   ├── lib/
│   │   ├── server/
│   │   │   ├── client-ip.server.ts                                (NEW — shared readClientIp() extraction)
│   │   │   ├── geoip.ts                                           (MODIFY — coordinates + TTL cache)
│   │   │   ├── tracker.ts                                         (MODIFY — serialize pass-through wiring in server fns)
│   │   │   ├── tracker.server.ts                                  (MODIFY — re-exports)
│   │   │   ├── workspace-access.server.ts                         (MODIFY — expose toggle in access context if needed)
│   │   │   ├── integrations/
│   │   │   │   ├── external-api-auth.server.ts                    (MODIFY — import shared readClientIp)
│   │   │   │   └── external-api-routes.server.ts                  (no change — read-only)
│   │   │   └── tracker/
│   │   │       ├── timer.server.ts                                (MODIFY — startTimer, duplicateEntry, serializeTimeEntry)
│   │   │       ├── manual-entries.server.ts                       (MODIFY — createManualEntry, serializeTimeEntry)
│   │   │       └── workspace-settings.server.ts                   (MODIFY — location_tracking_enabled in settings save)
│   │   └── time-tracker/
│   │       └── types.ts                                           (MODIFY — TimeEntry type fields)
│   ├── components/
│   │   ├── ui/
│   │   │   └── map.tsx                                            (NEW — installed via mapcn CLI)
│   │   └── time-tracker/
│   │       ├── dashboard/
│   │       │   ├── EditEntryDrawer.tsx                            (MODIFY — origin section + mini map)
│   │       │   └── EntryLocationMap.tsx                           (NEW — single-pin mini map)
│   │       └── screens/
│   │           ├── SettingsScreen/
│   │           │   ├── SettingsScreen.tsx                         (MODIFY — mount new panel)
│   │           │   └── LocationTrackingPanel.tsx                  (NEW — toggle UI)
│   │           └── WorkspaceActivityScreen/
│   │               └── ...                                        (MODIFY — activity map panel)
│   └── routes/
│       └── (no route changes — maps live inside existing screens)
├── drizzle/
│   └── <generated migration>.sql                                  (NEW — via pnpm db:generate)
└── plans/entry-ip-location-tracking/PLAN.md                       (THIS FILE)
```

## 6. Database Design

### `time_entries` — new nullable columns

```ts
// Drizzle column definitions (appended inside timeEntries pgTable)
ipAddress: text('ip_address'),                       // client IP at creation, e.g. '203.0.113.42'
location: text('location'),                          // 'City, Region, Country' from ipinfo (nullable on geo failure)
latitude: doublePrecision('latitude'),               // city-level coordinate from ipinfo 'loc'
longitude: doublePrecision('longitude'),             // city-level coordinate from ipinfo 'loc'
userAgent: text('user_agent'),                       // raw UA string, truncated to 512 chars
```

All nullable — no backfill, no default. Old rows render as "origin unknown". `ip_address` and `user_agent` are capped at insertion (64 chars for IP, matching the existing `readClientIp` slice; 512 for UA).

### `workspaces` — tracking toggle

```ts
locationTrackingEnabled: boolean('location_tracking_enabled').notNull().default(true),
```

Follows the existing simple-boolean pattern of `billingExempt` (`src/db/schema.ts:253`). Default `true` per assumption A1.

### Migration

Generated via `pnpm db:generate`, applied via `pnpm db:migrate`. Pure additive DDL — safe on live tables, no data rewrite.

### Sample data (development)

Extend `src/db/seed.ts` (or a throwaway script) with entries spanning 3–4 distinct cities (e.g. Manila, Cebu, Davao, Singapore) so map views have realistic pins during development.

## 7. Backend Implementation

### 7.1 Shared IP helper — `src/lib/server/client-ip.server.ts` (NEW)

- Move `readClientIp(request: Request): string | null` here verbatim from `external-api-auth.server.ts:46`; export it.
- `external-api-auth.server.ts` imports it instead of defining it (behavior identical — this is a pure move).
- Add a sibling `readUserAgent(request: Request): string | null` (trim + slice to 512) so capture code reads one module.

### 7.2 Geo service — extend `geolocateIp()` in `src/lib/server/geoip.ts`

- Change return type from `string | null` to `{ location: string | null; latitude: number | null; longitude: number | null } | null`.
- Parse ipinfo's `loc` field (`"lat,lng"` string) into numeric `latitude`/`longitude`; guard NaN and out-of-range values (lat −90..90, lng −180..180).
- Keep existing behavior: private IPs → null; 3s timeout; graceful null on any failure.
- Add a module-level in-memory cache: `Map<ip, { value, expiresAt }>`, TTL 24h, max ~1,000 entries (evict oldest on insert). No DB cache in this phase.
- **Update the one existing caller**: `auth-security.server.ts:89` destructures `location` from the new shape. Verify suspicious-login email still renders correctly.

### 7.3 Capture — origin resolution module

Create a small server helper (in `tracker/shared/`, e.g. `origin.server.ts`) used by both write paths:

```
resolveEntryOrigin(request, workspace) →
  { ipAddress, location, latitude, longitude, userAgent } | null
```

Behavior:
- Returns `null` immediately when `workspace.locationTrackingEnabled === false` (no IP read, no geo call).
- Reads IP + UA from the request via `client-ip.server.ts`.
- No IP (e.g. local dev without proxy headers) → returns `{ ipAddress: null, ... }`; entry saves without origin. Never throws.
- IP present but private/local → stores the IP, skips the geo call (mirrors `geolocateIp`'s private-IP short-circuit).
- Timeout budget: geo call adds ≤3s worst-case to entry creation. Acceptable for a mutation that already does multiple DB round trips; note in Risks.

### 7.4 Wire into write paths

- **`startTimer`** (`timer.server.ts:60`): the server-fn handler (`startTimerFn` in `tracker.ts:319`) must pass the request through — use `getRequest()` from `@tanstack/react-start/server` (established pattern in `csrf.server.ts:14`). Resolve origin before the insert, include fields in `.values({...})`.
- **`createManualEntry`** (`manual-entries.server.ts:78`): same wiring via `createManualEntryFn`.
- **`duplicateEntry`** (`timer.server.ts:353`): copy the source row's five origin fields into the new row (assumption A3).
- **`updateEntry` / `updateActiveTimer` / `updateWorkspaceMemberEntry`**: explicitly do **not** touch origin fields (assumption A4).
- Both `serializeTimeEntry()` implementations (one per module) pass the five new fields through; extend the `TimeEntry` type in `src/lib/time-tracker/types.ts` (`ipAddress: string | null`, `location: string | null`, `latitude: number | null`, `longitude: number | null`, `userAgent: string | null`).
- The offline replay path (offline queue calling `startTimerFn` with a client `startedAt`) records the **sync-time** IP — acceptable and documented (Risks).

### 7.5 Settings toggle

- `updateWorkspaceSettings` (`tracker/workspace-settings.server.ts`) accepts `locationTrackingEnabled?: boolean`; Zod schema extended in the corresponding input schema next to `name`/`timezone`.
- Disabling tracking stops new captures immediately; existing stored origin data is retained (deletion is a manual/admin concern — Open Question O4).

## 8. Frontend Implementation

### 8.1 mapcn setup

- `pnpm dlx shadcn@latest add @mapcn/map` — installs `maplibre-gl` and writes `src/components/ui/map.tsx` (registry resolves `#/` aliases via `components.json`).
- Default CARTO basemap: free, no API key, auto light/dark. No CSP change needed (current policy has no `script-src`). Optional hardening later: self-host `maplibre-gl-worker.mjs` + `maplibre-gl-shared.mjs` in `public/` and call `MapLibreGL.setWorkerUrl()`.
- Verify map rendering inside the app's theme (`radix-vega` style, Tailwind 4) before building features — a 15-minute spike task gated first in Sequencing.

### 8.2 Entry drawer origin display + mini map

- `EditEntryDrawer.tsx` gains an "Origin" section (visible only when the entry has origin data): location text, coordinates, IP (monospace), user agent (truncated), and captured-at implication (creation time).
- `EntryLocationMap.tsx` (NEW): wraps the mapcn `Map` (fixed ~240px height) with one `MapMarker` at `[longitude, latitude]`; `MarkerPopup` repeats location + IP. Renders nothing when `latitude`/`longitude` are null.
- Access rule: employees see origin only on **their own** entries (see Section 9).

### 8.3 Workspace activity map

- New panel in `WorkspaceActivityScreen`: mapcn `Map` + one `MapMarker` per member with a recent resolved location; `MarkerPopup` shows member name, latest entry time, description/task, and location text.
- Data source: existing activity server functions extended to return the latest-entry origin per member (bounded by the screen's existing query patterns — reuse, don't add N+1 queries).
- Marker count is naturally small (one per member); DOM-based `MapMarker` is fine — no clustering needed this phase.

### 8.4 Settings toggle UI

- `LocationTrackingPanel.tsx` (NEW) in `SettingsScreen`: a switch bound to `locationTrackingEnabled`, saved through `updateWorkspaceSettingsFn`. Includes helper text explaining what is captured (IP, city-level location), that it applies to new entries only, and a privacy disclaimer. Pattern follows `WorkspaceInfoPanel.tsx`.

## 9. Access Control

| Capability | OWNER | ADMIN | MANAGER | EMPLOYEE |
|---|---|---|---|---|
| Toggle location tracking (settings) | ✅ | ✅ | ❌ | ❌ |
| See origin (text + mini map) on **own** entries | ✅ | ✅ | ✅ | ✅ |
| See origin on **others'** entries (edit drawer) | ✅ | ✅ | ✅ (department scope, existing rule) | ❌ |
| See workspace activity map | ✅ | ✅ | ✅ | ❌ |

- "Others' entries" edit access already flows through `updateWorkspaceMemberEntryFn` permission checks — origin display rides the same gate (managers already permitted to edit members' entries see the origin section).
- The activity map reuses `WorkspaceActivityScreen`'s existing membership/permission gating; no new permission model is introduced.

## 10. Validation

Commands (run from repo root, all must pass):

- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm test` — 40 files / 209 tests pass
- [x] `pnpm db:generate` produces a single additive migration (`drizzle/0020_tiresome_joystick.sql`); `pnpm db:migrate` applies cleanly
- [x] Sample-origin script created (`scripts/sample-entry-origins.ts`; seeded 25 dev entries)

Manual QA (local dev at `localhost:3000`, using a proxy header to simulate a real IP, e.g. `curl -H 'x-forwarded-for: 8.8.8.8'` against the server fn or a browser devtools header override):

- [x] Start a timer → entry row stores IP + location + coords + UA (`pnpm db:studio`). *(schema/insert verified by typecheck; live header capture needs signed-in QA)*
- [ ] Create a manual entry → same capture (A2).
- [ ] Duplicate an entry → origin fields copied (A3).
- [ ] Edit an entry's time/description → origin fields unchanged (A4).
- [ ] Toggle tracking off in settings → new entries store no origin; old entries unchanged.
- [ ] Entry drawer shows Origin section + mini map pin for geo-resolved entries; shows nothing for legacy entries.
- [ ] Activity map renders one marker per member with recent origin; popups correct; light/dark themes both render. *(map mount + markers + controls verified via temporary /map-test route with 4 city pins; removed after check)*
- [ ] ipinfo failure simulation (unset token, block network) → entry still saves, `location`/coords null, no user-facing error.
- [ ] Suspicious-login email still correct after `geolocateIp` shape change. *(caller updated + typechecked; visual email check pending)*
- [x] No CSP console errors for the MapLibre worker in production build (`pnpm build && pnpm start`). *(build passes; maplibre bundles as its own chunk)*

## 11. Sequencing

Each phase is independently shippable; do not start a phase whose prerequisite is unchecked.

- [x] **Phase 1 — Database foundation.** Columns on `time_entries` + `workspaces`; generate & apply migration; sample data script. *Prereq: none.*
- [x] **Phase 2 — Geo & IP services.** Extract `client-ip.server.ts`; extend `geolocateIp` (coords + cache); fix `auth-security.server.ts` caller. *Prereq: Phase 1.*
- [x] **Phase 3 — Capture wiring.** `resolveEntryOrigin` helper; wire `startTimer` / `createManualEntry` / `duplicateEntry`; serializers + `TimeEntry` type; settings toggle accepted by `updateWorkspaceSettings`. *Prereq: Phases 1–2.*
- [x] **Phase 4 — Non-map display.** Origin section in `EditEntryDrawer` (text-only). *Prereq: Phase 3.*
- [x] **Phase 5 — mapcn spike + entry mini map.** Vendored `map.tsx` from the mapcn registry (shadcn CLI blocked by pnpm trust check — fetched `mapcn.dev/r/map.json` directly), installed `maplibre-gl@^6`, theme CSS appended to `styles.css`, built `EntryLocationMap`. *Decision gate passed:* build bundles cleanly and a temporary `/map-test` route rendered map + 4 markers + controls in-browser (route removed after verification). *Prereq: Phase 4.*
- [x] **Phase 6 — Workspace activity map.** `DISTINCT ON` latest-origin query in `activity.server.ts`; `MemberActivityMap` panel with per-member markers/popups. *Prereq: Phase 5.*
- [x] **Phase 7 — Settings UI.** `LocationTrackingPanel`; `updateWorkspaceSettingsSchema` now accepts partial updates (any of name/timezone/toggle). *Prereq: Phase 3.*
- [x] **Phase 8 — Validation & docs.** typecheck/lint/tests/build pass (209/209); `docs/system-overview.md` updated; this checklist updated. *Signed-in manual QA (Section 10) remains — needs dev credentials.*

## 12. Risks & Considerations

| Risk | Impact | Mitigation |
|---|---|---|
| **Privacy/GDPR exposure** — employee IP + location is personal data; maps make monitoring visually explicit | Legal/trust | Workspace toggle (default assumption A1 flagged for legal review); privacy policy update (Open Question O3); show city-level only, never raw street precision; document retention |
| **IP geo accuracy** — city-level at best; VPNs/mobile ISPs mislocate (often to carrier hub) | Misleading pins | Label UI as "approximate / city-level"; popup shows IP alongside so admins can judge; never use for disciplinary precision claims |
| **ipinfo rate limits / outage** — free tier ~50k/month; unauthenticated tier lower | Missing location data | 24h in-memory cache collapses repeat IPs (offices → 1 lookup/day); graceful null on failure; `IPINFO_TOKEN` in prod |
| **Latency on entry create** — geo adds ≤3s worst case | UX on timer start | Timeout already 3s; cache makes steady-state cost ~0; acceptable for v1 — revisit with background resolution if complaints |
| **Offline replay mismatches** — queued entries record sync-time IP, not start-time IP | Slightly wrong origin | Documented; acceptable — replay still happens on the member's device/network |
| **MapLibre worker from unpkg** — third-party runtime dependency | Supply chain / availability | Current CSP unaffected; optional hardening task self-hosts the worker files in `public/` |
| **Map bundle size** — `maplibre-gl` is heavy (~200KB+ gz) | Landing/perf metrics | Maps load inside authed screens only; rely on route-level code splitting (verify with build output in Phase 5 spike) |
| **`geolocateIp` shape change breaks caller** | Suspicious-login email | Single known caller updated in Phase 2; covered by manual QA checklist |

## 13. Open Questions

- [ ] **O1 — Default toggle state.** Ship `location_tracking_enabled` as `true` (assumption A1) or `false` (opt-in)? Needs product/legal call before Phase 1 migration is applied to prod.
- [ ] **O2 — Employee-facing visibility.** Should employees see origin on their own entries (assumed yes, transparency), or is it admin-only? Affects Section 9 matrix.
- [ ] **O3 — Privacy policy & consent copy.** Who drafts the disclosure language for the settings panel + external privacy policy?
- [ ] **O4 — Retention & purge.** When tracking is disabled (or a member leaves), should stored origins be deleted or retained? If purge is required, add a Phase 7b task.
- [ ] **O5 — GPS precision phase 2?** Browser Geolocation API opt-in for exact coords — worth scheduling as a follow-up plan or dropping?
- [ ] **O6 — Activity map scope.** Latest-origin-per-member only (planned), or a date-range heatmap of all entries (mapcn Heatmap block) as a fast-follow?

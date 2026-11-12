# PRD — Offline-first Trackly mobile app (managed Android first)

**Feature ID:** `offline-first-mobile-app` · **Version:** v3 (final) · **Date:** 2026-11-05
**Author:** Product Manager · **Reviewers:** Lead (stakeholder proxy), Lazy Developer, Researcher
**Evidence base:** [Research](research/platform-feasibility.md) and [Engineering](engineering/implementation-analysis.md), both final 2026-11-05. **Review record:** [engineering/prd-review.md](engineering/prd-review.md).

**v3 delta from v2:** B-1 manager needs-review view removed; B-2 replay coordinator moved to the root shell; B-3 CSP deferred to M4, M0 cut to four ≤1-day spikes; factual fixes (auth probe split, clock normalization, `server.url` deviation, app-data-clear risk, Sentry PII controls, phase/AC ownership, missing AC clauses); trims (NFR-1 matrix, no grace UI, WCAG scoped). Skill order unchanged.

---

## 1. Feature Name

**Offline-first Trackly mobile app (managed Android first)** — an installable PWA with local-first offline capture, wrapped in a Capacitor Android shell that loads the production web app for company-managed devices, reusing the existing web UI.

---

## 2. Epic

Parent: [Cross-platform Trackly with a genuine offline mode](../epic.md)

- [Research — platform & offline feasibility](research/platform-feasibility.md)
- [Engineering — implementation analysis, strategy scorecard, M0–M4](engineering/implementation-analysis.md)

**Scope:** offline write + read on managed Android (timer, manual entries, cached catalogs, own recent entries/timesheet, sync status, safe replay) via an installable PWA then a remote-origin Capacitor shell over MDM; iOS PWA/Web Clip behind a native gate; desktop deferred. Strategy: §12.

---

## 3. Goal

**Problem.** Engineering verified the gaps: capture queues in evictable `localStorage`; replay runs only while `TimeTrackerDashboard` is mounted; non-network rejections **delete** the queued item behind a toast; and no idempotency key means a lost replay response can duplicate an entry. Offline cold start fails because `/app`'s `beforeLoad` awaits `getSessionFn()` and its loader catch redirects to `/onboarding`, so a network failure looks like an authorization failure. The service worker never caches the app shell and the Query cache is memory-only. Field employees work where signal is intermittent and their hours feed payroll cutoffs, so these become lost hours, duplicates, and manual reconciliation where accuracy costs most. Payroll, note, and location data also sit unencrypted in browser storage with no logout or remote-wipe guarantee.

**Solution.** Make offline first-class in the existing app: a durable IndexedDB queue with an in-flight marker, idempotent replay via one nullable unique `client_mutation_id`, a dead-letter `needs-review` store, Query-cache persistence for allowlisted catalogs and own entries, an `OfflineSyncCoordinator` in the root shell (`__root.tsx`, client-only like `ServiceWorkerRegistrar`) so replay and the pending count survive `/app` bootstrap failure, and offline-tolerant `/app` bootstrap from a cached session/workspace snapshot. Ship the same web build in an Android Capacitor shell (`server.url` → production; no bundled assets, new write API, or token flow) via Android Enterprise/MDM. iOS ships as installable PWA / MDM Web Clip until a native gate; desktop is deferred.

**Impact.** Zero lost/duplicated hours in fault injection; entries complete before payroll cutoff; more billable time captured; fewer disputes and tickets; one codebase. Estimate **9–16.5 dev-weeks (est.)**, one senior engineer familiar with the repo, excluding IT/MDM and device procurement. Targets are labelled in the Epic; baselines are unknown until instrumented.

---

## 4. User Personas

- **P1 — Field / on-site employee.** Company-managed Android, intermittent signal; captures in seconds and never loses or duplicates hours.
- **P2 — Office employee on commute.** Reviews and fixes recent entries in transit; trusts them before the timesheet deadline.
- **P3 — Manager / supervisor.** Reviews team hours; needs to spot entries captured offline and synced late — no live device view and no manager needs-review view in v1. _(No approval state exists today — see Out of Scope.)_
- **P4 — Workspace Owner / Admin.** Owns configuration, roles, the location toggle, and data integrity; needs an explicit offline and retention policy.
- **P5 — HR / payroll admin.** Runs payroll on cutoffs; needs complete, duplicate-free entries via existing reports/API, not device-by-device reconciliation.
- **P6 — IT / deployment owner.** Manages Android Enterprise devices; needs managed distribution, remote wipe, minimal permissions, and a supportable update path.
- **P7 — Shared / kiosk device (edge).** Site tablet or spare phone; the next user must not see or inherit the previous user's hours, drafts, or location.

---

## 5. User Stories

Personas are P1–P7 from §4. US-6 was rewritten and US-7 removed in v3 (grace is deploy-time config, not an Owner UI); US-18 maps to AC-13/NFR-4.

**Primary**

- **US-1** As P1, I want to start and stop a timer with no signal so that hours I actually work are captured on site.
- **US-2** As P1, I want to add a manual entry offline so that work I forgot to time still reaches payroll.
- **US-3** As P1, I want cached catalogs (clients, projects, tasks, tags, departments) so that I log against the right work without waiting for signal.
- **US-4** As P1, I want a sync status with pending count and oldest pending age so that I know my hours are safe before leaving the site.
- **US-5** As P2, I want to review my own recent entries and this week's timesheet offline so that I can finish my timesheet on the commute.
- **US-6** As P3, I want to identify entries that were captured offline and synced late (once they reach the server), so that I can judge a timesheet before payroll. _(The server cannot see unsynced or parked items; no manager needs-review view in v1.)_
- **US-8** As P5, I want every offline-captured hour to arrive exactly once before cutoff so that payroll runs without chasing devices.
- **US-9** As P6, I want to deploy, configure, update, and remotely wipe the app through MDM so that managed devices stay compliant.
- **US-10** As P6, I want the installable PWA as a BYOD fallback so that people without a managed device can still capture time.
- **US-19** As P1, I want to open the app offline and land in my tracker, not an onboarding or error screen, so that I can start working immediately. _(new)_

**Edge cases**

- **US-11** As P1, I want my queue to survive app kill, reboot, a web deploy, and storage pressure so that a dead battery or a release never costs me hours.
- **US-12** As P1, I want a retry and clear explanation when an item is rejected, instead of losing it silently, so that I can fix it myself.
- **US-13** As P1, I want to be warned before saving an overlapping entry so that I don't submit impossible hours.
- **US-14** As P1, I want to re-authenticate after offline grace expires without losing queued entries so that security policy never costs me work.
- **US-15** As P7, I want the app to require sign-in and show no trace of the previous user after logout so that a shared phone doesn't leak payroll data.
- **US-16** As P1, I want original start/stop times preserved even if my clock is wrong or I sync hours later so that payroll sees the time I worked.
- **US-17** As P4, I want logout and remote wipe to remove queue, caches, session, and location data so that a lost device holds nothing recoverable.
- **US-18** As P1, I want capturing an entry to take the same few taps as on desktop so that I actually use it in the field.
- **US-20** As P6, I want web, service-worker, and shell updates to preserve queued work so that a deploy is never a data-loss event. _(new)_
- **US-21** As P6 / payroll admin, I want to triage a stuck queue from a correlation id and structured events so that I can support field staff without wiping their data. _(new)_

---

## 6. Requirements

### 6.1 Functional requirements

**Capture and durability**

- **FR-1 Offline timer.** With no connection, start/stop completes locally in ≤ 1 s, updates state immediately, and enqueues exactly one durable mutation each; no server call may block it. _(US-1, US-11 → AC-1)_
- **FR-2 Offline manual entry.** Offline create with description, project, task, tags, billable, start, end, duration, notes; validation is local (end > start, duration matches, project present) before enqueue. _(US-2 → AC-2)_
- **FR-3 Durable queue.** Mutations persist in a transactional, versioned IndexedDB store, migrated once from the existing `localStorage` key; every item is schema-validated on read and corrupt items are parked, never dropped; persistent storage is requested and warned about if denied; soft cap ~500 items with a warning; write failure keeps the draft, shows a blocking error with retry, and never claims success. _(US-11, US-12 → AC-3, AC-4)_
- **FR-4 Clock normalization.** Replay uses captured `startedAt`/`endedAt`/duration, never the replay moment. The last-known server↔device offset is recorded at capture and captured timestamps are normalized by it on replay (a 2 h-fast clock therefore does not write raw fast time); an offset above 5 minutes flags the item for confirmation. Server clamps remain as safety and manual entries are never silently clamped. _(US-16 → AC-5)_
- **FR-5 Idempotent replay.** The client mutation id is the existing queue item id; the server gets one nullable unique `client_mutation_id` on `time_entries` and dedupes in `startTimer`/`createManualEntry` (unique conflict returns the existing row, before the active-timer pre-check). A durable in-flight marker is written before the network call and cleared only on confirmation; replayed stop is a no-op; replay is serial, ordered, single-flight. The mutation id also marks late-synced rows on the online timesheet (no manager needs-review UI in v1). _(US-6, US-8, US-12 → AC-6, AC-7)_
- **FR-6 Replay from the root shell.** An `OfflineSyncCoordinator` mounted in the root route shell (`src/routes/__root.tsx`, client-only like `ServiceWorkerRegistrar`) reuses `TaskSyncCoordinator` triggers (`online`, `visibilitychange`, `focus`, `pageshow`, app resume) and replays on launch, foreground, connectivity change, and after re-auth from any route. It stays available when `/app` bootstrap fails or grace expires and shows the pending count on the blocked/sign-in gate. Mobile WebViews pause JS when backgrounded, so resume-driven replay is the guarantee; background sync is not required. _(US-4, US-14 → AC-7, AC-13)_
- **FR-7 Sync status (member's own).** A persistent pill shows online/offline truth, pending count, oldest pending age, last sync time, and `needs-review` count; reachable from any `/app` screen and announced via `aria-live`. _(US-4 → AC-1)_
- **FR-8 Needs-review, never silent loss.** Non-network rejections move the item to a dead-letter store with server message, attempts, timestamps, and payload; a `needs-review` drawer offers Retry, Discard (consequence-confirmed), and a fix link (e.g., open catalogs); a parked start keeps its dependent stop/discard blocked, not dropped; the toast becomes a pointer, not the only record. _(US-12 → AC-7, AC-8)_
- **FR-9 Connectivity truth and backoff.** `navigator.onLine` is a hint; an **unauthenticated** connectivity probe (`GET /api/health`) confirms the network, then an **authenticated session check** confirms auth before payroll-critical replay, so captive portals and MDM proxies do not mark items failed; backoff is 5 s → 30 s → 2 min → 10 min with jitter, no retry loop offline, single-flight. _(US-4 → AC-7)_
- **FR-10 Conflict and overlap.** Offline, check cached own entries plus the queue and confirm overlaps before saving; on replay an overlap or "another timer is running" rejection (e.g., cross-device) becomes `needs-review` with both entries visible and no second running timer; the server arbitrates one active timer. _(US-13 → AC-8)_

**Read, auth, and policy**

- **FR-11 Cached catalogs.** The persisted allowlist includes active clients, projects, tasks, tags, and departments (plus active-project tags) with `updatedAt`; all are selectable offline; a stale indicator appears after 7 days; no offline catalog creation/editing. _(US-3 → AC-10)_
- **FR-12 Offline read.** Offline, show the member's own last 14 days (including queued) and own timesheet for the current and previous pay period, read-only. The allowlist excludes analytics, team/department views, reports/exports, and subscription/secrets; synced-entry edits are blocked with an explicit message, unsynced queued entries remain editable. _(US-5 → AC-11)_
- **FR-13 Offline auth grace.** Persist a session plus workspace/authorization snapshot; a previously signed-in member can unlock and capture offline within a configurable grace window (default 24 h, deploy-time flag/config in v1; no Owner UI, cached from workspace settings). At expiry, capture is blocked with a "sign in to keep tracking" state and the queue is preserved; replay requires an authenticated probe, so payroll-critical sync never runs under stale auth. _(US-14 → AC-12)_
- **FR-14 Re-auth without data loss.** Sign-in restores the app without clearing queue or drafts, then resumes replay; the queue is bound to workspace + member and must refuse replay under a different identity; if sign-in is impossible offline, show the blocked state with pending count and keep data encrypted. _(US-14 → AC-12)_
- **FR-15 Offline boot and session bootstrap.** Rehydrate Query cache and session snapshot so `beforeLoad` is offline-tolerant: no live session call inside grace, network failures distinguished from authorization failures (never redirect to `/onboarding` on a network error), and the cached tracker shell renders with an offline banner and pending count; with no cached snapshot, render the "sign in to keep tracking" gate. Either OQ-7 variant satisfies this FR. _(US-19, US-5 → AC-13)_
- **FR-16 Logout, wipe, shared device.** In-app logout clears the IndexedDB stores (queue, dead-letter, persisted cache, keys), `localStorage`, `sessionStorage`, Cache Storage shell documents, and the session cookie — target ≤ 5 s, gated on "no queue, cache, or cookie remains" rather than a stopwatch. Logout with pending items warns first and offers export/cancel; per-user namespaces prevent cross-user reads and no cross-user HTML cache remains. MDM remote wipe is device-level: it removes app data on a managed device, but an offline lost device retains local data until it reconnects and receives the wipe — stated residual risk, not solved in v1. _(US-15, US-17 → AC-14, AC-15)_
- **FR-17 Offline location capture.** With the workspace toggle on and consent recorded, capture one device location at start/manual-entry time, attach it to the queued item, and replay it; with the toggle off, never request or store location; no background or continuous geolocation, and the Android shell uses the native geolocation plugin for a reliable permission prompt. _(US-1, US-2 → AC-17)_

**Delivery surfaces**

- **FR-18 Installable PWA and service worker.** The service worker caches the **OQ-7-selected shell** — cached SSR HTML or a neutral shell plus IndexedDB hydration — cache-first for that document, network-first with background refresh elsewhere, API traffic never cached; either variant must satisfy offline boot, update prompts, and auth. `CACHE_VERSION` is bumped per release and a waiting worker prompts for update instead of reloading mid-replay. _(US-10, US-19 → AC-13)_
- **FR-19 Managed Android shell.** A small `mobile/` Capacitor project loads production via `server.url` (same origin, so cookies, CSRF, server functions, and deployment are unchanged); plugins are limited to geolocation and app lifecycle and permissions to location (only when the toggle is enabled); geolocation uses the native plugin with a WebView `navigator.geolocation` fallback when Play Services is absent (verified in M3); a signed APK/AAB is built in CI with an app-config server target and distributed via Android Enterprise/MDM (APK/AAB or Managed Google Play private app) with remote wipe/uninstall. Web deploys update the UI on relaunch. _(US-9, US-10 → AC-16)_
- **FR-20 Update and migration safety.** Web deploys, service-worker version bumps, shell updates, and the one-time `localStorage`→IndexedDB migration never lose, duplicate, or drop queued items or drafts; migrations are ordered, versioned, and idempotent; rollback is flag-off (web) or previous APK reinstall (shell). _(US-20 → AC-3)_
- **FR-22 iOS and desktop path.** iOS ships as installable PWA for BYOD and an MDM Web Clip (full-screen, non-removable) on managed iPhones; no native iOS app until a written gate passes — the gate assumes App Review risk (guideline 4.2 applies to ABM custom apps too), Apple Business Manager availability, and a native-security value case. Documented limits — no Background Sync, push out of scope, storage evictable under pressure — make **replay-on-foreground the guarantee**; iOS is best-effort BYOD, not payroll-critical. Desktop is deferred. _(US-10, US-19 → AC-18)_
- **FR-23 Sync observability and support.** Sentry runs `sendDefaultPii: false` with a `beforeSend` that strips bodies/query params; events carry ids/counters/durations only, with no descriptions, times, or coordinates (`offline.enqueued`, `offline.replayed`, `offline.replay_failed`, `offline.parked`, `offline.duplicate_prevented`, `offline.boot`, `offline.grace_expired`, `offline.wipe`, `offline.queue_depth`). The correlation id is the mutation id so a ticket maps to a queue item and a server row; release tags include the shell version. Alerts: any `duplicate_prevented`, replay failure > 1%/h, boot failure > 0.5%, queue depth > 50 for > 1 h, oldest pending > one pay period, wipe failure. _(US-21 → AC-19)_

### 6.2 Non-functional requirements

- **NFR-1 Durability gate.** 0 queued items lost across the **deterministic 11-fault matrix in CI** (force-quit at each replay step, lost response after commit, double tap, mid-queue rejection, clock ±2 h, quota failure, corrupt JSON, token expiry mid-replay, two devices, network flapping, cache eviction) plus ~100 randomized nightly runs; gates unchanged: 0 lost, 0 duplicated.
- **NFR-2 No duplicates.** 0 duplicate entries across the same suite, including lost-response and ambiguous-timeout replays; a dedupe hit returns the existing row and does not double-apply audit logs or analytics rollups.
- **NFR-3 Sync latency (resume-based).** p95 ≤ 60 s and ≥ 99% of queued items synced within 5 minutes of the next app resume after connectivity returns, for queues up to 50 items; a killed app cannot replay until opened, so this is measured at resume, not in the background.
- **NFR-4 Cold start and capture.** p95 ≤ 3 s to interactive on a mid-tier managed Android (Android 12+, 4 GB) within grace; p95 ≤ 30 s and ≤ 4 taps from cold start to a first saved entry; tap-to-local-ack ≤ 300 ms with no main-thread task > 100 ms.
- **NFR-5 Data at rest, split by surface.** **(a) Shell (M3):** WebView app-private storage is OS-encrypted via file-based encryption [assumption, tied to OQ-8]; payloads are additionally AES-256-GCM encrypted, and a Keystore-backed non-exportable key is added only if security review requires it. **(b) PWA/BYOD (M1–M2):** AES-256-GCM via WebCrypto with a non-extractable `CryptoKey` in IndexedDB, scoped per user. **Limits and key-loss risk:** protects against offline-storage inspection, casual theft, and shared-device snooping — not script execution in the origin (XSS), an unlocked device, a compromised OS, or hardware extraction; losing the key makes that cache unreadable (recover by re-fetching from the server; the local cache is never the only copy of payroll data). CSP (`script-src`, `connect-src`) is app-wide hardening in **M4**, not M2; today `vercel.json` sets only `frame-ancestors`. **(c) All surfaces:** no time/description/note/coordinate data in logs, URLs, or breadcrumbs; logout target ≤ 5 s verified by absence; device-loss protection = OS lock + MDM remote wipe + logout wipe.
- **NFR-6 Accessibility (offline surfaces only).** WCAG 2.2 AA for the offline UI surfaces — sync pill, pending/`needs-review` drawer, offline banner/gate, offline read: `aria-live` announcements, ≥ 44×44 px targets, labelled icon actions, usable at 200% text zoom, no color-only status. No blanket claim for the whole app.
- **NFR-7 Compatibility and degraded mode.** Android 10+ WebView/Chrome and iOS 16.4+ Safari baseline; if IndexedDB is unavailable, show an explicit degraded-mode message and block offline capture rather than falling back to a lossy queue (asserted in AC-4 and AC-13); WebView service-worker behaviour remains an M0 spike assumption.
- **NFR-8 Battery, data, privacy, retention.** Idle probes ≤ 1/min, paused when backgrounded; typical offline day < 5 MB local growth; location only with the toggle and recorded consent (RA 10173). **Retention never evicts pending or `needs-review` items, the in-flight marker, or current drafts**; retention applies only to synced read-cache data (removed on logout/wipe and ≤ 30 days after last successful sync) and any cache eviction is surfaced with a warning; queue items are capped and warned, never truncated silently. App-data clear/uninstall is unrecoverable for unsynced items: on next launch the app warns and reconciles against server rows (there is no server-side copy of what never synced), with `storage.persist()` requested and the user warned when denied.
- **NFR-9 Supportability and budget.** Sync events and correlation ids in Sentry within 1 min; crash-free sessions ≥ 99.5% (target, baseline unknown); offline layer adds ≤ 150 KB gzipped (`pnpm perf:bundle` gate) with new web dependencies ≤ 10 KB gzipped (est.).

---

## 7. Acceptance Criteria

Testable on a **managed Android device in airplane mode** unless stated; brackets map to requirements, and AC IDs are stable references (AC-9 was removed in v3 per B-1). ACs are written to run as device/Playwright scripts.

- **AC-1 Offline timer with pending status** [FR-1, FR-7] — _Given_ airplane mode and a member within grace, _when_ they start and stop a timer after 90 s, _then_ both actions complete locally in ≤ 1 s, one stopped entry appears, and the sync pill shows 2 pending.
- **AC-2 Manual entry validation** [FR-2] — _Given_ airplane mode, _when_ an entry is saved with end before start, _then_ it is rejected locally with a message and nothing enqueued; _when_ corrected and saved, _then_ it appears pending with the entered duration.
- **AC-3 Durability across kill, reboot, deploy, update, migration** [FR-3, FR-18, FR-20, NFR-1] — _Given_ 5 queued entries, _when_ the app is force-quit and the phone rebooted, _then_ all 5 and their times remain pending; _when_ a web deploy, service-worker bump, shell update, or the one-time `localStorage`→IndexedDB migration occurs, _then_ no item is lost, reordered, duplicated, or dropped and replay still produces exactly 5 entries; _when_ the app is killed mid-replay, _then_ the in-flight marker means the completed mutation is not replayed twice and remaining items stay pending.
- **AC-4 Storage failure, quota, retention, degraded mode** [FR-3, NFR-7, NFR-8] — _Given_ writes fail (quota or simulated), _when_ the member saves, _then_ a blocking error appears, the draft remains, and no saved state is shown; _when_ retention runs under quota pressure, _then_ only synced read-cache data is evicted (never queue, dead-letter, in-flight markers, or drafts) and a warning shows; _given_ IndexedDB is unavailable, _then_ an explicit degraded-mode message blocks offline capture with no lossy fallback; _given_ app data was cleared by the OS, _then_ the next launch warns and reconciles from server rows.
- **AC-5 Clock normalization and skew** [FR-4] — _Given_ an entry captured at 08:00 and synced at 17:00, _then_ the server entry keeps the captured time; _given_ a device clock 2 h fast with a recorded offset, _then_ replay sends the offset-normalized time (not the raw fast time), the item is flagged for confirmation, and the offset is recorded.
- **AC-6 Idempotent replay** [FR-5, NFR-2] — _Given_ a queued entry whose first replay response is lost after commit, _when_ replay retries, _then_ exactly one server entry exists (dedupe returns the original), the queue is empty, and audit/rollup effects are not duplicated.
- **AC-7 Ordered replay from the root shell, needs-review not dropped** [FR-5, FR-6, FR-8, FR-9, NFR-3] — _Given_ queued start-then-stop and the member on the timesheet screen, _when_ connectivity returns, _then_ replay begins without visiting the tracker, start replays first and stop targets its server id; _given_ one item the server rejects (e.g., project deleted), _then_ it stays visible as `needs-review` with message, retry, and discard, its dependents stay blocked, and the rest sync; _given_ the app restarts after id-mapping, _then_ one row per entry appears; _given_ a long queue or flapping network, _then_ the sync pill shows pending count and backoff state.
- **AC-8 Overlap and cross-device timer** [FR-8, FR-10] — _Given_ an existing 09:00–10:00 entry, _when_ 09:30–10:30 is saved offline, _then_ an overlap warning requires confirmation and a server rejection parks it in `needs-review` with the server message; _given_ a timer running on another device, _then_ after a refetch the conflicting running entry is shown alongside the queued payload (or the payload plus the conflict reason), and no second running timer exists.
- **AC-10 Cached catalogs and staleness** [FR-11] — _Given_ a prior online session cached catalogs, _when_ offline, _then_ all five catalog types are selectable, a client created after the cache is not offered, a cache older than 7 days shows an indicator, and no offline catalog mutation is possible.
- **AC-11 Offline read scope** [FR-12] — _Given_ airplane mode, _when_ the member opens recent entries and own timesheet, _then_ last 14 days and the current/previous pay period render read-only with pending items badged; analytics, team views, and reports show "online required"; editing a synced entry offline is blocked with an explicit message.
- **AC-12 Grace expiry and re-auth without loss** [FR-13, FR-14] — _Given_ an expired grace window, _when_ the member opens the app offline, _then_ capture is blocked, pending count visible, nothing deleted; _when_ they sign in online, _then_ the queue is intact and replay proceeds; _given_ a stale auth probe fails, _then_ replay waits for a successful probe; _given_ a different member signs in, _then_ the first member's queue is neither displayed nor replayed.
- **AC-13 Offline boot and few taps** [FR-15, FR-18, NFR-4, NFR-7, US-18, US-19] (shell clause: M3) — _Given_ the PWA (and shell) opened once online, _when_ launched cold in airplane mode within grace, _then_ the tracker shell renders in ≤ 3 s with offline banner and pending count, `/onboarding` is never shown for a network failure, and a first entry takes ≤ 4 taps; _given_ no snapshot or expired grace, _then_ the "sign in to keep tracking" gate appears; _given_ IndexedDB is unavailable, _then_ the gate states offline capture is unavailable.
- **AC-14 Shared-device logout** [FR-16, US-15] — _Given_ member A signed in with cached entries, _when_ A logs out, _then_ relaunch requires sign-in and no A data appears in pickers, entries, timesheet, drafts, or location records; signing in as B shows only B's data; _given_ the device is offline, _then_ logout still wipes local queue, cache, drafts, and location data with no network call and A's queue cannot replay under B.
- **AC-15 Wipe with pending items and MDM remote wipe** [FR-16, FR-19] (MDM clause: M3) — _Given_ 3 pending entries, _when_ the member confirms logout, _then_ they were warned first and can export or cancel, and on confirm no queue, cache, draft, location record, or session cookie remains (≤ 5 s target, verified by absence rather than a stopwatch); _given_ an MDM remote wipe on an offline device, _then_ data is removed when the device next connects and receives the wipe — v1 states this residual risk instead of claiming instant remote erasure.
- **AC-16 Managed deployment and update** [FR-19, FR-20] (M3) — _Given_ a signed APK/AAB in the managed catalog, _when_ IT assigns it, _then_ it installs without Play Services, requests no permission beyond location (only when enabled), and uses the configured production origin; _when_ the web app deploys, _then_ the UI updates on relaunch without an APK release; _when_ a shell update is pushed, _then_ the previous APK can be reinstalled and queue data survives; _given_ Play Services is absent, _then_ geolocation falls back to the WebView implementation (verified in M3).
- **AC-17 Location policy** [FR-17] — _Given_ the workspace toggle is off, _when_ an entry is captured offline, _then_ no permission prompt appears and no coordinates are stored; _when_ on, one location is attached and survives replay; no background location collection occurs.
- **AC-18 iOS surfaces: BYOD PWA and managed Web Clip** [FR-22] (M4) — **(a) BYOD A2HS PWA:** _given_ an installed iOS PWA, _when_ the user captures offline then foregrounds with connectivity, _then_ replay runs on foreground/resume without Background Sync; **(b) managed MDM Web Clip:** _given_ a supervised iPhone with the full-screen, non-removable Web Clip, _when_ opened offline after one online run, _then_ the M0-spike service-worker result is honored (offline shell if the spike passed, documented limitation if not); no push in scope.
- **AC-19 Support triage by correlation id** [FR-23] — _Given_ a queued item that fails, _when_ support searches its mutation id, _then_ the matching Sentry event and (after sync) the server row are found without PII; _given_ any Sentry event payload, _then_ it contains ids, counters, and durations only (bodies and query params stripped by `beforeSend`, `sendDefaultPii: false`), and the triage runbook leads to retry, discard-with-payroll-note, or MDM wipe.
- **AC-20 Accessibility (offline surfaces)** [NFR-6] — _Given_ TalkBack and 200% text zoom, _when_ the pending count changes, _then_ it is announced and all sync actions are reachable and labelled.

---

## 8. Out of Scope

- **Offline analytics, team views, reports/exports** — charts, department analytics, manager team views, CSV/Excel/PDF exports, weekly report emails. Offline read is limited to the member's own entries and timesheet.
- **Manager needs-review / device-queue view** — no manager UI in v1: the server cannot see unsynced or parked items, and late-synced entries are only visible on the online timesheet after they reach the server (US-6, FR-5).
- **Local-first sync engine / local database** — PowerSync, ElectricSQL, Zero, RxDB, WatermelonDB, SQLite mirrors, CRDT; server stays the source of truth.
- **Full offline admin** — creating/editing clients, projects, tasks, tags, departments, members, roles, or workspace settings offline.
- **Timesheet approval workflow** — no approval state exists today (days are `WORK`/`RUNNING`/`NO_TIME`); this feature does not add one.
- **Payroll processing, pay computation, deductions** — Trackly exports payroll-ready data; it does not run payroll.
- **Real-time multi-device sync** — no live CRDT merge beyond the server arbitrating one active timer.
- **Public App Store / Google Play listing**, consumer sign-up, BYOD device management.
- **Native iOS app** in v1 (written gate later); **desktop app** (deferred).
- **Bundled-asset Capacitor shell** — fallback only if the M0 WebView service-worker spike fails (O3/A2, +3–5 dev-weeks).
- **Offline editing/deleting of synced entries**, offline duplicate/resume of synced entries.
- **Push notifications, background geolocation, offline PDF generation, offline timer reminders, background sync (WorkManager).**
- **React Native rewrite or monorepo platform abstraction**, TWA (no offline), offline sign-in/token rotation.

---

## 9. Assumptions

- **A1** Field employees mostly carry company-managed Android devices IT can enroll in Android Enterprise and push a managed build to (stakeholder decision, 2026-11-05).
- **A2** The evidence-backed path (O1 + O2 / engineering A1) holds: no new pages or routes (additive offline UI only), one server change, same-origin cookies/CSRF via `server.url`; WebView service-worker offline boot remains an **unverified assumption** until the M0 spike, and failure switches us to the bundled-asset shell (+3–5 dev-weeks).
- **A3** Members sign in online at least once per grace window, so offline grace is a fallback, not the normal path.
- **A4** Payroll cutoffs allow a queued entry to sync hours later, and HR/payroll can reconcile parked items before cutoff (owner: OQ-10).
- **A5** Only field capture needs offline depth in v1; managers and payroll admins work primarily online.
- **A6** The firm accepts the per-surface data-at-rest posture and stated threat model (NFR-5), subject to Owner/security sign-off.
- **A7** iOS is best-effort BYOD in v1 (PWA/Web Clip), explicitly not payroll-critical, until a native gate passes.
- **A8** Effort figures are estimates (9–16.5 dev-weeks end-to-end) for one senior engineer familiar with the repo, excluding IT/MDM setup, device procurement, PM/design, and pilot calendar time; web deploys update the UI, and shell re-releases are only for native/plugin/policy changes.

## 10. Dependencies

- **Research (final)** — [platform-feasibility.md](research/platform-feasibility.md): topology, auth, distribution, security, and the O1+O2 recommendation with spikes.
- **Engineering (final)** — [implementation-analysis.md](engineering/implementation-analysis.md): architecture map, WP1–WP10, M0–M4, estimates, do-not-build list, risks, decisions D1–D17.
- **One server change** — nullable unique `client_mutation_id` + dedupe in `startTimer`/`createManualEntry` (~60–100 lines, one migration); blocks M1.
- **IT / MDM** — device inventory, Android Enterprise enrollment, managed app catalog, signing/keystore custody, remote-wipe runbook, iOS MDM Web Clip.
- **Owner / security** — data-at-rest decision (OQ-8/D2), offline-boot HTML caching (OQ-7/D1), grace, location consent/retention, telemetry content policy.
- **QA / observability** — Sentry events/alerts, Playwright config (greenfield) with airplane-mode specs, fault-injection harness, one physical managed test device from M0.
- **Existing gates** — `pnpm check-all`, `pnpm build`, `pnpm perf:bundle`, manual device pass.

## 11. Open Questions

| #     | Question                                                                                                               | Owner                 | Deadline                    | Default if undecided                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------- | --------------------------------------------------------- |
| OQ-1  | Android distribution: Managed Google Play private app vs EMM APK/AAB; signing; versionCode; wipe runbook.              | IT + Lead             | 2026-11-19                  | EMM-distributed signed APK/AAB; private app if IT prefers |
| OQ-2  | Device inventory: count, models, OS/WebView floor, storage/RAM, who procures test devices.                             | IT                    | 2026-11-12                  | Android 10+ / 4 GB, one mid-tier test device              |
| OQ-3  | Offline auth grace value and deploy-time config (no Owner UI in v1).                                                   | Owner + Lead          | 2026-11-19                  | 24 h default via deploy-time flag                         |
| OQ-4  | Location consent copy and retention under PH Data Privacy Act; whether location is mandatory when the toggle is on.    | Owner + legal         | 2026-11-26                  | Current online copy; 30-day local retention               |
| OQ-5  | iOS native gate: ABM availability, review-risk plan (guideline 4.2), evidence that a shell beats the Web Clip.         | Lead + IT             | 2026-12-10                  | PWA/Web Clip only in v1; no native iOS                    |
| OQ-6  | Is a lightweight timesheet approval state required before payroll, or is review/export enough?                         | Lead + payroll admin  | 2026-12-10                  | No approval workflow (current model)                      |
| OQ-7  | Offline boot HTML: cache tracker shell doc (may contain SSR user data) vs neutral shell + IndexedDB hydration (safer). | Lead + Owner/security | End of M1 (est. 2026-12-10) | Neutral shell + hydration if security review objects      |
| OQ-8  | Data-at-rest approach: WebCrypto key in IndexedDB (recommended) vs Keystore-backed plugin in v1 vs OS sandbox only.    | Owner/security + eng  | M1 start (2026-11-19)       | WebCrypto non-extractable key; Keystore only if required  |
| OQ-9  | Metrics wording for mobile: sync is resume-based, not "connectivity returning" while backgrounded (D11).               | PM + Lead             | 2026-11-26                  | Resume-based NFR-3 as written                             |
| OQ-10 | Escalation path when parked items cannot be resolved on the member's device before cutoff (no server view).            | HR/payroll + Owner    | End of M1 (est. 2026-12-10) | Member resolves on device; escalation via support         |
| OQ-11 | Offline scope depth after v1: stay core write+read, or expand to manager/team reads (would justify a sync engine).     | Lead                  | M4 (est. 2027-02-01)        | Stay core write+read; no sync engine                      |

## 12. Strategy Decision

**Decided (2026-11-05): O1 + O2 — harden the PWA offline layer, then ship an Android Capacitor shell in remote-origin mode; iOS as installable PWA / MDM Web Clip; native iOS behind a written gate; desktop deferred.** Stakeholder-decided and evidence-backed; not a silent choice and not a native rewrite.

- **What ships:** the existing React app unchanged — **no new pages or routes**; offline additions are additive UI only (sync pill, needs-review drawer, offline banner/gate) — 42 pages, ~54k LOC, 136 server functions, ~8–12 new/changed offline files (~1,000–1,700 lines est.), and a thin `mobile/` Capacitor project. The **only** server change is nullable unique `client_mutation_id` + dedupe (~60–100 lines, one migration).
- **Documented deviation:** Capacitor documents `server.url` as live-reload-oriented and not intended for production; this internal MDM shell deliberately uses it. M0 records the rationale, pins the shell version, and defines the switch-to-O3 criteria.
- **Why:** `server.url` keeps the WebView origin equal to production, so Better Auth cookies, `assertTrustedOrigin` CSRF, and all server functions behave as in Chrome — no CORS, no second auth contract, no new write API. UI reuse is ~100% and the shell is reversible. React Native (22–40 dev-weeks est.) and a monorepo (8–14 dev-weeks) were rejected on cost.
- **Estimate:** **9–16.5 dev-weeks end-to-end (est.)** (M0 0.5–1, M1 3–6, M2 2–4.5, M3 2–3.5, M4 1–1.5), one senior engineer familiar with the repo; excludes IT/MDM setup, device procurement, PM/design, and pilot calendar time. Research's 9–13 dev-week figure is the compatible slice total — **not** a second project to add.
- **Fallback:** if the M0 WebView service-worker spike (≤ 1 day) fails, switch to the bundled-asset shell (O3/A2) and budget +3–5 dev-weeks for cross-origin CSRF/CORS and an authenticated write path; the offline app-code layer is unchanged, so nothing is wasted.
- **What would reopen it:** WebView SW cannot serve the shell offline → fallback O3; cookie sessions unusable in the WebView even under `server.url` → narrow token handshake (+1–2 weeks), not a second write API; offline reads must reach team/analytics views (non-goal) → sync engine justified; real multi-device conflicts beyond one-active-timer → revisit with a payroll-acceptable policy; a public store listing becomes required → add native value first (Play spam policy; Apple 4.2/4.2.2 risk); replay duplication appears in fault injection → stop and fix idempotency.
- **Evidence:** [research §§3, 5, 8–10](research/platform-feasibility.md) · [engineering §§4, 5, 12–13](engineering/implementation-analysis.md). **M0 spikes** are listed in §13.

## 13. Delivery Phases

Names, ordering, and ranges mirror the engineering report verbatim. **Total: 9–16.5 dev-weeks (est.)**, one senior engineer, excluding IT/MDM and device procurement.

- **M0 — Decisions, baseline, instrumentation (0.5–1 wk est.).** Decision log for OQ-7/OQ-8/OQ-9/OQ-10 and D1–D17; baseline instrumentation for offline enqueue/replay/fail/park/duplicate-prevented/offline-boot plus queue depth and oldest age in Sentry (no PII); device inventory, MDM mechanism, one physical test device; **four time-boxed spikes (≤ 1 day each)** — WebView SW offline shell; offline session bootstrap; IndexedDB restore/eviction; MDM Web Clip. Capacitor cookies/`SameSite=None` and keystore/wipe checks are verified in M3. Gate: no decision blocks M1; spike results and baselines recorded, fallback chosen if needed.
- **M1 — Durable offline core (3–6 wk est.).** IndexedDB queue + migration + in-flight marker; idempotency column and dedupe; dead-letter/`needs-review`; `OfflineSyncCoordinator` in the root shell + sync pill; encryption at rest; replay policy/backoff/probe; unit/integration tests. Gate: AC-1 to AC-8 green and the existing 103 Vitest files still green.
- **M2 — Offline read, boot, auth grace (PWA) (2–4.5 wk est.).** Query-cache allowlist; cached-loader fallback for `app/time-tracker`, `app/timesheet`, `app.tsx`; own entries/timesheet read; catalog cache/staleness; SW shell caching + update prompt; auth grace and re-auth; logout/wipe; accessibility; Playwright airplane-mode specs. Gate: AC-10 to AC-15, AC-17, and AC-20 green; PWA offline boot proven before the shell is built.
- **M3 — Android shell + MDM (2–3.5 wk est.).** `mobile/` Capacitor project with `server.url` and environment config; geolocation + app plugins; permission policy; signed APK/AAB in CI; MDM package, install/update/rollback; device QA; Capacitor cookie/`SameSite=None` and keystore/wipe checks; Keystore escalation only if OQ-8 requires it. Gate: AC-16 green, plus the AC-15 MDM clause and on-device AC-1/AC-6/AC-13; cold-start p95 measured.
- **M4 — Hardening, rollout, measurement (1–1.5 wk est.).** Fault-injection matrix as release gate; app-wide CSP hardening (`script-src`/`connect-src` around TanStack inline scripts, MapLibre's worker, Sentry, ImageKit); alerts/dashboards; flags and rollback; staged rollout; security/DPA and accessibility sign-off; runbook; iOS validation and native-iOS gate. Gate: AC-18, AC-19, and NFR-1/NFR-2 green; one full pay period with 0 lost/duplicate entries and ≥ 99% synced within 5 min of resume.

Dependency order: M0 → M1 → M2 → M3 → M4; M3 device validation waits for M2's offline boot. Do not parallelize edits to `offline-queue.ts` or the root Query provider.

## 14. Rollout & Measurement

**Rings:** internal dogfood (1–2 engineers on managed test devices, airplane-mode daily) → field pilot (3–5 users, one full pay period, PWA and managed APK in parallel) → workspace-wide managed Android for field staff + PWA for BYOD → iOS PWA/Web Clip → native-iOS gate decision.

**Feature flags:** `OFFLINE_CACHE_ENABLED`, `OFFLINE_QUEUE_V2_ENABLED`, `OFFLINE_GRACE_HOURS`, `ANDROID_SHELL_ENABLED` (plus optional workspace allowlists). Flags can disable cache persistence, durable queue v2, replay-on-resume, and sync UI without a redeploy; the idempotency column is **not** gated. Rollback: flag off (web), previous APK via MDM, `CACHE_VERSION` bump.

**Measurement (baselines are placeholders until M0):**

| Metric                                        | Baseline                        | Target (label)                            |
| --------------------------------------------- | ------------------------------- | ----------------------------------------- |
| Field users capturing ≥ 1 entry offline/week  | Unknown — instrument first (M0) | ≥ 50% of field users                      |
| Queued items synced (resume-based)            | Unknown — instrument first (M0) | ≥ 99%; p95 ≤ 60 s                         |
| Duplicate entries prevented / observed        | Unknown — instrument first (M0) | 0 user-visible duplicates                 |
| Lost queued items                             | Unknown — instrument first (M0) | 0                                         |
| `needs-review` items resolved before cutoff   | Unknown — instrument first (M0) | 100% triaged                              |
| Offline boot success and p95 time             | Unknown — instrument first (M0) | ≥ 99.5% success; p95 ≤ 3 s to interactive |
| Cold start to first saved entry               | Unknown — instrument first (M0) | p95 ≤ 30 s and ≤ 4 taps                   |
| Crash-free sessions (shell and PWA)           | Unknown — instrument first (M0) | ≥ 99.5% (target)                          |
| "Lost/duplicate hours" tickets per pay period | Unknown — instrument first (M0) | 0                                         |
| PWA/APK adoption among field staff            | Unknown — instrument first (M0) | ≥ 80% within two pay periods (target)     |

**Release gates:** 0 lost/duplicate in the deterministic 11-fault CI matrix and nightly randomized runs; wipe verified by absence; data-at-rest sign-off; accessibility pass; manual airplane-mode pass on the managed device model; M0–M4 acceptance per the engineering report.

## 15. Support & Operations

- **Correlation id:** each queue item's mutation id is the support handle — shown in the `needs-review` drawer, in Sentry `offline.*` events, and after sync on the server row via `client_mutation_id`, so a ticket maps to a device item and a database row without PII.
- **Triage a stuck queue:** check the sync pill (pending, oldest age) → open `needs-review` for parked items and server messages → search Sentry by mutation id and release tag → fix a stale catalog and Retry, or for payroll-critical items Discard with a payroll note and re-enter online; parked items exist only on the device, so triage requires device access; never clear storage without checking for pending items.
- **Alerts:** any `duplicate_prevented`; replay failure > 1%/h; boot failure > 0.5%; queue depth > 50 for > 1 h; oldest pending > one pay period; wipe failure. Dashboards: queue depth/oldest age, replay outcomes, boot success, sync p95.
- **Lost device / rollback:** use the MDM remote-wipe/uninstall runbook; an offline lost device keeps local data until it reconnects and receives the wipe, and an OS app-data clear is unrecoverable for unsynced items — reconcile from server rows and re-capture. The app also wipes on logout and after session revocation. Rollback by flipping the offline flag off, reinstalling the previous signed APK, or bumping `CACHE_VERSION`; the idempotency column stays deployed.
- **Known gaps deferred to M4:** app-wide CSP hardening (NFR-5) and manager views (§8); neither is claimed for v1.
- **References:** [engineering §9–10 (tests, observability, runbook)](engineering/implementation-analysis.md) · [backup, monitoring and recovery](../../../../backup-monitoring-recovery.md) (§4 monitoring, §5 recovery).

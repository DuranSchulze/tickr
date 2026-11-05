# Epic — Cross-platform Trackly with a genuine offline mode

**Epic ID:** `cross-platform` · **Status:** Final for planning (v1) · **Date:** 2026-11-05
**Product:** Trackly (internal time tracking + payroll reporting, Duran File Pino)
**Owner:** Product (PM) · **Stakeholder proxy:** Lead · **Engineering:** Lazy Developer · **Research:** Researcher

Platform expansion — web today, managed Android app next, installable iOS PWA / MDM Web Clip, desktop later — with **genuine local-first offline mode** as the load-bearing capability. Web remains the single source of truth; new surfaces reuse it rather than fork it.

---

## 1. Context

Trackly is an internal, payroll-critical time tracker for a professional-services firm. Employees log hours against clients, projects, tasks, tags, and departments; managers review timesheets, analytics, and exports; payroll and billing run off that data. It is web-only today (TanStack Start SSR, Better Auth, Drizzle + Neon Postgres), with Owner/Admin/Manager/Employee roles and per-workspace location capture.

Offline support exists but is **partial, not genuine**. Engineering verified the current state: timer and manual-entry mutations queue in `localStorage` (`src/lib/time-tracker/offline-queue.ts`); replay lives inside `TimeTrackerDashboard` and runs only while that page is mounted; any non-network rejection **deletes the queued item** behind a toast; there is **no idempotency key**, so a lost replay response can duplicate an entry; the service worker caches only hashed assets and `/offline.html`, never the app shell; the Query cache is memory-only (no persister); and offline cold start fails because `/app`'s `beforeLoad` awaits `getSessionFn()` and its loader catch redirects to `/onboarding` (`src/routes/app.tsx`). Field and on-site staff work in basements and client sites with intermittent signal, and their hours must land before payroll cutoffs.

## 2. Problem

1. **Hours are lost at the worst time.** A network-dependent first paint plus an evictable `localStorage` queue means a disconnected employee can be locked out, or lose a queued entry to a storage clear, an interrupted replay, or a server rejection that auto-deletes it — surfacing later as payroll disputes.
2. **Duplicates and silent failures erode trust.** Replay has no idempotency key, so a lost response can create the same entry twice; rejected items disappear into a toast. Payroll reconciles hours by hand.
3. **Mobile and device data are unmanaged.** The dashboard is desktop-first with no installable offline shell or managed distribution path; payroll data, notes, and location data sit in browser storage with no encryption, no logout/remote-wipe guarantee, and no story for shared or lost devices.

## 3. Business value

- **Payroll accuracy** — complete, duplicate-free hours at every cutoff, without manual reconciliation.
- **Revenue capture** — billable time logged on site instead of remembered or forgotten.
- **Operational control** — MDM enrollment, policy, and remote wipe; no public store listing or review dependency, and one codebase for a small team.

## 4. Pillars

| Pillar                      | Meaning                                                                                        | Guardrail                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Offline durability**      | Capture works with no signal; nothing lost or silently dropped; replay is idempotent, ordered. | Zero lost/duplicated entries in fault injection, release gate |
| **Cross-platform delivery** | Web, managed Android app, iOS PWA/Web Clip, native iOS behind a gate, desktop later.           | No platform-specific UI forks without an approved change      |
| **Low-cost reuse**          | Capacitor-wrapped web build; existing server functions/auth/Neon/Sentry/Playwright.            | Strategy switches need evidence and a written decision        |
| **Security & privacy**      | Payroll, note, and location data protected at rest to the level each surface can guarantee.    | Encryption/wipes verified per surface, not asserted globally  |

## 5. Outcomes & metrics

All targets are **targets to validate**, not current performance. Baselines marked "unknown" are instrumented in M0–M1; no number is quoted as fact.

| Outcome              | Metric                                                      | Baseline             | Target (label)                       |
| -------------------- | ----------------------------------------------------------- | -------------------- | ------------------------------------ |
| No lost hours        | Field users capturing ≥ 1 entry offline per week            | Unknown — instrument | ≥ 50% of field users; 0 entries lost |
| Safe replay          | Queued mutations reaching the server exactly once           | Unknown — instrument | 100%; 0 replay duplicates            |
| Reliable sync        | Queued items synced within 5 min of the next app resume     | Unknown — instrument | ≥ 99%; p95 ≤ 60 s                    |
| Payroll completeness | Field entries present before payroll cutoff                 | Unknown — instrument | 100% of captured entries             |
| Adoption             | Field users with the app installed and used weekly          | Unknown — instrument | ≥ 80% within two pay periods         |
| Friction             | Cold start to first saved entry on mid-tier managed Android | Unknown — instrument | p95 ≤ 30 s and ≤ 4 taps              |
| Support load         | "Lost/duplicate hours" tickets per pay period               | Unknown — instrument | 0                                    |
| Sync honesty         | Parked (`needs-review`) items resolved before cutoff        | Unknown — instrument | 100% of parked items triaged         |

## 6. Constraints

- **Internal firm, payroll-critical data.** Entries feed payroll and billing; correctness and auditability are non-negotiable.
- **PH context.** Payroll cutoffs and government IDs (SSS, PhilHealth, TIN, Pag-IBIG) are already stored; location data needs consent and RA 10173 (Data Privacy Act) handling.
- **Small team, no mobile team.** Solutions must be maintainable by the existing web team; reuse beats rewrite. Estimates assume one senior engineer familiar with the repo.
- **Managed devices via MDM.** Android Enterprise first, Apple Business Manager for iOS when a native shell is ever approved; PWA as BYOD fallback; public store listings are not part of v1.
- **Existing stack.** TanStack Start SSR, Better Auth cookie sessions, Drizzle + Neon, Sentry, Playwright. One server change (idempotency column) — no new API, no second auth system.

## 7. Non-goals

- Public App Store / Google Play listing in v1.
- Desktop application in this release.
- A local-first sync engine or local database (PowerSync, ElectricSQL, Zero, RxDB, WatermelonDB, CRDT).
- Real-time multi-device sync (CRDT/live collaboration).
- Payroll processing, pay computation, or timesheet approval workflow.
- Offline analytics, team-wide offline views, or offline reports/exports.
- Full offline admin (catalog/member/settings management without network).
- Native UI rewrite (React Native/Expo) or platform-abstraction monorepo.
- Bundled-asset Capacitor shell in v1 (explicit fallback only, if the WebView service-worker spike fails).
- Push notifications, background geolocation, or offline PDF generation.

## 8. Dependencies

- **Research (final):** [offline-first-mobile-app/research/platform-feasibility.md](offline-first-mobile-app/research/platform-feasibility.md)
- **Engineering (final):** [offline-first-mobile-app/engineering/implementation-analysis.md](offline-first-mobile-app/engineering/implementation-analysis.md)
- **Stakeholder decisions:** distribution path, v1 offline depth, platform priority (landed 2026-11-05; see PRD §12).
- **IT / deployment owner:** device inventory, Android Enterprise enrollment and app distribution (APK/AAB or Managed Google Play private app), app-signing custody, remote-wipe runbook, iOS MDM Web Clip.
- **Owner / security:** data-at-rest approach and threat-model sign-off, offline grace, location consent, retention.
- **Platform:** Better Auth session policy, Neon restore, Sentry events/alerts, CI gates (`pnpm check-all`, `pnpm perf:bundle`), Playwright config (greenfield).

## 9. Strategy (decided)

**O1 + O2 (engineering Strategy A1): harden the PWA offline layer, then ship an Android Capacitor shell that loads the production web app (`server.url`, remote origin), distributed via Android Enterprise/MDM; iOS as MDM Web Clip / installable PWA with a written native-iOS gate; desktop deferred.**

- **Reuse:** no new pages or routes — 42 pages / ~54k LOC ship as-is, with additive offline UI only (sync pill, needs-review drawer, offline banner/gate); 136 server functions and Better Auth cookie sessions stay same-origin.
- **Only server change:** nullable unique `client_mutation_id` on `time_entries` + dedupe in `startTimer`/`createManualEntry` (~60–100 lines, one migration).
- **End-to-end estimate: 9–16.5 dev-weeks (est.)** for M0–M4, one senior engineer familiar with the repo; excludes IT/MDM setup, device procurement, PM/design time, and pilot calendar time. Research's 9–13 dev-week slice total is compatible and **is not a second total to add**; never present O1 + O2 as independent projects.
- **Documented deviation:** Capacitor documents `server.url` as live-reload-oriented, not production-oriented; the internal MDM shell deliberately uses it, and M0 records the rationale, pinned shell version, and fail criteria (O3/A2 is the fallback, +3–5 dev-weeks for cross-origin auth/CSRF and a new write path; the offline app-code layer is unchanged). iOS's written gate also assumes App Review risk, since guideline 4.2 applies to ABM custom apps.
- **Fallback:** if the M0 WebView service-worker spike (≤ 1 day) fails, switch to the bundled-asset shell.
- Details, evidence and switch triggers: [PRD §12](offline-first-mobile-app/prd.md#12-strategy-decision).

## 10. Feature docs

- **PRD v3 (final):** [offline-first-mobile-app/prd.md](offline-first-mobile-app/prd.md)
- **Research:** [offline-first-mobile-app/research/platform-feasibility.md](offline-first-mobile-app/research/platform-feasibility.md)
- **Engineering analysis:** [offline-first-mobile-app/engineering/implementation-analysis.md](offline-first-mobile-app/engineering/implementation-analysis.md)
- **Adversarial review (applied in PRD v3):** [offline-first-mobile-app/engineering/prd-review.md](offline-first-mobile-app/engineering/prd-review.md)

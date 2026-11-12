# PRD v2 adversarial review — lazy-developer pass

**Reviewed:** `prd.md` v2 final, `epic.md`, `research/platform-feasibility.md` (2026-11-05). **Method:** mechanical FR/US/AC trace extraction + repo verification (`app.tsx`, `AppShell.tsx`, `timer.server.ts`, `csrf.server.ts`, `api/health.ts`, `sentry.*.config.ts`, `sw.js`). **Verdict:** strategy, topology, milestones and the 9–16.5 dev-week total match engineering/research; fix the 3 blockers, none needs new architecture.

## 1. Traceability (measured)

- Confirmed **23 FRs / 21 stories / 20 ACs**, **no dangling** references. **Orphans:** US-7 (Owner config) and US-18 (few taps) have no FR despite §7's "AC gaps closed (US-6, US-15, US-18)"; **NFR-7 has no AC** (degraded mode untestable).
- **Fix:** add `(US-18 → AC-13)` to NFR-4 and AC-13; **delete US-7 from v1** (grace stays env/flag per OQ-3) or add `FR-24 (US-7 → AC-12)` at +0.5 wk; extend AC-4: "given IndexedDB is unavailable, then an explicit degraded-mode message appears and offline capture is blocked (no lossy fallback)."

## 2. Blockers

**B-1 — Manager `needs-review` visibility cannot exist as written.** US-6 (63), FR-21 (117), AC-9 (147) claim managers see parked items after they "reach the server". Parked items never reach the server. A manager list + workspace count is also new UI + a server read query, contradicting Epic §9 "0 new UI code" and PRD §10 "only server change", and it is missing from M2's work list.
**Fix (keeps 0 new UI):** delete FR-21 and AC-9; replace US-6 with: "**US-6** As P3, I want to know which entries synced late (visible after sync on the online timesheet), so that I can judge a timesheet before payroll. _(The server cannot see unsynced or parked items; no manager needs-review view in v1.)_" Late sync stays an internal `client_mutation_id` + timestamp flag. If a count is mandatory: M4, **+0.5–1 wk** (total 9.5–17.5).

**B-2 — `OfflineSyncCoordinator` in `AppShell` is unreachable exactly when needed.** FR-6 (96) and §3 (34) host it in `AppShell`, which renders only after the `/app` loader succeeds (`app.tsx:92,95–101`); that loader's catch redirects to `/onboarding`. Offline bootstrap failure, expired grace, corrupt snapshot, or auth failure all prevent `AppShell` mounting — replay and pending-count UI vanish.
**Fix:** "mounted in the **root route shell** (`src/routes/__root.tsx`, client-only, like `ServiceWorkerRegistrar`), not `AppShell`; survives `/app` bootstrap failure, gates replay on an authenticated probe, and shows pending count on the blocked/sign-in gate; reuses `TaskSyncCoordinator`'s trigger pattern." Engineering analysis already corrected.

**B-3 — Estimate drift vs 9–16.5.** Three unestimated additions: (a) **CSP hardening** in NFR-5(b)/"part of M2" (127) — app-wide and hard with TanStack inline scripts, MapLibre's unpkg worker, Sentry and ImageKit; absent from engineering's M2; (b) **manager visibility** (B-1); (c) **"six spikes" in M0** (232) while M0 is 0.5–1 wk, research says "≤2 days each", and line 224 calls it "the 2-week spike" — research's "two-week gate" was a decision deadline (truth: ~0.5–1 day each).
**Fix:** (a) drop "CSP is part of M2"; list CSP as a known app-wide gap deferred to M4/§15 (or budget +0.5–1 wk → 9.5–17.5); (b) apply B-1; (c) replace "six spikes" with "**four time-boxed spikes (≤1 day each)** — WebView SW offline boot; offline session bootstrap; IndexedDB restore/eviction; MDM Web Clip full-screen/non-removable. Cookie/`SameSite=None` and keystore/wipe checks move to M3." Replace "2-week spike" with "the M0 spike (≤1 day; research's 'two-week gate' is a decision deadline)". Total stays **9–16.5 dev-weeks (est.)**.

## 3. Majors

- **M-1 Auth probe is unauthenticated (FR-9, 99).** `api/health.ts` says "The endpoint is unauthenticated". Fix: "an **unauthenticated** connectivity probe (`GET /api/health`) confirms the network, then an **authenticated session check** confirms auth before payroll-critical replay."
- **M-2 Clock claim contradicts server (FR-4, 94; AC-5, 143).** `startTimer` replaces a future `startedAt` with server-now (`timer.server.ts:104–114`) — a 2h-fast device does **not** keep client time. Fix: record the last-known server↔device offset at capture, normalize captured timestamps by it on replay, keep the normalized time, flag >5 min; server clamps stay as safety; AC-5 asserts normalized time + flag.
- **M-3 `server.url` production caveat unstated.** Capacitor documents `server.url` as live-reload-oriented ([cap #5075](https://github.com/ionic-team/capacitor/discussions/5075)); research §3.2 flags it. Fix: §12 "**Documented deviation:** internal MDM shell uses `server.url`; M0 records rationale, pinned shell version and fail criteria."
- **M-4 IndexedDB eviction unaddressed.** NFR-8 covers quota but not app-data clear/uninstall/OS clearing; `storage.persist()` is unused and WebView semantics unverified. Fix: NFR-8 "app-data clear/uninstall is unrecoverable loss for unsynced items; warn on next launch and reconcile from server rows; M0 spike covers restore/eviction"; add to AC-4.
- **M-5 Sentry PII control unverified.** Neither config sets `sendDefaultPii` or a `beforeSend` scrubber, so FR-23's no-PII claim rests on defaults (probably safe, but server error messages/URLs are not controlled). Fix: NFR-5(c) "`sendDefaultPii: false` + `beforeSend` strips bodies/query params; events carry ids/counters/durations only"; assert in AC-19.
- **M-6 Phase/AC ownership mismatches.** M1 gate claims AC-3's "shell update"; M2 claims AC-13's shell and AC-15's "MDM remote wipe"; AC-9 has no M2 work item. Fix: mark shell/iOS clauses "(M3)/(M4)" or split; M1 → AC-1…8, M2 → AC-10…15, AC-17, AC-20, M3 → AC-16 + AC-15 MDM clause.
- **M-7 Missing ACs.** No AC for offline logout (local wipe ≤5 s, no replay under another identity), duplicate optimistic rows after replay id-mapping (restart shows one row per entry), app killed mid-replay with in-flight marker, NFR-3 latency in a member-facing AC. Fix: one Given each in AC-15, AC-7, AC-3, AC-7.
- **M-8 iOS managed surface has no AC (FR-22, 118; AC-18, 156).** AC-18 only covers a BYOD A2HS PWA; the managed MDM Web Clip (full-screen bookmark, not an installed PWA; offline SW unverified — spike 6) is untested, and FR-22's push note conflicts with §8's push non-goal. Fix: split AC-18: (a) BYOD A2HS PWA; (b) managed Web Clip — full-screen, non-removable, offline SW result recorded from M0 spike 6, no push in scope; "replay-on-foreground is the guarantee".
- **M-9 FR-18 presumes an open OQ-7 variant (114 vs 108/211).** Fix: "the SW caches the OQ-7-selected shell (cached SSR HTML **or** neutral shell + IndexedDB hydration); either must satisfy offline boot, update prompts, auth." FR-15's "both variants satisfy" controls.
- **M-10 AC-8 ambiguity.** "Parked showing both entries" needs a refetch after rejection. Fix: "parked with the server message; after a refetch the conflicting running entry is shown alongside the queued payload, else payload + conflict reason; no second running timer."

## 4. Over-engineering triage

- **NFR-1 500 randomized iterations → reduce.** Deterministic 11-fault matrix + ~100 randomized nightly runs proves 0 lost / 0 duplicated; 500 full E2E runs is CI cost and flake.
- **NFR-5(b) PWA WebCrypto key → move to M4/drop.** XSS defeats it, key loss can **cause** lost payroll data; shell OS FBE + wipe covers v1.
- **FR-16 wipe ≤5 s → keep as target, not gate.** Timed device assertion is flaky; gate on "no queue/cache/cookie remains", record time as diagnostic.
- **NFR-6 blanket WCAG 2.2 AA → scope** to offline-surface checks (aria-live, labels, 44 px, 200% zoom).
- **FR-12 14-day read / FR-11 7-day staleness → keep** (allowlist cost, not days; tracker already fetches 62 days).
- **FR-13 Owner-adjustable grace → keep 24 h default, drop v1 UI** (env flag only, OQ-3).
- **CSP / manager views / six spikes → cut** (B-1, B-3).

## 5. Verified consistent (no action)

Remote `server.url` only (no bundled assets, no new write API, no sync engine); one nullable unique `client_mutation_id` + dedupe before the active-timer pre-check; replayed stop is a safe no-op; `assertTrustedOrigin` exists; research 9–13 and engineering 9–16.5 are one total (PRD §12, Epic §9, research §8); M0–M4 names/ranges verbatim; 103 Vitest files, Playwright greenfield and `frame-ancestors`-only CSP claims accurate.

## 6. Cross-doc changes (engineering scope)

`implementation-analysis.md`: research status → final; M0 spikes time-boxed; replay coordinator corrected to **root shell** (`__root.tsx`), not `AppShell`, citing `app.tsx:95–101` — B-2 follows.

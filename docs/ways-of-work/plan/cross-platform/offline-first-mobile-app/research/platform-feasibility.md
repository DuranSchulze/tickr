# Research — Platform & offline feasibility for cross-platform Trackly

**Task:** `task-1` · **Status:** v1 · **Date:** 2026-11-05 · **Owner:** Researcher
**Scope:** evidence for the [Epic](../../epic.md) and [PRD](../prd.md). Docs only — no code changed.

**Legend:** **[repo]** verified in this repository today (path given); **[ext]** external source, URL inline, all accessed **2026-11-05**; **[assumption]** to test in a spike.

**Fixed constraints:** MDM-managed devices (Apple Business Manager / Android Enterprise), PWA as BYOD fallback, no public listing in v1; offline depth v1 = core write + read (timer, manual entries, catalogs, own recent entries/timesheet); Android-first Capacitor wrapper on the existing web app, iOS as an installable PWA first.

---

## 1. Answer in five lines

1. **TanStack Start is a full-stack _web_ SSR framework** — "full-document SSR, streaming, server functions, client/server builds" ([ext](https://tanstack.com/start/latest/docs/framework/react/overview)). It is **not** a native UI framework; it emits HTML/DOM for a browser or WebView.
2. **The reusable asset is the React app, not the server runtime.** ~67 route files [repo] reuse in a WebView shell, PWA or Tauri; the `createServerFn` layer (12 files [repo]) always needs a reachable origin — there is no offline server.
3. **Packaging is the cheap half; offline is app code.** Cold start is blocked by `src/routes/app.tsx` [repo]: `beforeLoad` awaits `getSessionFn()`, then the loader awaits three more server calls. A persisted session + catalog cache fixes it; no wrapper does.
4. **Recommended v1: hardened PWA + Android Capacitor shell**, iOS as MDM full-screen Web Clip, desktop deferred, **no sync engine yet**.
5. **Two hard risks:** cross-origin auth/CSRF if the shell is bundled, and iOS WebKit's missing Background Sync. Both are week-1 spikes (§10).

---

## 2. What TanStack Start is — and is not

The repo matches the framework's own description ([ext](https://tanstack.com/start/latest/docs/framework/react/overview)): `tanstackStart()` + `nitro({ preset: VERCEL ? 'vercel' : 'node-server' })` in `vite.config.ts`, entry `src/server.ts` exporting `{ fetch }`, Vite 8 + Nitro 3 beta + React 19.2 [repo].

- **PWA:** ~100% reuse — same deployment.
- **Capacitor shell:** ~100% UI + client logic; plugins add geolocation, secure storage, deep links — "a cross-platform native runtime for web apps" ([ext](https://capacitorjs.com/)). Not reusable: SSR HTML at build; the server is still needed at runtime.
- **React Native / Expo:** ~0% components — only `src/lib/time-tracker/*.ts` helpers; ~75 `window`/`document` files, Tailwind/shadcn UI and router are lost [repo].
- **Electron / Tauri:** same profile as Capacitor.

A "native app" here means **WebView shell + native capabilities** — the only option consistent with the Epic's "no platform-specific UI forks" guardrail.

---

## 3. The server-origin constraint (packaging crux)

1. **Server functions are same-origin RPC.** "Requests… should come from the same origin, verified with Fetch Metadata (`Sec-Fetch-Site`), `Origin`, or `Referer`… Requests without any of these headers are rejected by default" ([ext](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)); the repo adds `assertTrustedOrigin()` (`src/lib/server/csrf.server.ts`, used by `workspace-access`, `workspace-invites`, `subscriptions`) over env-driven origins [repo].
2. **Capacitor's remote-URL mode is dev-only:** `server.url` is "intended for use with live-reload servers… **not intended for use in production**"; schemes default to iOS `capacitor` (`capacitor://localhost`) and Android `https` (`https://localhost`) ([ext](https://capacitorjs.com/docs/config)).
3. **A bundled shell differs in origin from Vercel**, so server-function calls are cross-origin and cookies become third-party unless `SameSite=None; Secure` — already set in production for the extension case (`src/lib/auth.ts`) [repo].

**Topology A — remote URL + SW-cached shell.** Capacitor loads `https://<prod>`: auth, CSRF, server functions and the deployment stay untouched; offline cold start relies on the SW serving the shell from Cache Storage. Low cost, but depends on WebView SW (Android WebView supports SW on `https` **[assumption — spike]**; the reported Capacitor failure is the _custom-scheme local_ origin — community evidence only: [Ionic forum](https://forum.ionicframework.com/t/service-worker-does-not-work-in-capacitor-ios-webview/249830)). `public/sw.js` caches neither navigations nor API [repo], so it needs rewriting either way.

**Topology B — bundled SPA shell + cross-origin API.** SPA mode prerenders only the root shell to `/_shell.html` ([ext](https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode)); the shell is in the APK and offline instantly, but every `/_serverFn/*` call crosses origins — needs CORS, credentials and CSRF allow-listing (`createCsrfMiddleware({ origin })` exists [ext]). Medium cost, security-sensitive production change.

**Constant:** `/api/v1` is **read-only**, API-key/`Bearer` authenticated ("Read-only workspace integration API…" in `openapi.server.ts`; 14 route files [repo]) — it cannot carry timer/manual-entry writes; a mobile write path needs server functions or new routes.

---

## 4. Offline-first building blocks

- **Workbox / SW** — precached shell + `CacheFirst`/`NetworkFirst`/`StaleWhileRevalidate` ([ext](https://developer.chrome.com/docs/workbox/caching-strategies-overview)), MIT. Repo SW caches offline.html + `/_build/` only [repo] → **rewrite it**; never cache auth (`/api/auth/*` already `no-store`).
- **IndexedDB / Dexie** — "makes it super simple to use indexedDB" ([ext](https://dexie.org/docs/Dexie/Dexie)), Apache-2.0. Repo has **0** IndexedDB; persistence is `localStorage` in 9 files [repo] → **required**.
- **Query persistence** — `persistQueryClient`, with `gcTime` above `maxAge` ([ext](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient)). Repo has `offlineFirst`, `gcTime: 10 min`, **no persister** [repo] → **cheapest read cache**.
- **Background Sync** — `SyncManager`: Chrome/Android 49+, **Firefox/Safari/Safari iOS `false`** ([ext](https://developer.mozilla.org/en-US/docs/Web/API/SyncManager)) → **Android nicety only**; replay must also run in-app.
- **Sync engines** — **not v1**: a second source of truth beside payroll writes. **PowerSync** device SQLite, replicates from backend DB incl. Postgres ([ext](https://docs.powersync.com/intro/powersync-overview)), Apache-2.0, free / Pro $49 / Team $599 per mo ([ext](https://www.powersync.com/pricing)). **ElectricSQL** "read-path sync engine for Postgres", writes stay in your API ([ext](https://electric-sql.com/docs/intro)), Apache-2.0, $1/1M writes + $0.10/GB-mo, Pro $249/mo ([ext](https://electric-sql.com/pricing)). **Zero** `zero-cache` keeps a "read-only replica of your Postgres database" ([ext](https://zero.rocicorp.dev/), [self-host](https://zero.rocicorp.dev/docs/self-host)), Apache-2.0, self-hosted. **RxDB** Apache-2.0 + paid premium ([ext](https://rxdb.info/)). **WatermelonDB** "Offline-first. Sync with your own backend", SQLite 0.27.1 ([ext](https://watermelondb.dev/docs)), MIT. Every Postgres-native engine needs logical replication, and Neon requires it to be **explicitly enabled per project and it cannot be reverted** ([ext](https://neon.com/docs/guides/logical-replication-guide), updated 2026-10-21) — irreversible, so defer.

---

## 5. Auth inside a native shell

**[repo] today:** Better Auth + Drizzle (pg), email/password, 30-day sessions (`updateAge` 1 day), 15-min reset tokens, `tanstackStartCookies`, env-driven origins (`BETTER_AUTH_URL`, `ADDITIONAL_TRUSTED_ORIGINS`, `CHROME_EXTENSION_ORIGIN`, Vercel envs), production cookies `SameSite=None; Secure` for the cross-site extension iframe (`auth.ts`, `trusted-origins.server.ts`).

- **Topology A:** the WebView origin _is_ the app origin — cookies, `trustedOrigins`, CSRF unchanged. Decisive advantage.
- **Topology B:** `capacitor://localhost` / `https://localhost` is another site — cookies rely on `SameSite=None; Secure` (set [repo]), the origin must join `getTrustedOrigins()`/`assertTrustedOrigin()`, and Android WebView third-party cookie behaviour needs verification **[assumption — spike]**.
- **Tokens / reset:** Better Auth's `bearer()` returns a token via `set-auth-token` "for APIs that don't support cookies" ([ext](https://www.better-auth.com/docs/plugins/bearer)); its example uses `localStorage` — unacceptable for payroll, use Keychain/Keystore. `/api/v1` keys are read-only: an integration surface, not a session. Reset flows are web routes (`src/routes/auth/{forgot,reset}-password.tsx` [repo]); emailed links open the browser and need Universal Links / App Links to return to the shell **[assumption]**.

---

## 6. Distribution realities

**Android (primary, managed).** Private app via Managed Google Play: "Private apps are automatically approved for distribution via all EMM bindings… you can use your Enterprise Mobility Management console to remotely install them" ([ext](https://support.google.com/googleplay/work/answer/9495634)). Play requires new apps as Android App Bundles since Aug 2021 ([ext](https://developer.android.com/guide/app-bundle)), so ship an AAB via Play Console (US$25 one-time, [ext](https://support.google.com/googleplay/android-developer/answer/6112435)) or an MDM-pushed APK. **Timely:** "Starting September 30 2026, private Android apps on unmanaged… devices must be registered to a verified developer identity… **Apps deployed on fully managed devices or within Work Profiles are exempt**" ([ext](https://support.google.com/googleplay/work/answer/17266330)) — in force now, so MDM-only is the simplest compliant path. **TWA alternative:** runs the site "full screen… without any browser UI", verified by Digital Asset Links ([ext](https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2)) — cheapest shell, but **no plugins, no bundled assets**, hence no offline; rejected, kept as online-only fallback.

**iOS (PWA per constraint).** The MDM **Web Clip** payload `com.apple.webClip.managed` has a **Full screen** option that opens the URL "as a web app without a browser (there's no URL or search bar, and no bookmarks)", plus "Is removable" to lock it ([ext](https://support.apple.com/guide/deployment/depbc7c7808/web)) — the whole v1 iOS plan: no App Review, no $99/yr. **PWA limits:** Web Push works **only** for Home Screen web apps and needs direct user interaction ([ext](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)); **Background Sync is unsupported** ([ext](https://developer.mozilla.org/en-US/docs/Web/API/SyncManager)); storage can be evicted under pressure or ITP's seven-day cap, but "Web applications added to the home screen are not part of Safari… We do not expect the first-party [data] in such a web application to have its website data deleted" ([ext](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/); [policy](https://webkit.org/blog/14403/updates-to-storage-policy/)). Net: offline data survives, **background replay does not** — replay runs in-app, fine for timer capture.

**If a store is involved:** Apple **4.2** — an app must include "features, content, and UI that elevate it beyond a repackaged website", and 4.2.2 excludes marketing/web-clipping apps ([ext](https://developer.apple.com/app-store/review/guidelines/)). **Risk:** ABM custom apps are still reviewed — "Once your app is approved, it will be available in the Apps and Books section" ([ext](https://developer.apple.com/custom-apps/)) — a thin wrapper risks rejection **even internally**.

---

## 7. Security & privacy for offline payroll + location data

**[repo] exposed today:** time entries (payroll/billing), notes and per-entry location — `latitude`, `longitude`, `location`, `locationSource`, `locationAccuracyM` (`src/db/schema.ts`), workspace toggle `locationTrackingEnabled` (:312), capture in `device-location.ts`, IP→city via ipinfo.io (`docs/system-overview.md`). It sits in `localStorage` (`offline-queue.ts`, `pending-entries.ts`) with **no encryption, expiry or wipe on logout**.

- **At rest:** WebCrypto AES-GCM over IndexedDB payloads, key in Keychain/Keystore **[assumption — key management]** — defends casual inspection and kiosk phones, not an unlocked device. Android `FLAG_SECURE` / iOS capture detection are native-only PWA gaps that also help clear Apple 4.2.
- **Kiosk/shared + wipe:** scope per `workspaceId`+`memberId` (queue key already does [repo]); wipe on logout/member switch; MDM removal plus app-level "revoke sessions + purge local data" on next launch; `revokeSessionsOnPasswordReset` already on [repo].
- **Offline session expiry:** 30-day sessions outlive server-side revocation — add an offline grace window and require a live check before payroll-critical sync.
- **PH context:** payroll data plus employee location is personal information under RA 10173 ([ext](https://lawphil.net/statutes/repacts/ra2012/ra_10173_2012.html)); the workspace toggle exists and consent/retention must be stated. NPC guidance on employee monitoring needs legal confirmation — **[assumption]**, not asserted.

---

## 8. Comparison matrix

Effort = order-of-magnitude engineering weeks **[assumption]**, excluding the app-side offline layer common to every shell option.

| Option                             | Effort / first user | Distribution / cost                    | Offline depth                           | Desktop        | Key risk                                         |
| ---------------------------------- | ------------------- | -------------------------------------- | --------------------------------------- | -------------- | ------------------------------------------------ |
| **O1. Harden PWA**                 | 3–4 / days          | MDM Web Clip or install / $0           | Med — no BG Sync iOS                    | Same code      | Manual iOS install w/o MDM                       |
| **O2. Capacitor, remote URL (A)**  | 2–3 / 1–2 wks       | Play private AAB or MDM APK / $25 once | Med — needs WebView SW **[assumption]** | Tauri later    | `server.url` non-prod; SW unverified             |
| **O3. Capacitor, bundled SPA (B)** | 4–6 / 3–4 wks       | Same as O2 / $25 once                  | High — shell local                      | Same bundle    | Cross-origin fns + CSRF/CORS change              |
| **O4. O1–O3 + sync engine**        | +4–8 / +1–2 mo      | Same / $49–$599 per mo or self-host    | High, near-real-time                    | Reusable model | Second source of truth; Neon replication one-way |
| **O5. React Native rewrite**       | 20+ / 2–3 qtrs      | Stores or MDM / fees                   | Highest                                 | New codebase   | "No UI forks" violated; ~67 routes redone        |
| **O6. TWA**                        | 1 / 1 wk            | Play or MDM / $25 once                 | **None** — no bundled assets            | n/a            | Fails offline requirement                        |
| **O7. Desktop (Tauri/Electron)**   | 3–5 / not v1        | Direct or MDM / $0                     | High                                    | —              | Epic non-goal                                    |

**Discriminators:** O1/O6 cannot meet offline write+read alone; O2 matches the stakeholder wording and keeps same-origin auth but carries an unverified WebView-SW assumption; O3 is the clean offline answer at ~2× packaging effort plus a production-server change; O4 is premature.

**Reading the effort column (reconciliation note for the PRD).** The O1 (3–4 wk) and O2 (2–3 wk) figures are **scoped slices, not competing totals**: O1 is the shared offline app-code layer (cache persister, durable queue, idempotency, offline-tolerant session bootstrap) that every option needs, and O2 is the Android packaging slice that sits on top of it. Adding them plus hardening/testing gives 9–13 dev-weeks end-to-end — consistent with, and inside, the engineering report's 9–16.5 dev-week band. Any total quoted in PRD v2 should be the end-to-end figure, never the sum of O1+O2 presented as two independent projects.

---

## 9. Recommendation, gates, switch triggers

**v1: O1 + O2** — harden the PWA, then ship an Android Capacitor shell in remote-URL mode; **iOS as an MDM Web Clip PWA**; iOS native shell behind a gate; desktop deferred.

Why: it satisfies all three constraints without touching the production auth/CSRF boundary, and offline _durability_ — the Epic's release gate — comes from app code every option needs: an IndexedDB Query persister for catalogs and own entries; an encrypted durable queue replacing the evictable `localStorage` queue [repo]; idempotency keys on replay; an offline-tolerant `beforeLoad` in `src/routes/app.tsx` [repo]; per-item replay status. It also defers the one irreversible decision (sync engine + Neon logical replication).

**Two-week gate:** if the WebView-SW spike fails, switch to **O3** and budget the cross-origin CSRF/CORS work — the offline app-code layer is unchanged, so nothing is wasted.

**Switch triggers:** (1) WebView SW fails → O3; (2) offline reads must reach team/analytics views (a non-goal) → O4 justified; (3) real multi-device conflicts (kiosk + phone) → O4 with a payroll-acceptable conflict policy; (4) public store listing required → add native functionality first (4.2/4.2.2 risk); (5) replay duplication in fault injection → stop and fix idempotency; no wrapper compensates.

**Before the iOS native shell:** Apple Developer Program ($99/yr, [ext](https://developer.apple.com/programs/)) + ABM custom app; an App Review plan clearing 4.2 with native capability (secure storage, native geolocation, biometric/capture protection); replay proven **without** Background Sync; storage + wipe verified on hardware; deep links decided. Only then does a shell beat the Web Clip — its value is native security, not offline.

---

## 10. Repo evidence, spikes, assumptions

**Verified [repo] 2026-11-05.** `createServerFn` in **12 files**, all under `src/lib/server/**` (`session`, `tracker`, `workspaces`, `subscriptions`, `api-keys`, `weekly-report-preferences`, `workspace-access`, `workspace-invites`, `resend-test`, `smtp-test`, `tracker/catalogs/{client-related,project-detail}`). `window`/`document` in **75** files; `localStorage` in **9**; `sessionStorage` in 2; **IndexedDB 0**. `offline-queue.ts` (222 lines): keys `offline-queue:{workspaceId}:{memberId}`, 4 mutations (`startTimer`, `stopTimer`, `discardTimer`, `createManualEntry`), client timestamps already carried (`startedAt`/`endedAt`). `public/sw.js`: offline.html precache + `/_build/` cache-first + navigation network-first, no API caching; `public/offline.html` 3,034 B; manifest `start_url: /app/time-tracker`, `display: standalone`. Query client: `offlineFirst`, `staleTime 30s`, `gcTime 10 min`, **no persister**. `app.tsx`: `beforeLoad` awaits `getSessionFn()`, loader awaits workspace access, self-profile, subscription — the offline cold-start blocker. Stack: 67 route files, React 19.2, Vite 8, Nitro 3 beta (vercel/node-server), Drizzle + Neon, 28 migrations, Chrome MV3 sidepanel extension loading a remote `APP_URL`.

**Spikes before M1 (≤2 days each):** (1) Android WebView SW serves the shell offline; (2) offline-tolerant session bootstrap replacing the `beforeLoad` gate; (3) IndexedDB restore size/latency on a mid-tier managed Android; (4) Capacitor cookies + `SameSite=None` against production; (5) Keystore/Keychain queue keys with wipe-on-logout; (6) MDM Web Clip full-screen, non-removable on a supervised iPhone.

**Open assumptions:** Android WebView third-party cookie behaviour under Topology B; Canvas/WebGL UI (`maplibre-gl`, `three` [repo]) performance in a mid-tier WebView; MDM vendor and enrolment cost (unpriced here).

**Licences** [ext: GitHub API, 2026-11-05]: TanStack Router, Better Auth, Workbox MIT; Dexie, Electric, Zero, RxDB, PowerSync Apache-2.0; WatermelonDB MIT.

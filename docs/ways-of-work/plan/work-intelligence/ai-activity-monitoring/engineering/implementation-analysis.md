# Implementation analysis — AI activity monitoring MVP

**Feature:** `ai-activity-monitoring` · Engineering v1 · 2026-11-05 · Lazy Developer
**Constraints (fixed):** metadata-only; Chrome extension v1 (Windows agent = phase 2, macOS out); Gemini suggestions only + employee approval; workspace-mandated monitoring with notice, recorded acknowledgment, objection route, pause/exclusions, DPIA/legal sign-off.
**Related:** [Epic](../../epic.md) · [PRD](../prd.md) · [Research](../research/platform-feasibility.md) · **est.** = one senior engineer familiar with the repo, ±40%; excludes DPIA/counsel, consultation, store review, distribution setup.

## 0. TL;DR

Extend the existing MV3 extension into metadata-only capture → token-authenticated ingestion (1 endpoint + 9 tables) → server-side Gemini on 5–10 min segments → an employee review queue that only **prefills the existing manual-entry form**. No content capture, no desktop agent in v1, no new payroll write path.

| Item                  | Answer (est.)                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reuse                 | Existing extension, 136 server fns, `createManualEntryFn`/`createTaskFn`, `audit_logs`, `activity.view`, location-privacy pattern, API-key hashing, crons, Sentry |
| v1 effort             | **9.5–15 dev-weeks** (M0–M4); excludes legal/DPIA, consultation, store review, pilot calendar                                                                     |
| Phase-2 Windows agent | **+10–16 dev-weeks, separate project — never added to v1**                                                                                                        |
| Gemini cost           | **$0.45–1.10/active user/month**; 50 users ≈ $23–55/mo; 200 ≈ $90–220/mo                                                                                          |
| Top risks             | (1) no DPIA/notice → cannot enable; (2) over-collection/leak; (3) payroll trust + AI cost                                                                         |
| Biggest do-not-build  | **Autonomous payroll/task writes; content/screenshot/keylogging/clipboard capture.** Also no desktop agent, no manager raw-activity view, no client-side AI       |

**Stated everywhere:** browser-only capture cannot see Excel, email, native apps or mobile; label "browser activity only" and show coverage gaps (PRD §3).

## 1. Evidence (2026-11-05)

- `extension/`: 5 runtime files, **0 tests**; permissions `sidePanel, storage, activeTab, scripting`; host access app-only; SW badge-only; on-demand active-tab capture only.
- App: **136 server fns/12 files, 41 tables, 28 SQL migrations, 103 Vitest files**; Better Auth cookies (`SameSite=None; Secure` prod); `CHROME_EXTENSION_ORIGIN` trusted; `assertTrustedOrigin`; `entrySource` = `TIMER|MANUAL`; `audit_logs`; `activity.view`; location toggle + purge + privacy test; cron/`CRON_SECRET`; API-key hash pattern; `project_tasks` unique + ilike dedupe.
- Grep: **no AI/device/activity code**; `.env.example` lacks `CHROME_EXTENSION_ORIGIN` and any Gemini key. PRD v1: 28 FRs / 22 US / 22 ACs.

## 2. Reuse (lazy path)

Existing extension/build, `createManualEntryFn`/`createTaskFn` (unique index), `audit_logs`/`AuditAction`, `activity.view`, workspace-settings gate, location-privacy toggle/purge/tests, API-key hashing for tokens, crons, Sentry. New: capture client, ingestion, AI worker, review/policy UI, 9 tables.

## 3. Capture (extension-only v1)

**Options.** (A) **Extension-only — recommend**: least data/legal exposure, reuses extension. (B) **Extension + Windows agent phase 2**: +10–16 dev-wk separate (Win32 hooks, tray app, signed MSI+MDM, desktop coverage), after pilot only. (C) **OS/MDM monitoring or bought SaaS — reject** (opaque, content capture, PH risk). v1 = Chrome only.

**Permissions:** add `tabs` (title/URL on switches; no content scripts), `idle`, `alarms`; keep `storage`, `sidePanel`; **no `<all_urls>`** (host access stays app-only). "Read your browsing history" warning remains; distribution = enterprise force-install or Web Store (IT, OQ-4).

**Events:** `tabs.onActivated`, `windows.onFocusChanged`, `tabs.onUpdated` (debounced), `tabs.onRemoved`, `idle.onStateChanged` (60 s), `chrome.alarms` heartbeat 60 s; focused tab only; >2 min gaps close (no backfill); 30 min cap; rehydrate SW state from storage on wake. **Never capture:** paused/disabled/unacknowledged/declined, off-hours, incognito, restricted URLs (`chrome://`, `chrome-extension://`, `devtools://`, `file://`, Web Store, PDF viewer); excluded events dropped **before any local write**.

**Minimization:** registrable domain only (no query/fragment/credentials; path opt-in, 80 chars); title ≤120 chars, control chars stripped, emails/URLs/≥6-digit IDs/token-like strings redacted, generic titles dropped; unparseable URLs dropped; app-family label local. **No content, DOM, screenshots, OCR, keystrokes, clipboard, audio, webcam, form values — permanently** (PRD §8).

**Buffer/batching:** 5-min local segments in an AES-GCM/WebCrypto `chrome.storage.local` buffer (key in extension storage — **best-effort only**, no OS keychain), cap ≈24 h/1,000 events (oldest dropped with warning); flush **every 60 s or 20 segments**, ≤64 KB; idempotent `batchId`; backoff+jitter; survives restart/update; policy state in ingest/heartbeat responses → pause/kill switch ≤60 s.

## 4. Device auth

SW cannot rely on the iframe cookie (cross-origin, third-party/`SameSite`-sensitive; `assertTrustedOrigin` needs an Origin header SW fetches don't reliably carry). Use a **scoped device token**; humans keep cookies.

**Pairing:** Settings → Pair device → cookie+CSRF server fn creates a one-time 10-char code (10-min TTL, hashed); extension exchanges it at `POST /api/activity/pair` for `tickr_dev_<32-byte base64url>` **once**, stored in `chrome.storage.local`, sent as `Authorization: Bearer …` (never logged). Revoke → capture stops + buffer clears on next 401; 180-day expiry; re-pair to rotate. **Token:** SHA-256 at rest (API-key pattern), prefix/last-four in UI, workspace+member+device scope, status/lastSeen/IP/expiry/revoke; writes **only activity tables**, never time entries. Disabled workspace/inactive member/no subscription → 403 → buffer clears. **Consent gate:** ingest rejects until the current notice is acknowledged on that device (version + hash + timestamp + member + device + ext version); decline = capture off for that member only, audited.

## 5. Ingestion, data model, retention

**`POST /api/activity/ingest`** (TanStack file route, not `createServerFn` — the cookie/CSRF contract does not fit a SW): ≤64 KB / ≤50 segments `{batchId, sentAt, segments:[{segmentKey, start, end, activeSeconds, idleSeconds, domain, appLabel, title, path|null}]}`. Server: token hash → device/member active → monitoring enabled → ack → re-apply exclusions → sanitize → reject stale/future → **idempotent insert** (`unique(device,batchId)`, `unique(device,segmentKey)`) → last-seen → config (`policyVersion`, `captureEnabled`, `aiEnabled`, `serverTime`). Limits ≈60 req/h, 600 segments/h → 429; SW cross-origin fetch verified in M0; logs/Sentry counters only — **never titles/domains/tokens/payloads**.

**9 tables (one migration):** `device_pairing_codes`; `device_registrations`; `monitoring_policies` (workspaceId PK: enabled, notice version/hash, DPIA ref, workHours+tz, exclusions, aiEnabled, floor, caps, retention); `monitoring_acknowledgments`; `activity_batches`; `activity_events` (**14 d**); `activity_segments` (**30 d**); `activity_suggestions` (candidate, confidence, evidence, status, correction reason, approved ids; **90 d**); `ai_runs` (model/prompt version, tokens, cost, latency, status; **90 d**, no payload bodies). Raw events exist because PRD FR-15 requires the short raw window; metadata-only, never manager-visible.

**Retention/DSR:** daily `/api/cron/activity-retention` (`CRON_SECRET`) purges per class, expires stale suggestions, logs counts, alerts on lag; deletion removes activity/segments/suggestions/ack with an audit tombstone; export JSON/CSV; reuse confirm-by-name purge. Extend `AuditAction`: `ACTIVITY_POLICY_UPDATE`, `ACTIVITY_DEVICE_PAIR/REVOKE`, `ACTIVITY_CONSENT_ACK/DECLINE`, `ACTIVITY_DATA_PURGE/EXPORT`, `ACTIVITY_SUGGESTION_APPROVE/DISMISS`, `ACTIVITY_KILL_SWITCH`.

## 6. Gemini pipeline (server-side only)

**Flow:** cron `/api/cron/activity-suggestions` every 5 min (`CRON_SECRET`, 30 s function limit → bounded batch) → `PENDING` segments ≥5 min old → group consecutive (same app family/domain, ≤2 min gap, ≤30 min) → minimized prompt → structured output → validate → store suggestion; mark `SUGGESTED|FAILED|SKIPPED`.

**Input:** workspace tz/date; member's last-3-day approved task descriptions; active project/task catalog ≤100 names; segment summaries (app label, domain, sanitized titles, durations, switches); few prior approvals. Never raw events, content, unapproved fields, or extra identity (OQ-11/12). **Output/safety:** `responseMimeType: application/json` + `responseSchema` ([docs](https://ai.google.dev/gemini-api/docs/structured-output)): `projectId` (enum of allowed ids), `taskId|null`, `proposedTaskName|null`, `confidence 0–1`, start/end, evidence ≤140 chars. Zod-validate, drop unknown ids, no free-text parsing, **no tools**, low temperature; titles are untrusted data, never instructions; retries ≤2 then `FAILED`.

**Model/fallback:** pin the model in M2 by golden-set evaluation among current **paid flash-class** models (PRD/research candidate: `gemini-3.5-flash-lite`; earlier draft used 2.5 Flash — do not ship a marketing-name pin; re-verify availability/pricing at the pin). On outage/disabled/cap/invalid output → **no suggestion** (optional deterministic rule from that member's prior approved domain→project mapping); manual tracking never blocks. Per-member/day + workspace/month caps from `ai_runs` sums; alert 80%, AI pauses 100% (capture continues); skip <60 s/generic segments; cache by input hash.

**Cost (est.):** 6 active h/day, 5-min segments, 10-min AI groups → **36 calls/user/day**; ≈**2,200 input + 180 output tokens/call**. Flash-class rates used for this estimate: $0.30/$2.50 per 1M ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing); cross-checked 2026-11-05 at [Dataconomy](https://dataconomy.com/ai-models/gemini-2-5-flash/)) → ≈$0.84/user/mo before savings; with 40% skipped, 30% cache hits, 30% waste → **$0.45–1.10/user/mo**; 50 users **$23–55/mo**, 200 **$90–220/mo**. Caps: **$0.10/member/day**, workspace monthly at enablement; re-verify prices at build.

## 7. Safe auto-encoding (suggestions only)

- **v1 = suggestion-only:** AI proposes project/task/name/time + confidence + evidence → employee edits/approves → approval **prefills the existing manual-entry form** → employee saves → only then a `time_entries` row exists. **No auto-save/auto-post/AI-created task without approval** (PRD §8; code-review gate).
- **Thresholds:** show confidence + evidence; below floor (default 0.5, Owner-adjustable) → "not enough evidence", no approve; confidence never auto-approves; high confidence only preselects fields.
- **Tasks:** prefer existing task by normalized name; create only on approval via `createTaskFn`; concurrent approvals collapse via unique index.
- **Time safety:** active seconds only (idle removed), merged adjacent segments, ≤30 min, inside work-hours; hold while a timer runs; run `checkTimeEntryOverlapFn`; merge cross-device overlaps.
- **`entrySource`:** **no AI enum value in v1**; save as `MANUAL`, link `activity_suggestions.approvedEntryId`, audit approval; "AI-assisted" derivable. Rejection reasons stored for quality metrics only.
- **Accountability:** employee is author of record (they save); Owner owns policy/notice; DPO owns DPIA/retention; AI is advisory.

## 8. UX surfaces

- **Extension:** state (active/paused/inactive/needs-ack), account/workspace/device, Pause/Resume, Review (N); indicator cannot be hidden or restyled as off (FR-4).
- **App:** status row, notice + per-device ack, decline, pause, local exclusions, consent history; **review queue `/app/activity`** grouped by day (time range, project/task, confidence, evidence), approve→prefilled draft, edit, reject with reason, snooze, "this is personal".
- **Owner/Admin Settings:** enable (fail-closed until notice/work-hours/retention/DPIA ref), notice version, exclusions, work-hours, retention, AI on/off + floor, cost cap, device list/revoke, purge/export, kill switch; all audited.
- **Manager (`activity.view`):** aggregates only — captured/approved minutes, coverage %, approval/rejection and capture-health counts; **no titles/domains/paths/timeline/ranking**.

## 9. Privacy controls that are architectural

Metadata-only (no content scripts) · client pre-filter + server re-check for exclusions/incognito/work-hours · two-sided sanitizer · server consent gate · pause local ≤5 s / kill switch via config + ingest rejection ≤60 s · work-hours enforced server-side · **no raw-activity endpoint** (aggregates only) · counters-only logs + Sentry scrubber · per-class retention + deletion/export · hashed scoped revocable tokens + last-seen · AI minimization + strict schema + no tools + versioned prompts + supplier no-training/region (DPIA) · least-privilege permissions. **Residual:** browser-only coverage; extension disabled = gap; local buffer encryption best-effort; compromised profile out of scope; Gemini processor risk = contract/DPIA.

## 10. Phases

- **M0 — Decisions, spikes, privacy gate (1–1.5 wk):** DPIA scope/notice/retention, distribution, Gemini terms; spikes (MV3 capture+SW restart, ingest, pairing, Gemini schema/cost, install); threat model. **AC:** spikes written, §15 decisions recorded, no production capture, permissions fixed.
- **M1 — Capture, device trust, ingestion (2.5–4 wk):** capture/sanitize/segment/buffer/batching/pause/exclusions/work-hours; pairing + hashed tokens + revoke; ingest + 9 tables + idempotency + limits; acknowledgment gate; retention cron; privacy tests. **AC (PRD v2):** AC-2…AC-12, AC-26; no data before acknowledgment; revoke/kill switch stop capture on next policy sync; batches idempotent. (AC-1 enablement console lands with the M3 policy UI — see review.)
- **M2 — Segments + Gemini (2–3 wk):** segmentation/grouping, deterministic rules-first, prompt/schema/validation, caps + `ai_runs`, fallback, cache, golden set. **AC (PRD v2):** AC-14…AC-17, AC-25 — schema-valid or rejected, injection-proof, outage keeps capture, cost within caps. (AC-24 cap-configuration UI lands with M3.) Rules-first adds scope only if a _workspace mapping_ UI is required; see §15.
- **M3 — Review, approve, policy UX (2.5–4 wk):** review queue; approve→prefilled entry + optional task approval; dedupe/overlap/idle; undo/reasons; policy console (incl. enablement gate AC-1 and cost caps AC-24); devices; notice/ack/objection; manager aggregates; DSR export/delete. **AC (PRD v2):** AC-1, AC-18…AC-24, AC-27 — draft only, zero payroll rows pre-save, no duplicate tasks, aggregates only.
- **M4 — Hardening, rollout, measurement (1.5–2.5 wk):** e2e + privacy-negative + golden-set gates; load tests; flags/kill-switch/DSR drills; packaging + privacy text; staged rollout (internal → one-team pilot one pay period → limited → workspace); runbook. **AC:** all PRD v2 ACs on managed Chrome; drills pass; pilot metrics/cost measured; no auto-write path.
- **Total v1: 9.5–15 dev-weeks (est.).** Calendar only: DPIA/counsel 2–6 wk; consultation; store review 1–4 wk or enterprise policy; pilot pay period.
- **Phase 2 Windows agent — separate project, not in total:** Win32 foreground + `GetLastInputInfo` idle, service/tray app, secure local store, reuse contracts, signed MSI + auto-update + Intune/MDM, desktop coverage, privacy review; **+10–16 dev-weeks** + maintenance/DPIA addendum; after v1 pilot (OQ-10). macOS out.

## 11. Do NOT build (v1)

No content/screenshots/OCR/screen recording/keylogging/clipboard/audio/webcam; no DOM-reading content scripts. No auto-post, auto-approve, AI-created task without approval, or silent payroll write. No Windows/macOS capture in v1; no mobile/PWA/Firefox/Safari. No manager raw-activity/live feed/timeline/per-domain drill-down/ranking. No URL query/full paths by default; no browser-history import; no off-hours capture. No incognito/stealth/hidden indicator/blocked pause or decline. No client-side AI keys or content/identity beyond the DPIA field set. No sync engine/CRDT, new payroll API, `/api/v1` monitoring surface, Kafka/Redis platform, ML training, bought surveillance SaaS, new RBAC taxonomy, or productivity scores/leaderboards.

## 12. Risks

- **No lawful basis / DPIA or consultation fails (M/H):** blocking gate — no enablement without recorded DPIA/legal ref; notice/ack; decline; kill switch.
- **Over-collection/leak (M/H):** client pre-filter + server re-check; two-sided sanitizer; privacy negative tests as release gate; buffer cleared on pause/revoke/account switch.
- **AI suggestion → wrong paid time (M/H):** suggestions only; draft prefill; human save; audit + suggestion link; confidence floor; corrections measured.
- **AI cost overrun / outage (M/M):** member+workspace caps, 80/100% alerts, AI pause, caching, golden set before budget commitment.
- **Gemini terms/training/residency unacceptable (M/H):** no production AI until contract + DPIA approve field set/region; AI off by default.
- **Manager misuse/ranking; token theft/shared device (M/H):** aggregate-only APIs/UI, no raw endpoint; hashed/scoped/expiring/revocable tokens; buffer clear on account switch; never logged.
- **MV3 reliability gaps; permission expansion / store rejection (H/M):** event-driven rehydrate, 60 s heartbeat, policy sync, health surfaced; least privilege (`tabs`/`idle`/`alarms`, no `<all_urls>`), enterprise force-install fallback.
- **Retention/PII in logs; duplicate tasks/entries; clock/idle errors (M/H):** daily cron + lag alert, audited purge counts, DSR tombstone; counters-only logs + Sentry PII scrub; unique index + ilike check + atomic suggestion status; timestamp bounds.
- **Coverage misread / trust / prompt injection / breach (H/M):** "browser activity only" + gaps; notice/pause/decline; untrusted titles + schema-only + no tools + adversarial tests; runbook = kill switch, revoke, purge, DPO notify.

## 13. Tests

**Privacy negative suite (release gate):** paused/unacknowledged/declined/disabled/off-hours/excluded/incognito → no storage or network; sanitizer strips query/fragment/credentials/emails/IDs; local exclusions never uploaded; DB proves per-class retention; manager responses contain no raw fields; Sentry/log fixtures contain no titles/domains; revoke stops ingest; kill switch clears buffer. **Unit** (existing 103-file suite green): segmenter, sanitizer, grouping, batching/idempotency, policy gates, cost math, zod schemas, task dedupe, injection fixtures. **Extension E2E** (Playwright `--load-extension`): pair, switches, pause ≤5 s, exclusion, revoke, approve→save one entry, task dedupe, kill switch. **AI golden set** (~100 labelled segments): accuracy, confidence calibration, approval/correction labels, schema-valid rate, injection, fallback; CI mocks, live pre-release with budget. **Ingestion** contract/load: oversize/malformed, duplicate batch, rate limits, stale/future, cross-workspace token. DSR/retention drills. Gates: `pnpm check-all`, build, `pnpm perf:bundle`, `./extension/build.sh`.

## 14. Observability, rollout, flags

Counters-only: ingest segments/batches/rejected, heartbeat age, AI runs/tokens/cost/latency/status, suggestion outcomes, approval time, cost per member/day + workspace/month, purge counts, DSR age, revocations. Alerts: ingest failure >5%/15 min; capture-health loss >20% devices; AI failure >20%/15 min; cost 80/100%; retention lag >26 h; 403 spike. Flags: global `ACTIVITY_MONITORING_ENABLED` kill; per-workspace policy default **off**; `aiEnabled` default **off**; floor/caps/retention; no path enables capture without acknowledgment. Rollout (PRD §13): prerequisites/DPIA → internal dogfood 2–4 wk → one-team pilot (one pay period) → limited → workspace; kill-switch/purge rollback; runbook.

## 15. Decisions + PRD v2 reconciliation

**Decisions before coding:** DPIA/lawful basis + notice wording/version + decline handling (DPO/legal); Gemini contract/region/no-training + field set (DPO+IT); distribution/permissions/privacy text (IT); retention + audit retention (DPO+Owner); work-hours/timezone defaults (Owner+DPO); manager aggregate granularity + minimum group size (Lead+DPO); cost caps/model/alert owners (Owner/finance); employee-local exclusions UX + mandatory denylist (DPO+eng); path metadata field set (OQ-11); shared/kiosk device semantics (IT+DPO); DSR SLA/export/tombstones (DPO); kill-switch authority + notification duties (Lead+DPO); phase-2 Windows scope/budget/date (Lead+IT); whether to add an AI `entrySource` value (recommend no).

**PRD v2 reconciliation (reported; PRD not edited).** Adopted in PRD v2 (no action): 60 s flush; WebCrypto buffer stated as best-effort; `entrySource = MANUAL` + suggestion link; raw-event retention as DPO OQ-3; no `<all_urls>`/content scripts; k-anonymous manager aggregates; legitimate-interest framing with counsel deciding (legal wording still needs the review's §B4 fix).

- **Rules-first is new scope (PRD FR-16/AC-15).** Engineering M2 included only the deterministic fallback from a member's prior approved mapping; a _workspace mapping_ plus rules-always-first is **+0.5–1 wk**. Either define workspace mapping as existing member-approved history only (fits 9.5–15) or raise the total to **10–16 dev-weeks**.
- **Model pin.** PRD/research name `gemini-3.5-flash-lite`; this analysis earlier said 2.5 Flash. Pin in M2 by golden-set evaluation among current paid flash-class models; never ship a marketing name; recompute the cost estimate for the pinned model (estimate used $0.30/$2.50 per 1M).
- **Cross-doc effort.** Research's A1 **4–6 dev-wk** is an `[assumption]` slice, and its Windows figure (6–10) differs from engineering's **+10–16** (which includes signing/MDM/auto-update/privacy). PRD's end-to-end **9.5–15** must be the only quoted total; never add any of these together.
- **Still open in PRD:** raw retention 14 d (OQ-3), titles-to-Gemini field set (OQ-11), manager k/anonymity (OQ-6) — see review B1/B4.

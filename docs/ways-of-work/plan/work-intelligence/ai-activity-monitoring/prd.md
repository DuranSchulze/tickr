# PRD — AI activity monitoring and auto time encoding (work intelligence)

**Feature ID:** `ai-activity-monitoring` · **Version:** v3 (final) · **Date:** 2026-11-05
**Author:** Product Manager · **Reviewers:** Lead (stakeholder proxy), Researcher, Lazy Developer
**Evidence:** [Research](research/platform-feasibility.md) and [Engineering](engineering/implementation-analysis.md), both final 2026-11-05. **Review record:** [engineering/prd-review.md](engineering/prd-review.md).

**v3 delta from v2:** blockers fixed — manager data is team-level only (no per-member rows; DPO-proposed k ≥ 5, group-minus-objectors suppression); revoke/kill semantics corrected for offline devices (server rejects immediately, device applies at next contact; AC-28); sign-out requires a server-side device-token revoke (one-profile residual); Gemini envelope defaults to domain/app label/durations/switches with no titles/paths/URLs. Majors: legal wording no longer pre-judges the basis; saved AI-assisted entries editable/deletable with audit and no post-payroll undo; approval save idempotent; overlap/running-timer AC; rules scoped to learned mapping; phase gates re-pointed; model pinned by golden-set class and config; store disclosure an M0 gate; residual title leakage and objection no-consequence; paid-terms wording.

**Privacy statement:** visible, minimal, acknowledged, objectable, human-approved — not covert. No screen content; no payroll write without an employee save. Legal conclusions belong to counsel.

---

## 1. Feature Name

**AI activity monitoring and auto time encoding (work intelligence)** — metadata-only Chrome activity capture, deterministic domain→project rules followed by server-side Gemini suggestions, and an employee review queue where approval only prefills the existing manual-entry form.

---

## 2. Epic

Parent: [Work intelligence — transparent activity monitoring with AI-assisted time encoding](../epic.md)

Evidence (final): [research](research/platform-feasibility.md) · [engineering](engineering/implementation-analysis.md).

**Scope:** Chrome-extension metadata capture (domain default; path opt-in; sanitized titles; switches; idle; 60 s heartbeat) → token-authenticated ingestion → 5–10-minute segments → learned mapping first, then Gemini suggestions → employee review → approved draft only. Windows agent is separate phase 2 (+10–16 dev-weeks, not in v1); macOS out. Screenshots and content are permanently out of scope.

---

## 3. Goal

**Problem.** Web work is fragmented across tabs and systems, and remembered time is systematically low, so billable hours go unwritten while reconstruction becomes unpaid administration. The firm has no honest measure of uncaptured work, so reporting implies a completeness it cannot prove. Observing work also risks harm: titles and paths reveal health, legal, banking, or job-search activity, and a confident-but-wrong AI could corrupt payroll. The extension captures only the active tab once — no history, no acknowledgment, no AI.

**Solution.** Extend the existing MV3 extension into a metadata-only capture client (registrable domain by default; path opt-in, off by default; sanitized titles; switches; idle; 60 s heartbeat; no content scripts, no `<all_urls>`, incognito `not_allowed`), with pause and layered exclusions that drop events before any local write. Enable only after the privacy gate: DPIA and DPO/counsel sign-off, written notice, and recorded per-device acknowledgment with an objection route. Ingest segments through a token-authenticated endpoint; apply deterministic domain→project rules first; then ask paid server-side `gemini-3.5-flash-lite` for schema-only suggestions (no tools, no model URLs, titles treated as untrusted). The employee reviews and approves; approval only prefills the manual-entry form via `createManualEntryFn`, and a saved entry stays `entrySource = MANUAL` linked to its suggestion. Never capture content, screenshots, keystrokes, or clipboard; never expose raw activity to managers; never let AI act alone.

**Impact.** Less missed billable time and encoding effort, coverage-labelled reporting, zero autonomous payroll writes or duplicate task names, and a defensible privacy posture. Targets are labelled in the Epic; baselines unknown until instrumented.

**Honest limitation.** Browser-only capture cannot see Excel, email clients, native apps, or mobile work, so v1 sees a partial slice of the day. Every surface showing captured data — Goal, capture UI, manager aggregates, metrics — must say **"browser activity only"** and show coverage gaps; nothing may imply full-day knowledge.

---

## 4. User Personas

- **P1 — Employee (monitored).** Works in Chrome across client systems; wants less typing, wants to see exactly what is captured, and wants a real pause, exclusions, and a voice (objection).
- **P2 — Manager / supervisor.** Reviews team hours and timesheets; needs coverage and approval signals to judge completeness — not a live feed or raw browsing history.
- **P3 — Workspace Owner / Admin.** Enables and governs monitoring: notice, exclusions, retention, AI mode, cost cap, device revoke, kill switch.
- **P4 — HR / payroll admin.** Runs payroll; needs approved entries only and an honest statement of monitoring gaps.
- **P5 — IT / security.** Owns distribution (force-install or Web Store), devices, tokens, secrets, incident response.
- **P6 — DPO / legal.** Owns DPIA, lawful-basis determination, notice/acknowledgment/objection records, retention, DSR procedure, Gemini terms.
- **P7 — Employee representative / works council.** Consults on notice, proportionality, pause/exclusions, objection, and permitted uses.

---

## 5. User Stories

**Primary**

- **US-1** As P1, I want a plain-language notice and recorded per-device acknowledgment before capture, so that monitoring is transparent and I know how to object.
- **US-2** As P1, I want an always-visible indicator of active/paused/inactive state, account, and device so that I always know when capture is on.
- **US-3** As P1, I want an immediate pause that discards pending capture and stays visible so that I can step away unrecorded.
- **US-4** As P1, I want per-domain exclusions I control locally so that sensitive sites are never captured or uploaded.
- **US-5** As P1, I want idle and off-hours time excluded so that unused tabs and evening browsing never become billable activity.
- **US-6** As P1, I want suggestions with confidence and evidence that I approve into a draft so that I type less but decide everything.
- **US-7** As P1, I want to edit, reject, or correct a suggestion so that a wrong guess never becomes my entry.
- **US-8** As P1, I want new task names deduplicated and created only on my approval so that the catalog stays clean.
- **US-9** As P2, I want team-level coverage and approval signals so that I can judge completeness without per-person surveillance.
- **US-10** As P3, I want to enable monitoring with published notice, policy settings, k-anonymous aggregates, and audit.
- **US-11** As P5, I want to distribute the extension and revoke devices so that capture is controlled and removable.
- **US-12** As P6, I want DPIA/notice/acknowledgment/objection/retention/deletion/export artifacts so that the firm meets RA 10173 obligations.
- **US-13** As P4, I want payroll to use only approved entries and coverage gaps to be visible so that pay rests on human-approved data.

**Edge cases**

- **US-14** As P1, I want to object and still use Trackly normally so that refusal carries no hidden product penalty.
- **US-15** As P1 on a shared device, I want my buffer cleared and device unpaired on account change so that the next person inherits nothing.
- **US-16** As P1, I want to see when the extension is missing, disabled, or stale so that I know coverage is incomplete.
- **US-17** As P1, I want AI outage to leave capture and time tracking working.
- **US-18** As P3, I want a cost cap that degrades AI rather than surprising the firm.
- **US-19** As P3, I want a kill switch that stops capture on every device within a policy cycle.
- **US-20** As P1 or P3, I want deletion and export of activity data so that data-subject rights are operable.
- **US-21** As P1, I want consistent behaviour across my browsers with per-device status so that cross-device work is not double-counted.
- **US-22** As P1, I want incognito, restricted, and failed pages ignored so that private and unreadable activity is never recorded.

---

## 6. Requirements

### 6.1 Functional requirements

**Lawful basis, notice, and control (privacy first-class)**

- **FR-1 Privacy gate and workspace policy.** Off by default; enablement requires a recorded gate — DPIA + DPO/counsel sign-off reference, published notice, work-hours window, retention, exclusion baseline, and AI mode — and is audited; missing fields fail closed. The basis is for counsel to determine (candidate legitimate interest, RA 10173 §12(f)). _(US-10 → AC-1)_
- **FR-2 Notice and per-device acknowledgment.** A plain-language notice (nature, purpose, extent, risks, retention, visibility, objection, DSR) precedes capture; acknowledgment stores notice version/hash/time/member/device/extension; material changes require re-acknowledgment and stop capture. Consent is captured wherever counsel requires it. _(US-1, US-12 → AC-2)_
- **FR-3 Objection and decline.** Objection/decline disables capture for that member only, is audited, and leaves all features working; no automated notification, ranking, manager alert, or permission change follows. Employment handling is HR/legal (OQ-2). _(US-14 → AC-2)_
- **FR-4 Visible indicator.** Extension badge and app status row show active / paused / inactive / needs-acknowledgment / objected, plus account, workspace, and device; it cannot be hidden, restyled as "off" while capture runs, or suppressed by managers. _(US-2, US-16 → AC-3)_
- **FR-5 Pause with discard-before-write.** Pause takes effect in ≤ 5 s: no event is written after it, pending unflushed capture is purged rather than uploaded, pause is visible and audited, and resume is explicit. Managers see coverage, never pause reasons. _(US-3 → AC-4)_
- **FR-6 Layered exclusions.** (a) mandatory global sensitive-category denylist (banking, health, government, password managers, personal webmail, job search, HR/legal); (b) workspace denylist; (c) employee-local list, extension-only, never uploaded or shown to managers. Excluded events are dropped before any local write and re-checked server-side. _(US-4 → AC-5)_
- **FR-7 Ignored surfaces.** No storage for incognito (`incognito: not_allowed`), `chrome://`/extension/devtools, Web Store, `file://`, unreadable PDFs, failed/unparseable captures, or activity outside work hours. _(US-22, US-5 → AC-6)_
- **FR-8 Metadata-only capture.** Permissions `tabs`, `idle`, `alarms`, plus `storage`/`sidePanel`; no `<all_urls>`, no content scripts, no page reads; legacy `activeTab`/`scripting` Page Context is retired. Records focused-tab activation/updates (debounced), window focus, tab switches/removal, idle (`chrome.idle`, 60 s), start/stop, 60 s heartbeat; flushes every 60 s or 20 segments (≤ 64 KB). Never records content, DOM, form values, keys, clipboard, screenshots, audio, webcam, or other apps. _(US-2, US-16 → AC-3, AC-7)_
- **FR-9 Minimization and sanitization.** Registrable domain by default; path opt-in (off by default, ≤ 80 chars, never sent to AI). Titles ≤ 120 chars, control characters stripped, emails/URLs/long IDs/token-like strings redacted, generic titles and unparseable URLs dropped, query/fragment/credentials removed; sanitization runs client-side and is re-applied server-side. Titles are best-effort redacted and may still carry sensitive context; they are never manager-visible, live only in raw events, and employees can report/delete them. _(US-4, US-22 → AC-7)_
- **FR-10 Idle handling.** Detection interval 60 s; idle above the threshold (default 5 min) closes the segment, and idle is never attributed to a task or suggested as minutes. _(US-5 → AC-8)_
- **FR-11 Work-hours window.** Capture only inside the workspace-configured window (workspace timezone, per-day schedule) and while signed in with capture enabled; the server re-checks on ingest and rejects out-of-window segments. _(US-5, US-22 → AC-6, AC-9)_
- **FR-12 Device pairing, sign-out, and revocation.** A one-time pairing code (cookie + CSRF) is exchanged for a scoped device token: SHA-256 hashed, workspace + member + device scope, revocable, 180-day expiry or ≤ 24 h when sign-out revoke is unavailable. App sign-out/account switch calls a server-side hook revoking that member's device tokens; it clears on the next 401 after sign-out (residual: one Chrome profile per employee). Revocation/disable stops ingest immediately server-side; the device applies it and clears its buffer at next network contact (≤ 60 s online; offline on reconnect). Revoked/disabled devices get 401/403 and clear the buffer. _(US-15, US-21 → AC-10, AC-28)_
- **FR-13 Durable buffer and idempotent batching.** `chrome.storage.local` buffer encrypted with AES-GCM/WebCrypto using a stored key — **best-effort only, no OS keychain**; defense in depth, not a guarantee against a compromised profile. Cap 24 h/1,000 events (oldest dropped with a warning); survives restart/update; flushes every 60 s or 20 segments with retry/backoff. Server enforces 64 KB/request, idempotency keys (`batchId`, `segmentKey`), ≈60 req/h, rejects stale/future timestamps; policy state applies within 60 s of next contact. _(US-16 → AC-11, AC-12)_
- **FR-14 Capture health.** Heartbeat, extension version, last upload, and policy version are reported; no heartbeat for 30 min shows "inactive" to the employee and admins, who see enrolled/revoked devices. Inactive is never counted as captured. _(US-16 → AC-13)_

**Suggestions: learned mapping first, AI second, human last**

- **FR-15 Server-side segmentation.** 5–10 min segments per member/device (split on idle, pause, exclusion, work-hours boundary, long domain change; gaps > 2 min close; 30 min cap) storing redacted domain/app label/duration/switches. Raw events last only the short raw window and are never manager-visible. _(US-6 → AC-14)_
- **FR-16 Learned domain→project mapping first.** A mapping learned only from the member's own prior approved entries produces suggestions with confidence and evidence — no generic rules engine, no admin mapping UI. AI runs only on uncovered segments; with AI off, the mapping plus manual entry remain the product. _(US-6, US-17 → AC-15)_
- **FR-17 Gemini pipeline (paid, schema-only).** Server-only; a Flash-Lite-class model is chosen by golden-set evaluation in M2 and pinned by model ID (candidate `gemini-3.5-flash-lite`; re-verified before build) on the **paid tier** with DPA. Default envelope has **no titles, paths, or URLs**: domain, app label, duration bucket, switch counts, workspace id, opaque member id, ≤ 100 candidate task names. Titles only after OQ-11/DPO approval and only through an explicit per-page employee action, never batched. Output must match a strict schema (`projectId` from allowed ids, `taskId|null`, `proposedTaskName|null`, `confidence` 0–1, start/end, evidence ≤ 140 chars), no tools, no free-text parsing, ≤ 2 retries, low temperature; untrusted titles cannot alter it; invalid output is discarded. _(US-6, US-17 → AC-16)_
- **FR-18 Task matching and dedupe.** Prefer existing `project_tasks` by normalized comparison (trim, collapse spaces, case-insensitive) and project inference; propose new names only when none exists. Tasks are created only on employee approval via `createTaskFn`; the unique `(workspace, project, name)` index collapses concurrent approvals. _(US-8 → AC-19)_
- **FR-19 Confidence policy.** Every suggestion shows confidence and short evidence; below the floor (default 0.5, Owner-adjustable within a product minimum) it reads "not enough evidence" with no approve action; confidence never auto-approves. _(US-6, US-7 → AC-17, AC-18)_
- **FR-20 Review queue.** Queue grouped by day/segment with time range, proposed project/task, confidence, and evidence (domains/categories, never raw history); approve, edit-then-approve, reject with a reason, snooze, or "this is personal"; rejected/snoozed items never resurface as approved. _(US-6, US-7 → AC-18)_
- **FR-21 Draft-only approval, no payroll write.** Approval prefills the manual-entry form via `createManualEntryFn`; the employee must save; tasks are created via `createTaskFn` only on approval. No time entry or payroll write exists before save; saved entries stay `entrySource = MANUAL`, carry an "AI-assisted" badge and suggestion link, and remain editable/deletable with audit and the suggestion link; the employee is author of record, the Owner owns policy, HR/payroll owns already-paid corrections. Undo exists only before save; no post-payroll undo is claimed. Save is idempotent (client mutation id + disabled button), so retry/double-click creates one entry. Time safety: active seconds only, merged segments, ≤ 30 min, `checkTimeEntryOverlapFn`, suggestion held while a timer runs, no second running timer. _(US-6, US-13 → AC-18)_
- **FR-22 Correction and feedback.** Edit/reject captures a structured reason (wrong project/task, not work, personal, duplicate, other) as a quality label for approval/correction metrics; labels never train third-party models and follow retention/deletion. _(US-7 → AC-20)_

**Manager, admin, and governance surfaces**

- **FR-23 Team-level aggregates only, k-anonymized.** Managers see team/department aggregates: captured/approved browser minutes, coverage % vs expected hours, approval/correction/rejection counts, and capture-health counts. **No per-member rows exist in v1**: every manager-visible metric, including capture health, is suppressed when the cohort is below the DPO-set k (proposed ≥ 5) or group-minus-objectors falls below k. No raw titles/domains/timelines, no drill-down, no ranking; access audited. _(US-9, US-13 → AC-21)_
- **FR-24 Owner/Admin policy console.** Enable/disable (fail-closed), notice text/version, exclusions, work-hours, per-class retention, AI off-by-default toggle and floor, cost cap/usage, devices/revoke, member delete/export, kill switch; every change is audited with actor, before/after, and timestamp. _(US-10, US-11, US-18 → AC-1, AC-24)_
- **FR-25 Audit trail.** Append-only audit for policy enable/disable, notice, acknowledgment/objection, pause/resume, exclusions, device pair/revoke/sign-out revoke, suggestion lifecycle, draft save, saved-entry edit/delete with link, retention purge, deletion/export, AI errors, and kill switch. Members see their own history; Owner/DPO query workspace events; records cannot be edited. _(US-10, US-12, US-20 → AC-23)_
- **FR-26 Retention, deletion, DSR.** Daily cron per class: raw events 14 d (titles only here; DPO confirms, OQ-3), segments 30 d, suggestions 90 d, AI run metadata 90 d (no payloads), audit per legal (proposed 1 y). Deletion removes activity/segments/suggestions/acknowledgments with an audit tombstone; export (JSON/CSV) supports DSRs; both ≤ 30 days. _(US-12, US-20 → AC-22)_
- **FR-27 Gemini data governance.** Paid tier only: paid terms provide no product-improvement use of inputs, and the contract must confirm no training; DPA; no identifiers in prompt/response logs; versioned prompts/schemas; API key in server secrets; §21 cross-border cover; DPO approves the field set (OQ-11) and the default envelope has no titles/paths/URLs (FR-17). _(US-12 → AC-16)_
- **FR-28 AI outage and cost controls.** AI is off by default and pauses without affecting capture/manual tracking; outage, quota, invalid output, or misconfiguration degrades to the learned mapping or "no suggestion" with bounded retries. Member/day and workspace/month caps are enforced from `ai_runs`; Owner alerted at 80%, AI pauses at 100% (capture continues). Cost estimate **$0.45–1.10/active user/month (est.)**, re-verified at the pinned model; caps are the control. _(US-17, US-18 → AC-24, AC-25)_
- **FR-29 Kill switch.** Workspace kill switch (plus platform emergency flag) stops ingest immediately server-side; each device applies it and clears its buffer at next network contact (≤ 60 s online; offline on reconnect), shows "monitoring disabled", and is audited; post-disable purge follows policy. _(US-19 → AC-12, AC-28)_

### 6.2 Non-functional requirements

- **NFR-1 Privacy guarantees (negative, release-gated).** No content, DOM, screenshots, OCR, keystrokes, clipboard, form values, audio, webcam, or other-app data is captured or transmitted. Excluded, incognito, failed, restricted, off-hours, paused, objected, and unacknowledged activity is never stored locally or server-side. No titles, domains, paths, tokens, or payloads in logs/Sentry — counters only. Titles are best-effort redacted; residual identifiers remain possible, are never manager-visible, never sent to AI by default, exist only in raw events, and can be reported/deleted. Privacy negative tests in CI are a release gate.
- **NFR-2 Capture overhead.** ≤ 2% average CPU, ≤ 100 MB memory, no perceptible page slowdown on a reference work laptop; event-driven capture only, no content scripts.
- **NFR-3 Flush and ingestion latency.** Flush every 60 s, so ingestion p95 ≤ 60 s after a segment closes (online); segments ready within 10 min; policy changes apply within 60 s of next contact; a suggestion batch p95 ≤ 15 s.
- **NFR-4 AI safety and quality.** 100% of accepted AI output validates against the JSON schema; malformed output rejected, never repaired; title injection cannot alter schema/tools/instructions; no model-provided URLs or tool calls; quality measured (approval, correction, golden set) before expansion.
- **NFR-5 Security and device trust.** Device tokens SHA-256 hashed, scoped, 180-day or ≤ 24 h fallback, revocable, never logged; TLS; server secrets never shipped; least privilege (no `<all_urls>`); a stolen token can only post its own device's activity and cannot read other members or write time entries. Titles may carry sensitive context; retention minimized, managers never see them, and none reach AI by default.
- **NFR-6 Legal and auditability.** DPIA, lawful-basis determination (counsel), notice wording, and DPO/counsel sign-off recorded before enablement/pilot; acknowledgment/objection immutable; DSR export/deletion ≤ 30 days with tombstones; retention enforced by cron and tested. Counsel decides; no legal conclusion asserted.
- **NFR-7 Cost control.** Spend measured per member/day and workspace/month from AI run records; caps enforced, 80% alerts, AI pauses at 100%, no fail-open path.
- **NFR-8 Reliability.** Buffer survives restart/update; acknowledged events not lost while online (> 99.5% target); MV3 termination handled by event-driven rehydration and 60 s heartbeat; version-skew warning; AI failure never degrades time tracking.
- **NFR-9 Accessibility.** Review queue, notice, indicator, pause, exclusions, and policy screens meet WCAG 2.2 AA (keyboard, screen reader, 200% zoom, no color-only status, focus order).
- **NFR-10 Observability.** Counters-only dashboards/alerts: ingestion failure > 5%/15 min, capture-health loss > 20% devices, AI failure > 20%/15 min, cost 80/100%, retention lag > 26 h, 403 spikes; no titles, domains, tokens, or payloads.

## 7. Acceptance Criteria

Privacy negative tests are acceptance criteria, not footnotes. Each AC is testable with network inspection, extension automation (Playwright `--load-extension`), database queries, or UI scripts.

1. **Privacy gate** [FR-1, FR-24] — _Given_ monitoring off, _when_ an Owner enables without the recorded DPIA/DPO/counsel reference, notice, work-hours, retention, exclusions, and AI mode, _then_ enablement is blocked and audited; _when_ all exist, _then_ it enables and writes an audit record.
2. **Notice, acknowledgment, objection** [FR-2, FR-3] — _Given_ an unacknowledged device, _when_ used, _then_ no event is written or uploaded and the extension shows "needs acknowledgment"; after acknowledgment capture starts within one heartbeat; _when_ the member objects, _then_ capture stops for that member only, is audited, no notification/ranking/manager alert/permission change follows, tracking keeps working, and the notice names the procedure.
3. **Indicator visibility** [FR-4, FR-8] — _Given_ active capture, _when_ the extension or app is opened, _then_ both show state, account, workspace, and device; no setting, code path, or manager action can hide it.
4. **Pause discards before write** [FR-5] — _Given_ active capture, _when_ the employee pauses, _then_ within 5 s no new event is written, pending unflushed capture is purged, no batch is sent after pause, the state shows paused, and the pause is audited.
5. **Exclusions never stored** [FR-6] — _Given_ a domain on the mandatory, workspace, or employee-local list, _when_ visited, _then_ no event is created locally (before write), uploaded, or stored server-side; the local list is never uploaded or shown to managers.
6. **Ignored surfaces and off-hours never stored** [FR-7, FR-11] — _Given_ incognito, `chrome://`, devtools, Web Store, `file://`, unreadable PDFs, failed captures, and 21:00 browsing outside 08:00–18:00, _when_ used, _then_ no events/titles/domains are written or sent, and the server rejects out-of-window segments.
7. **Minimization and sanitization** [FR-8, FR-9] — _Given_ a URL with query, fragment, credentials, and a title containing an email, long ID, and injected instruction, _then_ only the domain is stored by default (path only if opted in), titles are sanitized with patterns redacted, no content is read, and nothing unsafe reaches AI.
8. **Idle trimming** [FR-10] — _Given_ no input beyond the threshold, _when_ segments are produced, _then_ idle is excluded, the segment ends at idle start, and suggested minutes exclude idle time.
9. **Work-hours enforcement** [FR-11] — _Given_ a configured window, _when_ a segment outside it is submitted directly to ingest, _then_ the server rejects it and stores nothing.
10. **Device trust, sign-out, revocation** [FR-12, FR-14] — _Given_ a pairing code, _then_ a hashed, scoped token is stored and plaintext appears once; _when_ revoked/disabled, _then_ ingest rejects immediately and the device applies it and clears its buffer at next contact (≤ 60 s online) with an audit record; _when_ the member signs out or switches account, _then_ the server hook revokes their device tokens and the extension clears on 401; one-profile-per-employee is documented and policy-enforced.
11. **Buffer, batching, idempotency** [FR-13] — _Given_ offline buffered events, _then_ the buffer survives restart, is capped at 24 h/1,000 events with a warning, and on reconnect all events arrive once; re-sending a `batchId`/`segmentKey` creates no duplicates; overlarge/malformed requests are rejected.
12. **Policy sync and kill switch** [FR-13, FR-29] — _Given_ an active workspace, _when_ the Owner flips the kill switch, _then_ ingest rejects immediately and each online device applies it and clears its buffer within 60 s (offline on reconnect), shows "monitoring disabled", and is audited; same for pause/enable/AI changes.
13. **Capture health visibility** [FR-14] — _Given_ an enrolled device with no heartbeat for 30 min, _then_ its employee and admins see "inactive"; it is not counted as captured.
14. **Segmentation bounds** [FR-15] — _Given_ idle gaps, domain switches, and a 2 min gap, _when_ segmented, _then_ segments are 5–10 min, split correctly, capped at 30 min, contain redacted fields only, and raw events are never manager-visible.
15. **Learned mapping first** [FR-16] — _Given_ a domain with a prior approved mapping, _when_ a segment closes, _then_ a mapping-based suggestion is produced without an AI call; AI is called only for uncovered segments, and with AI disabled the mapping plus manual entry still work.
16. **Gemini schema and envelope** [FR-17, FR-27] — _Given_ a title with prompt-injection text, _when_ Gemini responds, _then_ only schema-valid candidates are accepted, no instruction/tool/URL changes behavior, invalid output is discarded with ≤ 2 retries, paid-tier/DPA/no-training is verified, and the payload fixture has no title, path, URL, or content fields by default.
17. **Low confidence and no autonomy** [FR-19] — _Given_ a suggestion below the floor, _then_ it shows "not enough evidence" and no approve action; no time entry, task, or payroll write occurs before human approval.
18. **Approve prefills a draft only; saved entries stay editable** [FR-20, FR-21] — _Given_ a suggestion, _when_ approved, _then_ the manual-entry form opens prefilled and AI-assisted, no `time_entries` row exists until save, and on save `entrySource = MANUAL` with a suggestion link; rejecting creates nothing; _given_ a running timer or overlap, _then_ the suggestion is held/conflict shown and no second timer exists; _given_ a double-click/retry, _then_ one entry exists; _given_ a saved AI-assisted entry, _then_ the employee can edit/delete it with audit/link, and undo exists only before save.
19. **Task dedupe** [FR-18] — _Given_ existing task "Client onboarding", _when_ "client Onboarding " is approved, _then_ the existing task is used; _when_ two approvals race on a new name, exactly one task exists and both suggestions reference it.
20. **Correction feedback** [FR-22] — _Given_ an employee edits the suggested task and saves, _then_ the correction reason is recorded, appears in quality metrics, and follows retention/deletion.
21. **Team-level aggregates only, k-anonymized** [FR-23] — _Given_ a manager, _when_ requesting team views or APIs, _then_ responses contain only team aggregates and capture-health counts; a cohort below the configured k (proposed ≥ 5) or group-minus-objectors below k returns "suppressed" with no numbers; no per-member row exists; raw titles/domains/timelines are denied and audited.
22. **Retention, deletion, export** [FR-26] — _Given_ data past its class retention, _when_ the daily cron runs, _then_ it is purged per class while audit follows its schedule; _when_ a DSR asks for export or deletion, _then_ export completes and deletion removes activity/segments/suggestions/acknowledgments with a tombstone, within target.
23. **Audit completeness** [FR-25] — _Given_ any enablement, notice, acknowledgment, objection, pause, exclusion, pairing/revoke/sign-out revoke, suggestion, approval, edit/delete, deletion, purge, or kill-switch action, _then_ an immutable audit event exists with actor, action, and time; members see their own history.
24. **Cost caps and alerts** [FR-28] — _Given_ configured caps, _when_ spend reaches 80%, _then_ the Owner is alerted; at 100% AI pauses while capture continues; no path exceeds the cap.
25. **AI outage keeps capture** [FR-17, FR-28] — _Given_ Gemini is unavailable, slow, or misconfigured, _then_ mapping fallback or no suggestion is shown, capture and manual entry continue, retries are bounded, and no data is lost.
26. **Logs are counters-only** [NFR-1, NFR-10] — _Given_ ingestion, AI, and error paths, _when_ logs/Sentry fixtures are inspected, _then_ they contain counters and ids only — no titles, domains, tokens, or payloads.
27. **Accessibility** [NFR-9] — _Given_ keyboard-only and screen-reader use at 200% zoom, _then_ notice, queue, pause, exclusions, and policy screens are operable and status changes are announced.
28. **Offline revoke** [FR-12, FR-29] — _Given_ a device offline when it is revoked or the workspace is disabled, _when_ it reconnects, _then_ ingest returns 401/403, no new activity is uploaded, the buffer is cleared, no capture occurs until re-pairing, and the event is audited.

## 8. Out of Scope

- **Screenshots, screen recording, OCR, page content, DOM capture** — out (permanent).
- **Keylogging, clipboard capture, form-field capture, audio or webcam capture** — out.
- **Desktop app/window monitoring in v1** — Windows agent is separate phase 2 (+10–16 dev-weeks); macOS out.
- **Live screen viewing, manager activity feed/timeline, per-domain drill-down** — out; manager data is team-level aggregate only.
- **Productivity scoring, ranking, leaderboards, focus scores, disciplinary automation** — out.
- **Personal-device monitoring, off-hours capture, monitoring outside the work-hours window** — out.
- **Auto-posting, auto-saving, auto-approval, or any AI write without employee save** — out.
- **Autonomous task creation** — a task exists only after the employee approves it via `createTaskFn`.
- **An AI `entrySource` enum value in v1** — entries stay `MANUAL` with a suggestion link.
- **URL queries, fragments, credentials, or full paths by default** — path is opt-in and never sent to AI.
- **Browser history import, tab content, unapproved fields to Gemini, or AI-provided URLs/tools** — out.
- **Training or fine-tuning models on employee data**, or sharing it for product improvement — out contractually and technically.
- **Public monitoring API** or exposure through `/api/v1` — out.
- **Stealth/hidden capture, blocked pause/objection, or a hideable indicator** — out.
- **Mobile/PWA, Firefox/Safari, or multi-browser capture** — out.
- **Per-member manager monitoring metrics, raw activity visibility, or ranking** — out.
- **Sync engine/CRDT, new payroll API, Kafka/Redis, or bought surveillance SaaS** — out; the existing stack is reused.

## 9. Assumptions

- **A1** Stakeholder direction fixed 2026-11-05: metadata-only; Chrome v1 (Windows agent phase 2, macOS out); suggestions-only with employee approval; workspace-mandated with notice, acknowledgment, objection, pause/exclusions, and DPIA.
- **A2** The lawful basis is **for counsel to determine** (candidate: legitimate interest, RA 10173 §12(f); whether consent is required for any category, including sensitive PI, is open). The product supports notice, acknowledgment, objection, and consent capture where counsel requires it; no notice names a basis before approval (OQ-1/OQ-2).
- **A3** The MV3 extension can add `tabs`, `idle`, and `alarms` via enterprise force-install or Web Store review; `tabs` triggers a "read your browsing history" warning that IT/communications must explain.
- **A4** Employees work in Chrome on managed laptops during a defined work window; browser-only coverage is accepted as partial.
- **A5** Paid Gemini terms with a DPA are obtainable and DPIA-approved; paid terms provide no product-improvement use of inputs, and the contract must confirm no training.
- **A6** Approved suggestions use the existing manual-entry path; `entrySource` stays `MANUAL` with a suggestion link; no new payroll write path.
- **A7** Manager needs are met by **team-level** aggregates only; the DPO sets k (proposed ≥ 5) and groups minus objectors below k are suppressed. No per-member monitoring metrics exist in v1.
- **A8** Effort is **9.5–15 dev-weeks (est.)**, one senior engineer familiar with the repo, excluding DPIA/legal/consultation, store review, distribution, device procurement, and pilot calendar; the learned-mapping scope keeps this unchanged. **Engineering §13 is the source of truth** for the plan and estimate; research's 4–6 wk (capture) and 6–10 wk (Windows) are pre-scope slices, not comparable totals. Windows agent: +10–16 dev-weeks, separate phase 2.

## 10. Dependencies

- **Research (final)** — [platform-feasibility.md](research/platform-feasibility.md): MV3 limits, desktop feasibility, Gemini tier/terms/cost, PH legal analysis.
- **Engineering (final)** — [implementation-analysis.md](engineering/implementation-analysis.md): capture client, token ingestion, 9-table model, AI pipeline/cost, safe approval path, M0–M4, do-not-build, risks.
- **DPO / legal counsel** — DPIA, lawful-basis determination (not pre-judged), notice/acknowledgment/objection wording, retention, DSR SLA, Gemini processor/cross-border clauses; sign-off is a hard gate.
- **Google Cloud / Gemini** — paid tier, DPA, region/processing terms, billing, no-training confirmation.
- **Store / policy disclosure** — force-install or Web Store privacy disclosure (single purpose, captured fields, retention, manager visibility, objection; `tabs` warning explained on first run) is an M0 gate.
- **Sign-out revoke hook** — app sign-out must call a server-side revoke for the member's device tokens; Better Auth logout does not revoke them today.
- **IT / security** — distribution, secrets, device management, token revocation, incident response.
- **Owner / Admin** — notice, exclusions, work-hours, retention, AI mode, caps, enablement.
- **Employee representatives / HR** — consultation, objection handling, communications.
- **Existing platform** — extension, `createManualEntryFn`/`createTaskFn`, `audit_logs`/`activity.view`, toggles, `project_tasks` unique index, `entrySource`, cron/`CRON_SECRET`, Sentry.

## 11. Open Questions

| #     | Question                                                                                         | Owner                | Deadline   | Default if undecided                                                                      |
| ----- | ------------------------------------------------------------------------------------------------ | -------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| OQ-1  | **Blocking:** DPIA + lawful basis + DPO/counsel sign-off before production capture/pilot.        | DPO / counsel        | 2026-11-19 | No enablement; no pilot; code only in dev                                                 |
| OQ-2  | Notice/acknowledgment wording, objection/decline handling, and whether metadata is sensitive PI. | DPO + counsel + HR   | 2026-11-19 | Feature disabled until approved; product records objection only                           |
| OQ-3  | Retention per class (raw/segments/suggestions/audit) and DSR SLAs.                               | DPO + Owner          | 2026-12-03 | 14 d raw, 30 d segments, 90 d suggestions, 1 y audit; export/delete ≤ 30 d                |
| OQ-4  | Distribution: force-install vs Web Store; privacy disclosure and `tabs` warning.                 | IT                   | 2026-11-19 | M0 gate: no pilot until disclosure approved; force-install if needed                      |
| OQ-5  | Work-hours defaults and timezone/day handling.                                                   | Owner + DPO          | 2026-11-26 | Feature disabled until configured (fail closed)                                           |
| OQ-6  | Manager aggregate scope and minimum group size k.                                                | Lead + DPO           | 2026-12-03 | Team-level only; k ≥ 5 proposed; group-minus-objectors < k suppressed; no per-member rows |
| OQ-7  | AI budget: member/day + workspace/month caps, alert owners, 100% behavior.                       | Owner / finance + IT | 2026-12-10 | Caps required at enablement; AI pauses at 100%                                            |
| OQ-8  | Employee consultation process and representative sign-off before pilot.                          | Lead + HR            | 2026-12-03 | No pilot without consultation                                                             |
| OQ-10 | Windows agent phase-2 scope, budget, timing; macOS explicitly out.                               | Lead + IT            | 2027-01-15 | Separate project after v1 pilot; never added to v1                                        |
| OQ-11 | Gemini field set: whether any title may ever be sent, and under what per-page action.            | DPO + engineering    | 2026-12-03 | No titles/paths/URLs; domains, app labels, durations, switches only                       |
| OQ-12 | Gemini contract: §21 cross-border, region, prompt retention, DPA.                                | DPO + IT + counsel   | 2026-12-03 | No production AI until resolved; rules-only fallback                                      |

## 12. Strategy Decision

**Decided (evidence-backed by research §9 and engineering §3–§10): A1 — extend the existing MV3 Chrome extension for metadata-only capture, run the learned domain→project mapping first, then paid server-side Gemini suggestions, and require employee approval before anything becomes a draft. Windows agent is separate phase 2; macOS out; no screenshots or content.**

- **Capture:** `tabs` + `idle` + `alarms`, no `<all_urls>`/content scripts, incognito `not_allowed`; domain by default, path opt-in, sanitized titles; 60 s heartbeat/flush; pause, exclusions, work-hours, and kill switch enforced before write and server-rechecked.
- **Ingestion and trust:** token-authenticated `POST /api/activity/ingest` route (not a cookie `createServerFn`) with a pairing code → SHA-256-hashed, scoped, revocable token (180-day or ≤ 24 h fallback); 9 tables; idempotent batches; sign-out revoke hook; counters-only logs/Sentry.
- **AI:** learned mapping from prior approvals first; a Flash-Lite-class paid model chosen by golden-set evaluation in M2 (candidate `gemini-3.5-flash-lite`), pinned by model ID in config, server-only, strict schema, no tools, minimized envelope with **no titles/paths/URLs** by default, untrusted titles; AI off by default; member/workspace caps; outage falls back to the mapping/manual.
- **Human last:** suggestions-only; approval prefills `createManualEntryFn` or creates an approved task via `createTaskFn`; the employee saves; entries stay `entrySource = MANUAL` with a suggestion link, remain editable/deletable with audit, and no post-payroll undo is claimed. No auto-post/auto-approve/AI-created task.
- **Legal posture:** the basis is **for counsel to determine** (candidate legitimate interest; §11 notice, §16 rights, acknowledgment, objection, minimisation); the product supports consent capture where counsel requires it, and no notice names a basis before approval. DPIA and DPO/counsel sign-off are a hard gate.
- **Estimate:** **9.5–15 dev-weeks (est.)** for M0–M4 (M0 1–1.5, M1 2.5–4, M2 2–3, M3 2.5–4, M4 1.5–2.5), one senior engineer familiar with the repo. **Engineering §13 is the source of truth**; research's 4–6 wk and 6–10 wk are pre-scope slices. Gemini cost estimate **$0.45–1.10/active user/month (est.)**, controlled by caps. Windows agent **+10–16 dev-weeks, separate project**.
- **Why A1:** least data that still removes typing; reuses the extension and manual-entry path; keeps payroll human; avoids screenshot/content exposure. Rejected: screenshots/OCR, desktop capture in v1, auto-posting, bought surveillance SaaS, free-tier Gemini, no-AI-only rules (mapping is the fallback).
- **What would reopen it:** counsel rejecting metadata capture or the basis (→ opt-in or stop); Gemini DPA/region failure (→ mapping-only/on-device, never free tier); `tabs` rejected (→ alternative distribution/reduced capture); coverage complaints dominating (→ phase-2 Windows with DPIA annex); golden-set acceptance < ~50% (→ invest in mapping); any sensitive-title incident (→ domain-only, re-run DPIA); auto-post requested (→ reject).
- **Evidence:** [research §§1, 5–9](research/platform-feasibility.md) · [engineering §§0, 3–10, 15](engineering/implementation-analysis.md).

## 13. Delivery Phases

Names, order, and ranges mirror the engineering report verbatim. **Total v1: 9.5–15 dev-weeks (est.)**, one senior engineer; excludes DPIA/legal/consultation, store review, distribution, device procurement, and pilot calendar. Windows agent is phase 2, a separate project (**+10–16 dev-weeks**), never added to this total.

- **M0 — Decisions, spikes, privacy gate (1–1.5 wk est.).** DPIA scope/notice/retention, lawful basis, distribution + store/force-install privacy disclosure (with the `tabs` warning explained), Gemini terms; spikes for MV3 capture/service-worker restart, ingest, pairing, Gemini schema/cost, install; threat model. Gate: spikes written, decisions recorded, no production capture, permissions fixed, DPIA/DPO path and disclosure approved.
- **M1 — Capture, device trust, ingestion (2.5–4 wk est.).** Capture/sanitize/segment/buffer/batching/pause/exclusions/work-hours; pairing, hashed tokens, sign-out revoke hook; ingest + 9 tables + idempotency + limits; acknowledgment gate; retention cron; privacy tests. Gate: AC-2 to AC-12, AC-26, AC-28 green; no data before acknowledgment; revoke/kill stop ingest immediately with next-contact device apply.
- **M2 — Segments + Gemini (2–3 wk est.).** Segmentation/grouping, learned mapping, prompt/schema/validation, model pin via golden set, caps and `ai_runs`, fallback, cache. Gate: AC-14 to AC-17, AC-25 green; schema-valid or rejected; injection-proof; outage keeps capture; cost within caps.
- **M3 — Review, approve, policy UX (2.5–4 wk est.).** Review queue; approve → prefilled manual entry plus optional task approval; dedupe/overlap/idle; undo/reasons; policy console; devices; notice/ack/objection; team k-anonymous aggregates; DSR export/delete. Gate: AC-1, AC-13, AC-18 to AC-24, AC-27 green; draft only; zero payroll rows before save; no duplicate tasks; no per-member or raw manager fields.
- **M4 — Hardening, rollout, measurement (1.5–2.5 wk est.).** E2E + privacy-negative + golden-set gates; load tests; flags/kill-switch/DSR drills; packaging/privacy text; staged rollout (internal → one-team pilot for one pay period → limited → workspace); runbook. Gate: all ACs; drills pass; pilot metrics and cost measured; code review proves no auto-write path.
- **Phase 2 (separate, not in v1): Windows agent +10–16 dev-weeks (est.).** Win32 foreground window + idle, tray/service app, secure local store, reuse of ingestion/suggestion contracts, signed MSI + auto-update + Intune/MDM, desktop coverage, privacy review and DPIA addendum; gated on the v1 pilot and a measured coverage gap (OQ-10). macOS out.

## 14. Rollout & Measurement

**Rollout stages (gated, reversible):** DPIA + counsel sign-off + notice/consultation + Gemini contract + store/enterprise privacy disclosure (single purpose, captured fields, retention, manager visibility, objection; the `tabs` "read your browsing history" warning explained) → internal opt-in dogfood (2–4 weeks, same notice/acknowledgment) → one-team pilot (one pay period, weekly feedback, aggregate-only managers) → limited expansion → full workspace. Any privacy incident stops rollout; kill switch and purge are drilled per stage.

**Measurement (baselines are placeholders; instrument first):**

| Metric                                         | Baseline             | Target (label)                                 |
| ---------------------------------------------- | -------------------- | ---------------------------------------------- |
| Browser-attributable time approved             | Unknown — instrument | ≥ 30% of captured browser time (target)        |
| Encoding minutes per employee/week             | Unknown — instrument | ↓ 50% vs baseline (target)                     |
| Suggestion approval rate                       | Unknown — instrument | ≥ 70% (target)                                 |
| Correction rate after approval                 | Unknown — instrument | ≤ 10% (target)                                 |
| Golden-set classification accuracy             | Unknown — instrument | Measured and reviewed; no target asserted      |
| Duplicate tasks or entries created             | 0                    | 0                                              |
| Captured vs uncaptured browser time (coverage) | Unknown — instrument | Reported with a "browser activity only" caveat |
| Pause / objection usage                        | Unknown — instrument | Trust signal, reported; no reduction target    |
| Gemini cost per active user/month              | Unknown — instrument | Within caps; estimate $0.45–1.10 (est.)        |
| Privacy incidents / over-collection            | 0                    | 0                                              |

**Release gates:** privacy negative tests green; DPIA + counsel sign-off recorded; kill-switch, revoke, retention, and DSR drills pass; audit reviewed by DPO; overhead and AI cost within bounds; golden set and pilot metrics reviewed; code review confirms no auto-write path.

## 15. Support & Operations

- **Kill switch and over-capture incident:** Owner flips the kill switch (ingest stops immediately; devices apply at next contact ≤ 60 s online; buffers clear); IT/DPO run the runbook — disable AI, revoke devices, purge activity data, notify DPO, preserve audit counters, notify employees per counsel; root-cause and DPIA review before re-enable.
- **Device lifecycle:** IT lists paired devices with last-seen/status; revoke a lost or reassigned device (ingest rejects immediately; the device clears on next contact); app sign-out calls the server revoke hook; shared-device account switch clears the buffer and forces re-pairing/acknowledgment; one Chrome profile per employee is assumed and policy-enforced.
- **Data-subject requests:** DPO or Owner triggers export (JSON/CSV) or deletion per member; export covers that member's activity/segments/suggestions/acknowledgments; deletion removes data and keeps a tombstone; both ≤ 30 days and audited.
- **AI outage:** AI pauses without blocking capture; mapping and manual entry continue; UI shows "AI unavailable"; bounded retries; caps/alerts stay active.
- **Extension update/compatibility:** version-skew warning, heartbeat/version telemetry, event-driven SW rehydration, staged release with rollback; approved force-install or Web Store path.

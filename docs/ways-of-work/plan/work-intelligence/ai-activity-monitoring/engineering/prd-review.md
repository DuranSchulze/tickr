# PRD v2 adversarial review — privacy & payroll

**Reviewed:** PRD v2 (29 FR / 10 NFR / 22 US / 27 AC), epic, research, engineering; verified against the repo (extension manifest/SW, Better Auth sign-out, manual-entry/task fns, overlap check, `project_tasks` unique index). **Verdict:** strategy, mechanism counts, 60 s flush, WebCrypto honesty, `MANUAL`+link, M0–M4, 9.5–15 and separate Windows +10–16 are consistent. **4 blockers, 10 majors**; all are wording/scope/gate fixes.

## 1. Traceability (mechanical)

- Counts exact; **no dangling** `FR/US/AC/NFR` ids; all 22 US referenced by ≥1 FR; every FR has ≥1 AC; AC-26/27 are NFR-only ACs (fine).
- **Wrong mapping:** FR-3 (objection) cites AC-21 (manager aggregates) — should cite AC-2 only. FR-24 (policy console) maps only AC-1/AC-24 though it also covers exclusions, work-hours, retention, devices, kill switch.
- **Phase gates reference later UI:** M1 gate (260) needs AC-1 (enablement console) and AC-10 (device list); M2 (261) needs AC-24 (cost-cap console) — M3 work.

## 2. Blockers

**B-1 — k-anonymity contradicts the OQ-6 default (FR-23 line 122, AC-21 line 169, OQ-6 line 232, A7 line 209).** "Per-member aggregates for direct reports" is individual data; a one-person cohort cannot be k-anonymous, and per-member capture-health/approval counts expose compliance. **Fix:** OQ-6 default → "Team/department aggregates only; suppress cohorts below the DPO-set k; **no per-member monitoring metrics in v1** (a per-member view needs its own lawful-basis decision)." FR-23 add: "Suppression applies to every manager-visible metric, including capture health, approval and correction counts; no per-member view exists." AC-21 add: "A cohort below k returns 'suppressed' with no numbers, including capture-health counts."

**B-2 — "Revoke/kill switch within 60 s" is false for offline devices (FR-12 105, AC-10 158, FR-29 128, AC-12 160).** **Fix:** "Revocation/kill switch apply at the **next network contact/policy sync** (≤60 s online); offline devices cannot be reached — the server rejects further ingest immediately and the buffer clears on next contact. UI shows revoked/disabled." Add AC: "offline device → revoke → reconnect → ingest 401, buffer cleared, no new capture."

**B-3 — Sign-out / shared-profile clearing is not enforceable as written (FR-12 105; US-15 77; AC-10 158).** The extension cannot see an app sign-out in a normal tab, and Better Auth sign-out does not revoke device tokens. **Fix:** add a **server-side sign-out hook that revokes the member's device tokens** (or ≤24 h TTL + app re-pair); extension clears on 401; add to §10 and AC-10. Residual: managed-device policy must require one Chrome profile per employee.

**B-4 — Gemini envelope ambiguous about titles/paths (FR-9 102, FR-15 111, FR-17 113, FR-27 126, OQ-11 237).** FR-17 says "redacted segments", FR-27 lists titles as possible, OQ-11 says titles not sent; title storage is unstated. **Fix:** "Default envelope = domain, app label, duration bucket, workspace id, opaque member id, candidate task names. **No titles, no paths, no URLs.** Titles only after OQ-11 approval and only via an explicit per-page 'suggest from this page' action, never batched; stored only in raw events (OQ-3), never manager-visible." AC-16 add: "payload fixture contains no title/path/identifier fields."

## 3. Majors

- **M-1 Legal wording pre-judges the basis (v2 delta line 7, A2 line 204, §12 line 249, FR-2 line 95).** "not employee consent" and "consent only for sensitive PI" are conclusions while counsel decides. **Fix:** "Candidate basis: counsel to determine (legitimate interest vs consent; sensitive-PI determination is open, OQ-2). No user-facing notice may name a basis until DPO/counsel approve."
- **M-2 No undo/accountability/edit-delete clause for saved AI-assisted entries (FR-21 line 117, AC-18 line 166; "undo" appears only in M3 line 262).** **Fix:** add to FR-21 + AC-18: "Saved entries are ordinary `MANUAL` entries the employee may edit/delete; `ENTRY_EDIT`/`ENTRY_DELETE` audited with the suggestion link; the employee is author of record, the Owner owns policy, HR/payroll owns corrections of already-paid errors. Undo exists only before save (cancel draft) — no post-payroll undo claim."
- **M-3 No AC for overlap/running-timer (FR-21 line 117, AC-18 line 166).** Add: "_given_ an overlapping or currently-running timer, _then_ approval shows the conflict / holds the suggestion, and no duplicate running timer exists."
- **M-4 Double-save can duplicate entries (FR-21 line 117, AC-18 line 166).** `createManualEntryFn` has no idempotency key. **Fix:** disable save while submitting + pass a client mutation id to `createManualEntryFn` (reuse the offline-replay idempotency field if it ships, else a pre-insert uniqueness check); AC: "two rapid saves produce exactly one entry; approval transition is idempotent."
- **M-5 Rules-first is new scope and estimates are not reconciled (FR-16 112, AC-15 163, M2 261, estimate 250/257; research 102/112).** Engineering M2 sized only the prior-approved-mapping fallback. **Fix:** define "workspace mapping" as existing member-approved history only, with no admin UI (fits 9.5–15); otherwise add +0.5–1 wk (10–16). Add to §10: "Research's 4–6 (A1) and 6–10 (Windows) are [assumption] slices, not comparable totals; 9.5–15 is end-to-end and Windows +10–16 separate."
- **M-6 Phase/AC ownership (M1 260, M2 261, M3 262).** M1 → AC-2…12, AC-26; M2 → AC-14…17, AC-25; M3 → AC-1, AC-18…24, AC-27; M4 → all.
- **M-7 Model name pinned before evaluation (FR-17 113, A5 207, research 65).** Engineering said 2.5 Flash; PRD/research say `gemini-3.5-flash-lite`. **Fix:** "Pin in M2 by golden-set evaluation among current paid flash-class models; the named model is a candidate, not a contract; verify availability/pricing and recompute cost (basis $0.30/$2.50 per 1M)."
- **M-8 Store/policy disclosure missing (A3 205, FR-8 101; research §3 CWS 2026).** Add a release gate: "store listing (or enterprise policy notice) states single purpose, capture fields, retention, manager visibility and objection; first-run notice explains the `tabs` warning; CWS 2026 single-purpose/prominent-disclosure satisfied — or enterprise force-install with documented notice."
- **M-9 Residual title leakage under-stated (FR-9 102, NFR-1 132).** Redaction cannot remove client/patient/person names. State: "titles are best-effort redacted; residual identifiers remain possible; titles are never sent to AI by default, stored only in raw events (OQ-3), never manager-visible; any sensitive-title incident switches to domain-only and re-runs the DPIA."
- **M-10 No AC for "objection/pause has no product consequence" (FR-3 96, AC-2 150).** Add to AC-2: "no automated notification, ranking, manager alert or permission change results from an objection/pause; notice names the objection procedure/contact." Employment consequences stay outside the product (OQ-9).

## 4. Minors

- FR-8 "idle (`chrome.idle`, 60 s)" vs FR-10's 5-min threshold — say "detection interval 60 s; idle threshold 5 min".
- Cost rule: label "basis: research-listed flash-class rates, recomputed at the pinned model".
- "k-anonymous": say "k-anonymised when k ≥ DPO minimum" until OQ-6 fixes k.

## 5. Verified consistent (no action)

Extension-only, no `<all_urls>`/content scripts, incognito `not_allowed`, `tabs` warning disclosed; 60 s flush; two-sided sanitizer; exclusions before write; token pairing/hash/scope/revoke; MV3 rehydration; work-hours server re-check; shared-device clear intent; coverage-gap labels; no screenshots/content/desktop/auto-post/ranking/AI-entrySource creep; privacy negative tests are release gates; 9.5–15 and separate Windows +10–16 consistent.

## 6. Engineering doc updated

`implementation-analysis.md`: model pinned by evaluation (PRD candidate `gemini-3.5-flash-lite`); phase gates re-pointed to PRD v2 ACs; §15 reconciled (rules-first +0.5–1 wk or scope to learned mapping; research 4–6/Windows 6–10 are slices).

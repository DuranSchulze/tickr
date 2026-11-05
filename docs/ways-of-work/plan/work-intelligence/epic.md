# Epic — Work intelligence: transparent activity monitoring with AI-assisted time encoding

**Epic ID:** `work-intelligence` · **Status:** Final (PRD v3) · **Date:** 2026-11-05
**Product:** Trackly (internal time tracking + payroll reporting, Duran File Pino)
**Owner:** Product (PM) · **Stakeholder proxy:** Lead · **Research:** Researcher · **Engineering:** Lazy Developer

Add transparent, metadata-only browser activity capture and AI-assisted task/time suggestions to Trackly so employees stop losing billable time and stop hand-encoding entries — without turning the product into covert surveillance or letting a language model touch payroll unattended.

---

## 1. Context

Trackly today is manual: employees run a timer or type entries against clients, projects, and tasks, and managers review timesheets built from that data. The firm ships a passive Chrome MV3 extension (`extension/`): permissions are `sidePanel`, `storage`, `activeTab`, `scripting`; `background.js` only opens the panel and sets a timer badge; `sidepanel.js` captures the active tab's title and URL once, into `chrome.storage.session`, and skips `chrome://` pages. There is no activity history, no device registry, no acknowledgment model, and no AI code anywhere in the repo.

The platform already provides most of what this needs: `createManualEntryFn` and `createTaskFn`, an append-only `audit_logs` table with `activity.view`, per-workspace toggles (`workspaces.locationTrackingEnabled` is the precedent), a trusted extension origin (`CHROME_EXTENSION_ORIGIN`), the unique index on `project_tasks (workspace, project, name)`, `entrySource` (`TIMER`/`MANUAL`), cron with `CRON_SECRET`, and Sentry.

Stakeholder direction is fixed (2026-11-05): **metadata only**; **Chrome only** in v1 (Windows agent is a separate phase-2 project, macOS out); **suggestions only** (Gemini proposes; the employee approves; approval only prefills a draft; no silent payroll posting); **workspace-mandated monitoring** on a lawful basis of legitimate interest with §11 notice, recorded acknowledgment, an objection route, pause/exclusions, and DPO/counsel sign-off including a DPIA.

## 2. Problem

1. **Billable time leaks.** Web work is fragmented across tabs and client systems; employees reconstruct hours from memory, and remembered time is systematically low.
2. **Encoding is expensive.** Typing task names and time ranges is administrative work that produces no billable value and is easy to get wrong.
3. **The firm cannot see coverage.** There is no honest measure of how much browser work became captured time, so "where did the week go?" is answered by guesswork.
4. **Surveillance risk is real.** Metadata such as tab titles, domains, and paths reveals health, legal, banking, HR, and job-search activity. Monitoring can chill trust or become a ranking tool; privacy has to be architectural, not a caveat. The scope is also **inherently partial**: browser-only capture cannot see Excel, email clients, native apps, or mobile work, so every surface must say "browser activity only".
5. **AI can corrupt payroll.** A confident-but-wrong model that posted entries would create payroll errors and disputes. It must never act without a human.

## 3. Business value

- **Recover billable time** that is currently never written down, and reduce end-of-day reconstruction.
- **Reduce encoding effort** with reviewed, evidence-backed suggestions instead of typed entries.
- **Trustworthy reporting** — captured plus approved data, with visible coverage instead of implied completeness.
- **Trust as the moat** — transparent capture, employee control (pause, exclusions, objection), and no covert features are why staff will accept the feature at all.
- **Low-cost reuse** — the existing extension, manual-entry path, task creation, audit log, RBAC, and toggles carry most of the build; no new payroll path.

## 4. Pillars

| Pillar                        | Meaning                                                                                                     | Guardrail                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Privacy by design**         | Collect the least metadata that produces a useful suggestion; no content, screenshots, keys, or clipboard.  | Excluded/incognito/off-hours/objected activity is never persisted; counters-only telemetry. |
| **Transparency & objection**  | Visible indicator, §11 notice, recorded acknowledgment, pause, layered exclusions, objection route.         | No capture before acknowledgment; indicator cannot be hidden; no stealth mode.              |
| **Accuracy & payroll safety** | Deterministic rules first, schema-only AI second, human approval last; evidence and confidence shown.       | No autonomous writes; drafts only; duplicate task names impossible; every approval audited. |
| **Low-cost reuse**            | Existing MV3 extension, TanStack app, manual-entry/task functions, audit log, `project_tasks` dedupe index. | No new payroll path, no second ingestion product, no native agent in v1.                    |

## 5. Outcomes & metrics

All targets are **targets to validate**, not current performance. Baselines marked "unknown" are instrumented in M0; no number is quoted as fact. All coverage metrics carry the **"browser activity only"** caveat, and all manager-facing metrics are **team-level only** (no per-member rows; k-anonymity).

| Outcome              | Metric                                                             | Baseline                   | Target (label)                                  |
| -------------------- | ------------------------------------------------------------------ | -------------------------- | ----------------------------------------------- |
| Time recovered       | Approved AI-assisted minutes per active employee per week          | Unknown — instrument first | ≥ 30% of captured browser time (target)         |
| Less encoding effort | Median minutes spent encoding per employee per week                | Unknown — instrument first | ↓ 50% vs baseline (target)                      |
| Suggestion quality   | Suggestions approved without edit ÷ suggestions shown              | Unknown — instrument first | ≥ 70% (target)                                  |
| Correction honesty   | Approved suggestions later corrected ÷ approved                    | Unknown — instrument first | ≤ 10% (target)                                  |
| Model quality        | Golden-set classification accuracy                                 | Unknown — instrument first | Measured and reviewed; no target asserted       |
| Task hygiene         | Duplicate task names created by this feature                       | Unknown — instrument first | 0                                               |
| Coverage honesty     | Surfaces showing captured data with a "browser activity only" note | 0 (not shipped)            | 100% of surfaces                                |
| Capture health       | Enrolled devices with a heartbeat in the last 30 minutes           | Unknown — instrument first | ≥ 90% of enrolled devices (target)              |
| Trust                | Objections and pause usage                                         | Unknown — instrument first | Reported as a trust signal; no reduction target |
| AI cost              | Gemini spend per active employee per month                         | Unknown — instrument first | Within caps; estimate $0.45–1.10 (est.)         |
| Privacy incidents    | Confirmed over-collection or fabricated-data incidents             | 0                          | 0                                               |

## 6. Constraints

- **PH privacy law (counsel decides).** The lawful basis is for counsel to determine (candidate: legitimate interest under RA 10173 §12(f), with §11 transparency and §16 rights — notice, recorded acknowledgment, objection route, minimisation, DPIA). The product supports consent capture where counsel requires it; a DPIA and DPO/counsel sign-off are hard gates before any production capture or pilot. This Epic asserts no legal conclusion.
- **Payroll-critical.** Captured activity is not payroll data and must never silently become a time entry; only an employee-saved draft can.
- **Small team, no ML team.** Learned domain→project mapping first; a Flash-Lite-class paid model chosen by golden-set evaluation and pinned in server config, with structured output; no training and no in-house inference.
- **Chrome MV3 limits.** Capture needs additional permissions (`tabs`, `idle`, `alarms`; no `<all_urls>`, no content scripts) and therefore enterprise force-install or Web Store review; the service worker is event-driven and not always-on.
- **Third-party processor.** Metadata may leave the firm to Gemini; the contract must prohibit training, and the DPIA must approve region/cross-border (§21) and field set.
- **Partial coverage.** Browser-only v1 is explicitly a slice of the day; Windows agent is phase 2 and separate; macOS is out.
- **Employee consultation.** Representative consultation and written notice are rollout prerequisites, not communications cleanup.

## 7. Non-goals

- Screenshots, screen recording, OCR, page content, DOM capture.
- Keylogging, clipboard capture, form-field capture, audio or webcam capture.
- Desktop app/window monitoring in v1 (Windows agent is phase 2, +10–16 dev-weeks separate; macOS out).
- Live screen viewing, manager raw browsing history/timeline, per-domain drill-down.
- Per-member manager monitoring metrics — manager reports are team-level only (k-anonymized); a per-member view needs its own lawful-basis decision.
- Titles/paths/URLs to AI by default — the default envelope is domain/app label/durations/switches only.
- Productivity scoring, ranking, leaderboards, focus scores, disciplinary automation.
- Personal-device monitoring, off-hours capture by default, or monitoring outside the work-hours window.
- Auto-posted/silent payroll entries, auto-save, auto-approval, or any AI write without employee save.
- Autonomous task creation (a task exists only after the employee approves that suggestion).
- An AI `entrySource` enum value in v1 (`MANUAL` + suggestion link instead).
- URL queries, fragments, credentials, or full paths by default; path is opt-in and not sent to Gemini by default.
- Browser history import, tab content, unapproved fields to Gemini, or AI-provided URLs/tools.
- Training/fine-tuning models on employee activity data, or sharing it for product improvement.
- A public monitoring API or exposure through the read-only `/api/v1` contract.
- Stealth/hidden capture, blocked pause/objection, or an indicator that can be hidden.
- Mobile/PWA, Firefox/Safari, or multi-browser capture.
- Buying a surveillance SaaS, building a sync engine/CRDT, or adding a new payroll API.

## 8. Dependencies

- **Research (final):** [ai-activity-monitoring/research/platform-feasibility.md](ai-activity-monitoring/research/platform-feasibility.md) — MV3 limits, desktop feasibility, Gemini tier/terms/cost, PH legal analysis, recommendation.
- **Engineering (final):** [ai-activity-monitoring/engineering/implementation-analysis.md](ai-activity-monitoring/engineering/implementation-analysis.md) — capture client, token ingestion, data model, AI pipeline/cost, safe approval, M0–M4.
- **DPO / legal counsel:** DPIA, legitimate-interest assessment, notice/acknowledgment/objection wording, retention, DSR SLA, Gemini processor/cross-border clauses; sign-off is a blocking gate.
- **Google Cloud / Gemini:** paid tier, DPA, region/processing terms, billing, no-training confirmation.
- **IT / security:** extension distribution (enterprise force-install or Web Store review), device management, token revocation, secret storage, incident response.
- **Owner / Admin:** notice, exclusions, work-hours window, retention, AI mode, cost caps, enablement decision.
- **Employee representatives / HR:** consultation, objection-handling process, communications.
- **Existing platform:** extension, `createManualEntryFn`/`createTaskFn`, `audit_logs`/`activity.view`, workspace toggles, `project_tasks` unique index, `entrySource`, cron/`CRON_SECRET`, Sentry.

## 9. Strategy (decided)

**A1 — extend the existing MV3 Chrome extension for metadata-only capture, run the learned domain→project mapping first, then paid server-side Gemini suggestions, and require employee approval before anything becomes a draft. Native Windows agent is a separate phase-2 project; macOS out; screenshots and content permanently out.**

- **Capture:** `tabs` + `idle` + `alarms`, no `<all_urls>`, no content scripts, incognito `not_allowed`; focused-tab registrable domain by default, path opt-in (off by default), sanitized titles; 60 s heartbeat and flush; pause, layered exclusions, work-hours, and kill switch enforced before local write and re-checked server-side.
- **Trust and ingestion:** one-time pairing code → SHA-256-hashed, scoped, 180-day, revocable device token; token-authenticated ingest file route; idempotent batches; 9 activity tables; counters-only logs and Sentry.
- **AI:** learned mapping first; a Flash-Lite-class paid model chosen by golden-set evaluation in M2 and pinned by model ID (candidate `gemini-3.5-flash-lite`), server-only, strict schema, no tools, minimized envelope with no titles/paths/URLs by default, untrusted titles; AI off by default; member/workspace caps; outage falls back to mapping/manual.
- **Human last:** approval prefills the existing manual-entry form (`createManualEntryFn`) or creates an approved task (`createTaskFn`); the employee saves; entries stay `entrySource = MANUAL` with a suggestion link. No auto-post, auto-approve, or AI-created task without approval.
- **Legal posture:** the basis is for counsel to determine (candidate legitimate interest; §11 notice, §16 rights, acknowledgment, objection, minimisation); the product supports consent capture where counsel requires it. DPIA and DPO/counsel sign-off are a hard gate; no legal conclusion is asserted.
- **End-to-end estimate: 9.5–15 dev-weeks (est.)** for M0–M4 (M0 1–1.5, M1 2.5–4, M2 2–3, M3 2.5–4, M4 1.5–2.5), one senior engineer familiar with the repo; **engineering §13 is the source of truth** for the plan and estimate (research's 4–6 wk capture and 6–10 wk Windows are pre-scope slices, not comparable totals); excludes DPIA/legal/consultation, store review/distribution, device procurement, and pilot calendar time. Gemini cost estimate **$0.45–1.10 per active user per month (est.)**, controlled by caps. The Windows agent is **+10–16 dev-weeks, a separate project, never added to v1**.
- **Why A1:** least data that still removes typing; reuses the extension and manual-entry path; keeps payroll human; avoids the legal/storage exposure of screenshots and content. Rejected: screenshots/OCR, desktop capture in v1, auto-posting, bought surveillance SaaS, free-tier Gemini (human review/product improvement), no-AI-only rules (rules are the fallback, not the product).
- **Switch triggers:** counsel rejects metadata capture or the candidate basis (→ opt-in or stop); Gemini DPA/region unapprovable (→ rules-only/on-device, never free tier); `tabs` permission rejected (→ alternative distribution or reduced capture); coverage complaints dominate (→ phase-2 Windows agent with DPIA annex); golden-set acceptance < ~50% (→ invest in rules before more AI); any sensitive-title incident (→ domain-only, re-run DPIA); auto-post requested (→ reject without payroll-grade idempotency, audit, and per-entry approval).
- **Evidence:** [research §§1, 5–9](ai-activity-monitoring/research/platform-feasibility.md) · [engineering §§0, 3–10, 15](ai-activity-monitoring/engineering/implementation-analysis.md) · [PRD §12](ai-activity-monitoring/prd.md#12-strategy-decision).

## 10. Feature docs

- **PRD v3 (final):** [ai-activity-monitoring/prd.md](ai-activity-monitoring/prd.md)
- **Research:** [ai-activity-monitoring/research/platform-feasibility.md](ai-activity-monitoring/research/platform-feasibility.md)
- **Engineering analysis:** [ai-activity-monitoring/engineering/implementation-analysis.md](ai-activity-monitoring/engineering/implementation-analysis.md)
- **Adversarial review (applied in PRD v3):** [ai-activity-monitoring/engineering/prd-review.md](ai-activity-monitoring/engineering/prd-review.md)

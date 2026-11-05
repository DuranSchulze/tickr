# Research — AI activity monitoring: platform, desktop, Gemini, and PH privacy

**Task:** `task-7` · **Date:** 2026-11-05 · **Owner:** Researcher · Docs only, no code changed.

**Legend:** **[repo]** verified here today (path given); **[ext]** external source, URL inline, accessed **2026-11-05**; **[assumption]** untested or price-drift risk.

**Fixed constraints (matrix §9 is shaped to them):** metadata only — app/site names, tab/window titles, domains/paths, idle; **no** screenshots, content, OCR, keylogging, clipboard. Chrome extension only in v1, Windows agent phase 2, macOS out of scope. AI suggests only — employee approves before save. Workspace-mandated with written notice, recorded acknowledgment, pause/exclusions, DPO sign-off and DPIA.

---

## 1. Bottom line

1. **The constraint set is coherent.** Metadata-only + extension-only + suggest-only is the narrowest product that still delivers value, and it avoids the two largest exposures: screen content and silent posting.
2. **Coverage is partial — say so.** A browser extension observes Chrome, not the employee. Desktop apps and other browsers are invisible, so "what the user is doing" means "what they are doing _in Chrome_".
3. **Metadata is still personal data.** Titles and paths reveal health, legal, banking, HR or job-search activity. The risk is context, not pixels; minimisation is the control.
4. **Gemini must be paid tier.** Unpaid terms let Google improve products and let human reviewers read inputs; paid terms do not, but logs are kept briefly for abuse detection and may sit "in any country" — a cross-border transfer under RA 10173 §21 needing contractual cover.
5. **Recommendation:** Chrome metadata-only v1, deterministic rules first, Gemini `gemini-3.5-flash-lite` suggest-only behind explicit approval, mandated-notice with an objection route, DPIA before build; Windows agent gated on a measured coverage gap.

---

## 2. Repo evidence (verified 2026-11-05)

- **[repo] Extension is passive.** `extension/manifest.json`: permissions only `sidePanel`, `storage`, `activeTab`, `scripting`; hosts limited to localhost:3000 and two Vercel origins. No `tabs`, `idle`, `webNavigation`, `alarms`, `history` — no activity capture exists.
- **[repo] Capture is one-shot.** `extension/sidepanel.js` (54 lines) calls `capturePageInfo()` once on load, skips `chrome://`, injects a single `document.title`/`location.href` read, stores it in `chrome.storage.session`. No tab-switch or duration tracking. `extension/background.js` (37 lines) only sets the panel and a timer badge.
- **[repo] App already fits.** `timeEntries` (`src/db/schema.ts:1073`) has `description`, `projectId`, `taskId`, tag join, `startedAt`/`endedAt`/`durationSeconds`, `entrySource` (`:1098`), geo; `projectTasks` (`:947`) and `auditLogs` (`:1374`) exist; `locationTrackingEnabled` (`:312`) is the per-workspace-toggle precedent. Better Auth/Neon/Vercel plus `CHROME_EXTENSION_ORIGIN` and production `SameSite=None` are already wired.
- **[repo] No AI code** — grep for `gemini|openai|vertex|llm` in `src/` and `package.json` returns no integration.

---

## 3. Chrome MV3: what an extension can and cannot know

**Can** — tab identity: `tab.url`/`tab.title` are "sensitive properties" needing `tabs` **or** host permissions ([tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)). `tabs` warns **"Read your browsing history"**; `activeTab` skips the warning but only on explicit invocation, is revoked on navigation, and is **never granted on `chrome://`** ([activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab); [warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings)) — so continuous capture needs `tabs` plus an honest warning. Also: focus/window events, `webNavigation` (host permissions), `chrome.idle` → `active`/`idle`/`locked`, **60 s default interval** ([idle](https://developer.chrome.com/docs/extensions/reference/api/idle)), and `chrome.alarms`.

**Cannot**

- **Service worker is not always-on:** terminated **after 30 s idle**, single request capped at **5 min**, `fetch` aborted past **30 s** ([SW lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)). Capture is event-sampled, never continuous — buffer and reconcile durations on wake.
- **Other apps and other browsers are invisible** — no OS window APIs inside the extension sandbox.
- **Restricted surfaces:** `chrome://`, Chrome Web Store, other extensions' pages, `file://` unless file access is enabled ([tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)); PDFs expose no page DOM.
- **Incognito is a separate context** and `storage.local`/`sync` are **always shared** across it ([incognito](https://developer.chrome.com/docs/extensions/reference/manifest/incognito)) → use `not_allowed`.
- **Store policy constrains the product.** The July 2026 CWS update (enforced **1 Aug 2026**) requires data to be "strictly necessary to the extension's disclosed single purpose" and all collection **prominently disclosed**, with re-disclosure on change ([CWS 2026](https://developer.chrome.com/blog/cws-policy-updates-2026)). Capture must be the declared purpose and cannot be repurposed.

**Verdict:** MV3 can answer "which site/tab was frontmost, for how long, was the user idle" — in Chrome only. Not "what is the user doing".

---

## 4. Desktop monitoring (phase 2, Windows)

- **Mechanism:** `GetForegroundWindow()` returns "a handle to the foreground window… with which the user is currently working" ([MS Learn](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow)); `GetWindowTextW()` gives the title ([MS Learn](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowtextw)). Plus UI Automation process names and last-input idle — extension-equivalent data, for every app.
- **An extension cannot reach this** — Chrome sandbox, no OS window APIs. Architectural, not a permission gap.
- **Tauri vs Electron:** Tauri advertises "smaller bundle size by using the system's native webview" on Rust ([tauri.app](https://v2.tauri.app/start/)); Electron bundles Chromium. For a headless capture daemon, Tauri fits better; Electron is faster to staff if known **[assumption]**.
- **Signing/MDM is the cost centre.** Unsigned installers hit SmartScreen friction; Microsoft's managed signing ("Artifact Signing", formerly Trusted Signing) supplies certificates ([MS Learn](https://learn.microsoft.com/en-us/azure/trusted-signing/overview)) — budget procurement **[assumption]**; silent install/update and MDM push are standard **[assumption]**.
- **Effort [assumption]:** 6–10 dev-weeks — hence phase 2.

---

## 5. Metadata-only is not "low sensitivity"

Titles/paths surface health portals, legal matters, banking, job boards, HR/payroll, webmail and government IDs. RA 10173 requires proportionality (§11) against a declared purpose; "collect titles just in case" is the punished failure mode. Controls: **domain-first** storage with path/title only for allow-listed work domains and never for a deny-list (health, banking, webmail, job search, HR, legal); **redaction before storage and before AI** (strip query strings, normalise titles, drop emails/numbers); **pause and per-site exclusions as visible product features**; **short raw retention** (30–90 days **[assumption]**, per counsel) with only aggregates and approved suggestions persisting; **employee-visible data** — the pattern Time Doctor markets ("Everyone sees the same hours, activity, and screenshots their manager sees", [timedoctor.com](https://www.timedoctor.com/)). Chilling effect is evidenced: an open-access review links monitoring to adverse employee outcomes and questions the productivity premise ([Zenodo, Nov 2025](https://zenodo.org/records/17702042)) — no covert mode, no individual leaderboards.

---

## 6. Gemini: paid, small, structured

- **API:** AI Studio / Developer API is the fast path; Vertex AI (Gemini Enterprise Agent Platform) is the enterprise path with provisioned throughput and volume terms ([pricing](https://ai.google.dev/gemini-api/docs/pricing)). One internal firm → **Paid Developer API**; move to Vertex when procurement demands it.
- **Model/cost:** `gemini-3.5-flash-lite` — **$0.30 / 1M input, $2.50 / 1M output** ([pricing](https://ai.google.dev/gemini-api/docs/pricing)). Suggesting task names from a few context tokens costs dollars/month at most **[assumption]**; `gemini-3.8-flash` is the quality upgrade.
- **Structured output is the contract:** JSON-Schema-constrained responses with `enum` classification and a documented supported subset ([structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)) — force `{taskName, projectId?, confidence, rationale}`.
- **Tier terms decide the design.** **Unpaid:** Google uses content to improve products, "**human reviewers may read, annotate, and process**" inputs, and terms say "**Do not submit sensitive, confidential, or personal information**". **Paid:** not used to improve products, processed under the **Data Processing Addendum**, but logged briefly for Prohibited Use detection and "may be stored… in **any country**" ([terms](https://ai.google.dev/gemini-api/terms)) → **Paid only**, DPA in place, Gemini is a personal-information processor under RA 10173 §21.
- **Residency:** the Philippines is a supported Gemini region ([regions](https://ai.google.dev/gemini-api/docs/available-regions)), but that is availability, not storage — paid terms permit offshore processing, so §21 cover is required.
- **Envelope to send:** domain, normalised site name, duration bucket, workspace id, opaque member id, candidate task list — never raw titles with PII, content, screenshots or emails; redacted titles only on an explicit "suggest from this page" action. **Alternatives:** deterministic domain→project rules (zero transfer, covers most recurring work **[assumption]**) and on-device models (no transfer, size/quality cost **[assumption]**).

---

## 7. PH legal and ethical position (counsel required)

**Primary law [ext]** ([RA 10173](https://lawphil.net/statutes/repacts/ra2012/ra_10173_2012.html)): **§11** transparency, legitimate purpose, proportionality, purpose declared first; **§12** bases — consent (a), contract (b), **legitimate interests (f)**, unless overridden by fundamental rights; **§13** sensitive PI needs **specific consent** (metadata can reveal health/religion/legal context); **§16** rights — informed, object, access, correct, erase/block, complain to NPC; **§20** reasonable security; **§21** accountability for transfers "whether domestically or internationally" via "contractual or other reasonable means".

**Commentary [ext, secondary]:** practitioners require notice of nature, purpose, extent, risks and safeguards; purpose-limited scope; proportionate means ([L&E Global, 2026](https://leglobal.law/2026/05/29/philippines-employee-monitoring-and-the-right-to-privacy-key-considerations-under-the-data-privacy-act-of-2012/)), reporting **NPC Advisory Opinion No. 2024-003** on company policies for monitoring software and the NPC's earlier recommendation of a policy stating method, purpose, data collected and **retention**. For **non-sensitive** data, notice plus legitimate necessity may suffice **without consent**; sensitive PI needs consent ([ASG Law, Sep 2026](https://asg.ph/insights/employee-data-monitoring-workplace-philippines)).

**Implication for "workspace-mandated consent":** employee consent is a weak basis (freely-given is contestable). The defensible construction is **legitimate interest (§12(f)) + transparency + recorded acknowledgment + objection/exclusion route + minimisation**, reserving consent for sensitive PI. Call it _notice-and-acknowledgment_; counsel approves wording.

**Counsel must decide (do not assert):** validity of employee acknowledgment; whether metadata is sensitive PI in context; DPIA need/format and NPC expectation; retention windows (raw/aggregate/payroll); cross-border clauses for Google/Gemini; NPC registration; union/collective-agreement constraints; notice content and objection procedure. **Gate:** DPIA → notice + ack → pause/exclusions shipped → DPO/legal sign-off → volunteer pilot → rollout; no covert mode.

---

## 8. Competitor scan (list prices from cited pages, 2026-11-05)

- **Hubstaff** — activity tracking, screenshots, idle, app/URL, Team **$10/seat/mo** ([pricing](https://hubstaff.com/pricing)); market default is more invasive than this proposal.
- **Time Doctor** — per-role capture policy, employee-visible data, screenshot blurring, ISO 27001/SOC 2 ([site](https://www.timedoctor.com/)).
- **ActivTrak** — **$10/worker/mo**; screenshots, **title bars and full URLs** need a paid **"Screen Details" add-on** ([pricing](https://www.activtrak.com/pricing/)) — title-bar/full-URL capture is treated as elevated-sensitivity.
- **Insightful** — **$8/seat/mo**; screenshots as add-ons (**$4** on-demand, **$3** frequent) ([pricing](https://www.insightful.io/pricing)).
- **RescueTime / Clockify** — **$7–$12/mo** individual focus plans ([pricing](https://www.rescuetime.com/pricing)); Clockify **$5.49–$7.99**/seat/mo + browser auto-tracker ([pricing](https://clockify.me/pricing)).
- **Criticisms:** covert/excessive surveillance, personal-device monitoring, context-free scoring — trust and chilling-effect harms, not accuracy ([Zenodo](https://zenodo.org/records/17702042)) **[assumption on ranking]**. Copy the counter-designs: employee-visible data, per-role policy, sensitive signals sold separately.

---

## 9. Decision matrix and recommendation

Effort in engineering weeks **[assumption]**; privacy risk = residual after controls.

| Option                                                                             | Effort | Coverage         | Privacy risk                                                              | Time-to-value | Verdict                                         |
| ---------------------------------------------------------------------------------- | ------ | ---------------- | ------------------------------------------------------------------------- | ------------- | ----------------------------------------------- |
| **A1. Extension, metadata only, rules + suggest-only AI**                          | 4–6    | Chrome tabs      | Medium — titles/domains personal; no content                              | 1 sprint      | **Recommended v1**                              |
| A2. A1 + auto-create tasks (confirm)                                               | +1–2   | Chrome           | Medium                                                                    | +2 wks        | Phase 1.5 if acceptance > ~60% **[assumption]** |
| A3. A1 + auto-post entries                                                         | +2–3   | Chrome           | High — payroll errors, disputes                                           | —             | **Reject**                                      |
| **B1. A1 + Windows agent (phase 2)**                                               | +6–10  | All Windows apps | High — desktop visibility, MDM dependency                                 | +1 qtr        | Gated on coverage gap                           |
| B2. B1 + macOS                                                                     | +6–9   | + macOS          | High — Accessibility/Screen Recording                                     | +1–2 qtrs     | Out of scope                                    |
| C. Screenshots/OCR                                                                 | +3–5   | Screens + apps   | **Very high** — content of everything                                     | —             | **Reject v1**; separate DPIA + consent          |
| Consent: mandated notice + ack + objection (**recommended**) / opt-in / team-level | —      | —                | Needs genuine legitimate interest + objection route; opt-in cuts coverage | —             | Notice + ack + pause + DPIA                     |

**Recommendation.** Ship **A1**: Chrome capture of domain + normalised title + idle state (`tabs` disclosed, `idle` for real idle, `alarms` sampling, incognito `not_allowed`); suggest-only `gemini-3.5-flash-lite` on **paid** tier with structured output and a redacted envelope; deterministic domain→project rules as the always-available fallback; employee data view, pause, per-site exclusions; DPIA and DPO sign-off before pilot. **No** screenshots, content, auto-posting or Windows agent in v1.

**Switch triggers.** (1) Coverage complaints dominate → start B1 with a DPIA annex. (2) Acceptance < ~50% **[assumption]** → invest in deterministic rules before more AI. (3) Counsel rejects legitimate interest → explicit opt-in, reduced coverage, no payroll consequence for non-participation. (4) Gemini DPA/DPIA unapprovable → deterministic-only or on-device; never free tier. (5) Any sensitive-title incident → domain-only capture and re-run the DPIA. (6) Auto-post requested → reject without payroll-grade idempotency, audit trail and per-entry approval.

---

## 10. Assumptions and open questions

**[assumption]** effort estimates; retention windows; acceptance thresholds; Windows signing/MDM cost and duration; deterministic-rule coverage; on-device viability; criticism ranking; Gemini monthly cost.
**Open:** exact capture fields (path ever allowed?); deny-list domains; acknowledgment cadence; manager visibility (individual vs aggregate); pilot group; aggregate retention; DPIA owner; NPC notification position; private/force-installed extension instead of public store **[assumption — avoids store review, needs policy management]**.

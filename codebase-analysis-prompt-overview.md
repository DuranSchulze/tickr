# Overview: "Analyze This Entire Codebase" Prompt

## What This File Is

The attached file (`Analyze this entire.txt`) is not a codebase itself — it is a **prompt template** designed to be given to an AI agent. Its purpose is to instruct the AI to perform a deep, evidence-based audit of a software repository and produce a standardized **system documentation report** in Markdown. The report is meant to be handed to _another_ AI (or team) so it can build a "company systems portfolio" — i.e., a catalog of all the systems a company operates, with consistent, comparable documentation for each.

## The Core Task

The prompt asks the AI to:

1. Inspect the actual codebase (README, package files, routes, pages, components, API endpoints, database schema, migrations, services, integrations, tests, CI/CD, Docker/deployment config, environment examples, documentation).
2. Produce a factual report following an exact 20-section structure (from "System Name" through "Evidence Reviewed").
3. End with a compact "SYSTEM SUMMARY" block for quick scanning.

## Key Principles Embedded in the Prompt

The prompt is heavily focused on **rigor and honesty**. It explicitly instructs the AI to:

- **Inspect before answering** — never analyze from assumption.
- **Never modify files** — the task is read-only analysis.
- **Never expose secrets** — no passwords, API keys, tokens, or sensitive environment values may appear in the output.
- **Base everything on repository evidence** — with a required escape hatch: anything that can't be confirmed must be labeled "Not confirmed from codebase."
- **Don't invent features** — and explicitly **distinguish four implementation states**:
  - Implemented
  - Partially implemented
  - Planned / placeholder
  - Deprecated / unused

This four-state distinction is one of the most valuable parts of the template, because it prevents the classic failure mode where an AI reports aspirational TODOs as working features.

## The 20-Section Report Structure

| #   | Section                      | What It Covers                                                                                                  |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | System Name                  | Identify the project                                                                                            |
| 2   | System Overview              | 1–3 paragraphs, non-technical manager audience                                                                  |
| 3   | Primary Purpose              | Why the system exists                                                                                           |
| 4   | Target Users / User Roles    | Roles and their capabilities                                                                                    |
| 5   | Core Features                | Split into Implemented / Partially implemented / Planned                                                        |
| 6   | Main User Flow               | End-to-end workflow (e.g., Login → Dashboard → …)                                                               |
| 7   | Main Modules / Areas         | Auth, Dashboard, Reports, Payments, etc.                                                                        |
| 8   | Technology Stack             | Frontend, Backend, Database, Infrastructure, Key libraries                                                      |
| 9   | External Integrations        | Payment gateways, AI providers, email, storage, etc.                                                            |
| 10  | Data & Main Entities         | High-level model/entity relationships                                                                           |
| 11  | Authentication & Permissions | How users authenticate, roles, protected areas                                                                  |
| 12  | Deployment & CI/CD           | Docker, GitHub Actions, environments, rollback — classified as Mature / Partial / Basic / Not found             |
| 13  | Testing & Quality            | Unit/integration/E2E tests, linting, type checking — with an honest coverage estimate (no invented percentages) |
| 14  | Security                     | Auth, authorization, validation, rate limiting, headers, audit logs, gaps                                       |
| 15  | Current Development State    | Classified as Prototype / Early Dev / Active Dev / Stabilization / Production / Maintenance / Legacy            |
| 16  | How Complete Is the System?  | Weighted 0–100% scoring rubric                                                                                  |
| 17  | Remaining Work               | High / Medium / Nice-to-have priorities                                                                         |
| 18  | Recommended Next Steps       | 5–10 concrete actions                                                                                           |
| 19  | Short Portfolio Description  | A polished 100–180 word non-technical blurb                                                                     |
| 20  | Evidence Reviewed            | The key files/directories that grounded the analysis                                                            |

## The Completion Scoring Rubric (Section 16)

The template defines a fixed weighting scheme, which makes scores comparable across different systems in a portfolio:

| Area                          |  Weight |
| ----------------------------- | ------: |
| Core functionality            |      30 |
| UI/UX completeness            |      15 |
| Backend/data/integrations     |      15 |
| Testing & reliability         |      15 |
| Deployment/CI-CD/operations   |      10 |
| Security                      |      10 |
| Documentation/maintainability |       5 |
| **Total**                     | **100** |

Notably, it includes a guardrail: _"Do not give a high score simply because the application runs."_ Production readiness, testing, deployment automation, security, and maintainability must pull the score down when they're missing.

## Strengths of This Prompt

- **Standardization** — running it against every repo in a company produces directly comparable documentation.
- **Honesty guardrails** — "Not confirmed from codebase," no invented coverage percentages, no invented features.
- **Security awareness** — explicit prohibition on leaking secrets, repeated in sections 9 and 14.
- **Audience layering** — Section 2 is for non-technical managers, Section 19 produces portfolio-ready prose, and the SYSTEM SUMMARY block gives executives a quick scan.
- **Actionability** — Sections 17 and 18 turn the audit into a prioritized work plan, not just a description.

## Possible Limitations / Things to Watch

- **Read-only constraint** means the AI can't run the app or tests; findings are limited to static inspection. Behavior claims (e.g., "feature works") are inferred from code presence, not execution.
- **"Implemented" classification is still an inference** — code existing ≠ code working in production. The prompt mitigates this with the four-state system but can't eliminate it without runtime verification.
- **No time/scale limits** — for very large monorepos, the AI may need to be pointed at subdirectories to stay within context limits.
- **Mono-repo ambiguity** — the prompt assumes one system per repository; multi-service repos would need the prompt run per service.

## The Final Compact Summary

The report ends with a scannable block:

```
SYSTEM SUMMARY
Name:
Purpose:
Primary Users:
Current Status:
Completion Estimate:
Main Features:
Main Integrations:
Deployment Maturity:
Testing Maturity:
Biggest Remaining Gaps:
Recommended Immediate Priority:
```

This makes it easy to aggregate dozens of system reports into a single portfolio table.

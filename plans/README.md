# Plans Directory · Convention Guide

This directory holds all feature, fix, and redesign plans for the Tickr (Trackly) codebase. Every plan lives in its own **kebab-case folder** containing a `PLAN.md` file.

> **Purpose:** Before any non-trivial code change begins, a plan is written here. The plan serves as the single source of truth for what to build, why, how it fits into the existing codebase, and what "done" looks like. It is read by both humans and LLMs.

---

## Directory Structure

```
plans/
├── README.md                          ← THIS FILE — the convention guide
├── <plan-folder>/                     ← kebab-case, descriptive
│   └── PLAN.md                        ← the plan document itself
│
├── fix-overlap-cancel-bug/            ← example: fix plan
│   └── PLAN.md
├── subscription-workspace-access/     ← example: feature plan
│   └── PLAN.md
├── landing-page-redesign/             ← example: redesign plan
│   └── PLAN.md
└── quick-fix/                         ← exception: multiple tiny fixes
    ├── export-time-separation.md
    └── update-time-task-track-component.md
```

### Naming Rules

| Rule | Example |
|------|---------|
| Folder name is **kebab-case** | `landing-page-redesign`, `fix-overlap-cancel-bug` |
| Folder name summarizes the plan | `subscription-workspace-access`, not `plan-3` |
| Plan file is always `PLAN.md` | `plans/landing-page-redesign/PLAN.md` |
| Exception: `quick-fix/` folder for tiny, single-commit changes | `plans/quick-fix/export-time-separation.md` (multiple `.md` files allowed here) |

---

## Status System

Every plan must declare its status in one of two ways (or both).

### Option A: Single-line Status Badge (Preferred)

Place immediately after the title, before Section 1:

```markdown
# Feature Name

> **Status:** ✅ Done
```

Valid status values:

| Badge | Meaning | When to Use |
|-------|---------|-------------|
| `📋 Planned` | Plan written, not started | Just created the plan; awaiting review or prioritization |
| `🔴 Not Started` | Plan reviewed, ready, but no code written | Plan is approved; ready for implementation |
| `🟡 In Progress` | Work actively underway | Someone is implementing this right now |
| `✅ Done` | Completed and validated | All checkboxes checked, deployed, verified |

### Option B: Milestone Checklist

Use when you need to track sub-phases within a plan:

```markdown
## Status

- [ ] Plan created and reviewed against existing infrastructure.
- [ ] Database migration generated.
- [ ] Backend implementation complete.
- [ ] Frontend implementation complete.
- [ ] Validation: typecheck, lint, tests, manual smoke test.
```

Checkboxes follow standard markdown: `- [ ]` (incomplete) and `- [x]` (complete). When **all** boxes are checked, also update the single-line badge to `✅ Done`.

### Combined (Recommended for Larger Plans)

Use both: a single-line badge for quick scanning plus a checklist for detailed tracking.

```markdown
# Feature Name

> **Status:** 📋 Planned

## Status

- [ ] Database migration generated.
- [ ] Backend implemented.
- [ ] Frontend implemented.
- [ ] Validated and deployed.
```

---

## PLAN.md Template

A complete plan MUST include these sections in this order. Sections marked *(if applicable)* are required only when relevant to the feature.

```markdown
# Feature Name

> **Status:** 📋 Planned

## Status

- [ ] Milestone 1
- [ ] Milestone 2

## 1. Goal

[2–4 sentences. What does this feature do? What problem does it solve? Who benefits? Use bullet points if multiple distinct deliverables.]

## 2. Context Summary

[What exists today that this builds on or changes? Reference specific files, tables, libraries. List assumptions and missing information. This section ensures LLMs and new contributors understand the starting point without reading the entire codebase.]

## 3. Scope

[Bullet list. What is included? Be specific: "Add X table", "Create Y component", "Modify Z endpoint".]

## 4. Out of Scope

[Bullet list. What is explicitly NOT included? Prevents scope creep. Be specific: "No email notifications", "No multi-currency support".]

## 5. Affected Files and Folders

[Tree diagram using code block. Mark new files with `(NEW)` and modified files with `(MODIFY)`. Show the full path from the project root.]

## 6. Database Design *(if applicable)*

[New tables, enums, columns. Use Drizzle schema syntax. Include seed data if relevant.]

## 7. Backend Implementation *(if applicable)*

[Server functions, API endpoints, Zod schemas, service logic. Include function signatures and behavior descriptions.]

## 8. Frontend Implementation *(if applicable)*

[Components, routes, pages, UI behavior. Describe component tree, state management, loading/error states.]

## 9. Access Control *(if applicable)*

[Permission matrix. Who can do what? Use a table with roles as columns.]

## 10. Validation

[How to verify the plan is complete. Include specific commands: `pnpm typecheck`, `pnpm lint`, manual QA steps.]

## 11. Sequencing *(if applicable)*

[Ordered implementation phases. Each phase should be independently shippable. Use checkboxes for tracking.]

## 12. Risks & Considerations

[Table or bullet list. What could go wrong? Mitigation for each risk.]

## 13. Open Questions

[Bullet list of decisions that need stakeholder input. Each item is a checkbox to track resolution.]
```

---

## LLM Instructions

When you (an LLM agent) are asked to create or modify a plan in this directory, follow these rules:

### Must Do

1. **Read this README first.** Understand the conventions before writing anything.
2. **Use the exact template above.** Match section numbering, heading levels, and formatting.
3. **Always include a Status section** — both the single-line badge AND a milestone checklist for tracking.
4. **Nest the plan in a kebab-case folder** — never place a `PLAN.md` directly in `plans/`.
5. **Use the single-line status badge** format: `> **Status:** <emoji> <state>`
6. **Fill in the Context Summary with real codebase references** — read `src/db/schema.ts`, `package.json`, relevant routes, and existing components before writing.
7. **Use the "Affected Files and Folders" tree diagram** — mark every file as `(NEW)`, `(MODIFY)`, or `(DELETE)`.
8. **Include a Validation section** with specific commands (`pnpm typecheck`, `pnpm lint`, `pnpm test`).
9. **Reference existing patterns** — if a similar plan exists, follow its conventions. The `invoicing-template-creation-payment` plan is a good reference for feature plans.
10. **Mark assumptions explicitly** — if stakeholder input is missing, note the assumption and its default in a dedicated table.

### Must NOT Do

1. **Do NOT skip sections** — even if a section seems irrelevant, include it with "N/A" or explain why it's not needed.
2. **Do NOT use a different status format** — always use the badge + checklist pattern.
3. **Do NOT place a plan file directly in `plans/`** — always in a subfolder.
4. **Do NOT write implementation code in the plan** — the plan is a specification, not the code itself. Describe what to build, not how every line works.
5. **Do NOT leave the Status badge stale** — when a plan is completed, update the badge to `✅ Done` and check all boxes.
6. **Do NOT omit the "Out of Scope" section** — explicit boundaries prevent scope creep.
7. **Do NOT write untestable acceptance criteria** — every validation step should be executable.

---

## Status Lifecycle

```
📋 Planned  ──→  🔴 Not Started  ──→  🟡 In Progress  ──→  ✅ Done
   ↑                                                           │
   └────────────────── (re-scoped / revived) ←─────────────────┘
```

- **Planned**: Plan document exists but hasn't been reviewed or prioritized.
- **Not Started**: Plan is approved and queued but no code has been written.
- **In Progress**: Someone is actively implementing. Only one plan should be "In Progress" per person.
- **Done**: All milestones checked, all validation passed, deployed to production.

---

## Quick Reference for LLMs

| Task | Action |
|------|--------|
| Create a new plan | 1. Explore codebase context. 2. Present discovery questions. 3. Create `plans/<kebab-case>/PLAN.md` following the template. 4. Use `📋 Planned` badge. |
| Update existing plan | Read the plan, modify the relevant section, update the status checklist. |
| Mark plan as done | Change badge to `✅ Done`, check all `- [ ]` boxes, add completion date if relevant. |
| Find unfinished plans | Grep for `📋 Planned`, `🔴 Not Started`, `🟡 In Progress`, or `- [ ]` checkboxes. |

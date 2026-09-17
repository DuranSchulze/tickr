# Discussion Summary — UI Redesign (Editorial Design System)

> Feature directory: `plans/ui-redesign/`. Spec: [DESIGN.md](../../../DESIGN.md). Plan: [PLAN.md](PLAN.md).

## Vision Phase

_(Placeholder — no separate vision document was produced; the vision is captured in DESIGN.md and PLAN.md §1.)_

## Requirements Phase

_(Placeholder — no separate requirements document was produced. Requirements are encoded as decisions A1–A11 in PLAN.md §2.)_

## Plan Phase

### Implementation approach discussions

- **2026-09-17 — Scope confirmed with stakeholder:** visual/theme-only redesign ("preserve what we have but update the look, feel, and theme"). No functional, routing, or component-API changes. No codebase changes until the plan is approved.
- **Spec authority:** DESIGN.md is the sole spec (ElevenLabs-style warm cream editorial reference). No `vision.md` / `requirements.md` / `spec.md` exist in this repo.
- **Structure decision:** single `PLAN.md` (repo convention, cf. `plans/landing-page-redesign/PLAN.md`) with a token-first cascade of 10 phases, rather than split-by-domain plans — the redesign is one token-driven system, and splitting would fragment the dependency chain (tokens → primitives → surfaces).

### Key Decisions Log

| #   | Decision                                                                                                                                         | Rationale                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Single plan document, 10 phases, token-first cascade                                                                                             | One design system, sequential dependencies; each phase independently verifiable with `pnpm check-all`                                         |
| 2   | Dark mode kept and remapped to a warm "graphite editorial" palette (PLAN §3.2)                                                                   | Stakeholder asked to preserve existing features; DESIGN.md is light-only, so the dark mapping is a novel project adaptation specified in full |
| 3   | Accent presets (8 `data-primary` colors) kept but rebalanced: ink fills primary CTAs, accent drives rings/active/links/glow/charts (A4)          | Preserves customization feature while honoring DESIGN.md's "black filled buttons are the only CTA hierarchy" rule                             |
| 4   | Font presets (5 `data-font` families) kept; Inter becomes default editorial face; display = Inter 300 @ -0.02em (Waldenburg substitute per spec) | Inter Variable is already bundled — zero new dependencies; preserves user font choice                                                         |
| 5   | Named radii (inputs 4px, cards 20px, buttons pill) replace the flat `--radius: 0` look; legacy `--radius` scale kept for compatibility           | DESIGN.md signature shapes; zero breakage of existing derived radii                                                                           |
| 6   | Violet/ember "spark" accents ship decoration-only (confetti, empty states)                                                                       | DESIGN.md §Don't: never UI chrome                                                                                                             |
| 7   | No new font downloads; `--font-mono` = system mono stack                                                                                         | "Preserve what we have"; Geist Mono skipped (A10)                                                                                             |
| 8   | Chart palette kept colored but re-tuned warm; heatmap re-scaled to ink-density gradient                                                          | Charts are the sanctioned color exception (product-visual rule); achromatic charts would be illegible                                         |
| 9   | CSS variable names are frozen — only values change (A1)                                                                                          | Guarantees no consumer breakage across 550+ TS/TSX files                                                                                      |

### Sequencing decisions and rationale

1. **Prerequisites & audit** — inventory hardcoded colors/shadows/radii and capture baseline screenshots before any change.
2. **Token foundation (`styles.css`)** — highest leverage; cascades everywhere.
3. **UI primitives** — atomic vocabulary; pill buttons are the signature change.
4. **App shell + dashboard** — highest-traffic surface, exercises most primitives.
5. **Feature screens** — styling sweep inheriting Phase 3-4 patterns.
6. **Marketing & public pages** — editorial system's home turf, but lower daily-usage priority than app surfaces.
7. **Charts/maps/dataviz** — exception zone; decided after canvas settles.
8. **Theme customization UX** — settings UI reflects the rebalanced system; stable after all else.
9. **Validation sweep** — screenshot matrix (routes × light/dark × accents), contrast audit, interaction QA.
10. **Documentation** — `docs/ui-design-system.md` captures the adaptation so future work doesn't revert it.

### Pivots made during planning

- Initial Phase 1 question to the stakeholder offered "pure editorial (drop dark mode & accents)" vs "adapted"; stakeholder's "preserve what we have" directive settled it → adapted (Decisions 2-5).

## Technical Context

### Files referenced by the plan

- `DESIGN.md` — spec (tokens, type scale, components, do's/don'ts, Tailwind v4 `@theme` quick start)
- `src/styles.css` — `:root` light tokens (L248), `data-font` presets (L222), `@theme inline` (L644), `.dark` (L777), `data-primary` presets (L835-984), landing CSS (L24-120), legacy effects (L731-775), MapLibre overrides (L986)
- `src/components/ui/button.tsx` — cva button pattern used as the Phase 3 reference
- `src/components/ui/*` — 24 primitives restyled in Phase 3
- `plans/landing-page-redesign/PLAN.md` — repo plan-convention reference
- Planned new file: `docs/ui-design-system.md` (Phase 10)

### Existing mechanisms preserved

- `@custom-variant dark` (`.dark` class strategy)
- `data-primary` × 8 presets, `data-font` × 5 presets, workspace theme customization
- Motion scale (`--duration-*`, `--ease-*`, panel springs) — out of scope
- Recharts chart tokens; MapLibre map chrome overrides

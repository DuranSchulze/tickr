# UI Redesign — Editorial Design System Rollout

> **Spec:** [DESIGN.md](../../../DESIGN.md) — ElevenLabs-style "warm cream editorial" reference (eggshell canvas, ink type, pill buttons, whisper shadows).
> **Status:** ✅ Implemented. Validation green: typecheck, lint (`--max-warnings 0`), production build all pass; test suite 374/375 (the single failure is a pre-existing, unrelated payroll-period assertion in `src/lib/time-tracker/payroll-periods.test.ts`).
> **Constraint:** Visual/theme-only change. **No functional, behavioral, route, or component-API changes.** Same components, new look.
> **Adaptation reference:** [docs/ui-design-system.md](../../../docs/ui-design-system.md).
> **Screenshots:** `plans/ui-redesign/after/` (captured against the built app; see the Capture section below).

## Status

- [x] Plan created, reviewed, and aligned with the existing token architecture.
- [x] Phase 1: Prerequisites & audit.
- [x] Phase 2: Design token foundation (`src/styles.css`).
- [x] Phase 3: UI primitives restyle (`src/components/ui/`).
- [x] Phase 4: App shell & time-tracker dashboard.
- [x] Phase 5: Feature screens (analytics, members, catalogs, settings, reports, timesheet, etc.).
- [x] Phase 6: Marketing & public pages (landing, auth, pricing, invite, onboarding, lounge).
- [x] Phase 7: Charts, maps & dataviz accents.
- [x] Phase 8: Theme customization UX (Settings screen).
- [x] Phase 9: Validation sweep (typecheck, lint, tests, build, visual QA matrix).
- [x] Phase 10: Documentation.

### Capture (Phase 9)

```bash
pnpm dev                                   # serve on :3000
node plans/ui-redesign/scripts/shoot.mjs plans/ui-redesign/after "/" "/pricing" "/auth" "/onboarding"
node plans/ui-redesign/scripts/shoot-app.mjs plans/ui-redesign/after
```

`shoot-app.mjs` covers authenticated screens in both themes. The seeded dev
credentials in `src/lib/dev-credentials.ts` do **not** exist in this database, and
both dev workspaces' trials have lapsed (which gates every app screen behind the
billing wall), so the script temporarily sets a password for one existing member and
extends that workspace's trial, then restores both in a `finally` block. Confirm it
printed `subscription restored` / `original password hash restored` before trusting a
capture run.

---

## 1. Goal

Re-skin the entire Trackly UI — from the current sharp-cornered, accent-saturated, `--radius: 0` look to the warm cream editorial system defined in DESIGN.md, while **preserving everything that exists today**: all screens, all components, dark mode, the 8 accent-color presets, the 5 font presets, workspace theme customization, charts, maps, and every user workflow.

The redesign changes **how the system looks and feels**, not what it does:

1. **Surfaces** — eggshell `#fdfcfc` page canvas, warm taupe `#f5f3f1` secondary surfaces, stone `#ebe8e4` hairline borders. No pure white, no cold grays (DESIGN.md §Tokens—Colors, §Surfaces, §Do/Don't).
2. **Type** — Inter becomes the editorial voice: weight 400/500 for body, weight 300 with `-0.02em` tracking for display headings (Waldenburg substitute, per DESIGN.md §Typography).
3. **Shapes** — pill buttons/tags (`9999px`), 20px card radii, 4px input radii (DESIGN.md §Spacing & Shapes).
4. **Elevation** — hairline borders and whisper shadows only; heavy drop shadows eliminated (DESIGN.md §Elevation, §Don't).
5. **Action hierarchy** — black `#000000` filled pill buttons paired with eggshell outline pills as the _only_ CTA hierarchy; accent colors are demoted from "fills everything" to sparks: focus rings, active states, running-timer glow, chart leads (DESIGN.md §Components, §Do/Don't).

---

## 2. Assumptions & Decisions

No stakeholder interview was held for this redesign; the following defaults apply and are each marked for review during Phase 1.

| #   | Decision                | Chosen Default                                                                                                                                                                                                                             | Alternatives                                         |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| A1  | **Scope**               | Visual/theme-only. Zero functional, routing, or component-API changes. Layout grids and component structure preserved.                                                                                                                     | Structural redesign, layout changes, UX flows        |
| A2  | **Spec authority**      | DESIGN.md is the spec. Deviations are documented in §3 (Token Architecture) and `docs/ui-design-system.md` (Phase 10).                                                                                                                     | Treat DESIGN.md as loose inspiration                 |
| A3  | **Dark mode**           | **Kept.** Remapped to a "graphite editorial" warm-dark palette (§3.2). Dark mode is a first-class citizen of the new system, not a legacy afterthought.                                                                                    | Remove dark mode                                     |
| A4  | **Accent presets**      | **Kept.** All 8 `data-primary` presets keep working but are **rebalanced**: `--primary` stops filling main CTA buttons (ink does) and instead drives rings, active/current states, links, focus halos, running glow, and chart leads.      | Remove accent picker; accent everywhere (status quo) |
| A5  | **Font presets**        | **Kept.** All 5 `data-font` presets keep working. Inter (already bundled, [styles.css:6](../../../src/styles.css)) becomes the default face; display headings use Inter 300 + tight tracking.                                              | Single hardcoded font                                |
| A6  | **Radius**              | Named radii replace the flat `--radius: 0` look: inputs 4px, cards 20px, large cards 24px, buttons/tags pill. The legacy `--radius` scale stays for compatibility.                                                                         | Keep sharp corners; global rounded-2xl               |
| A7  | **Spark accents**       | Violet `#0447ff` and ember `#ff4704` tokens ship as decoration-only accents (empty states, celebration moments, marketing art). Never buttons/links/badges (DESIGN.md §Don't).                                                             | Skip spark accents                                   |
| A8  | **Delivery strategy**   | Token-first cascade: tokens → primitives → shell/dashboard → screens → marketing → dataviz → settings → validation. Each phase is independently verifiable with `pnpm check-all`.                                                          | Per-route big-bang cutover                           |
| A9  | **Chart palette**       | Existing `--chart-1..5` green ramp is kept functional but re-tuned toward warmer, editorial-compatible hues in Phase 7. Charts are the sanctioned "product visual" color exception.                                                        | Force charts achromatic (illegible)                  |
| A10 | **Mono font**           | Geist Mono is **not** downloaded. `--font-mono` maps to the system mono stack (`ui-monospace, SFMono-Regular, Menlo…`).                                                                                                                    | Add `@fontsource/geist-mono` dependency              |
| A11 | **Legacy brand tokens** | The copper/gold/cream/charcoal tokens at [styles.css:682-690](../../../src/styles.css) and effects `.card-hover`, `.glow-copper`, `.border-gold-accent`, `.grain-texture` are restyled to whisper-shadow equivalents or removed if unused. | Keep legacy effects                                  |

---

## 3. Token Architecture (the novel core — full detail)

This section is the heart of the redesign. Everything downstream (primitives, screens, marketing) consumes these tokens, so it is specified in full.

### 3.1 Light palette — "cream editorial"

Implements DESIGN.md §Tokens—Colors, §Surfaces, §Elevation. Semantic mapping onto the existing shadcn variable contract ([styles.css:248-340](../../../src/styles.css)):

| Token                                                   | Value                                         | Editorial role                                                                         | DESIGN.md source       |
| ------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------- |
| `--background`                                          | `#fdfcfc`                                     | Eggshell page canvas                                                                   | Eggshell               |
| `--foreground`                                          | `#000000`                                     | Ink primary text                                                                       | Ink                    |
| `--card`                                                | `#fdfcfc`                                     | Card surface (whisper shadow separates)                                                | Eggshell / White Card  |
| `--card-foreground`                                     | `#000000`                                     |                                                                                        | Ink                    |
| `--popover`                                             | `#fdfcfc`                                     | Floating surfaces                                                                      | Eggshell               |
| `--popover-foreground`                                  | `#000000`                                     |                                                                                        | Ink                    |
| `--primary`                                             | _(per `data-primary` preset, default violet)_ | Accent: links, active states, rings, glow, charts — **not CTA fills**                  | Accent rebalance (A4)  |
| `--primary-foreground`                                  | `oklch(0.99 0 0)`                             |                                                                                        | —                      |
| `--secondary`                                           | `#f5f3f1`                                     | Warm taupe secondary surfaces                                                          | Warm Taupe             |
| `--secondary-foreground`                                | `#44403b`                                     | Graphite text on taupe                                                                 | Graphite               |
| `--muted`                                               | `#f5f3f1`                                     | Muted bands, hover washes                                                              | Warm Taupe             |
| `--muted-foreground`                                    | `#777169`                                     | Body/secondary text                                                                    | Smoke                  |
| `--accent`                                              | _(per `data-primary` preset)_                 | Same as `--primary` (preset-driven)                                                    | —                      |
| `--accent-foreground`                                   | `oklch(0.99 0 0)`                             |                                                                                        | —                      |
| `--destructive`                                         | `#c0392b`→ keep current oklch                 | Destructive actions are functional, exempt from achromatic rule                        | —                      |
| `--border`                                              | `#ebe8e4`                                     | Stone hairlines                                                                        | Stone                  |
| `--input`                                               | `#ebe8e4`                                     | Input hairlines                                                                        | Stone                  |
| `--ring`                                                | `#000000`                                     | Focus halos render as ink at low alpha (components already use `/50`, `/20` opacities) | Elevation §focus halos |
| `--sidebar`                                             | `#f5f3f1`                                     | Sidebar sits one step deeper than canvas                                               | Warm Taupe             |
| `--sidebar-foreground`                                  | `#000000`                                     |                                                                                        | Ink                    |
| `--sidebar-primary`                                     | _(per preset)_                                | Active nav item                                                                        | Accent rebalance       |
| `--sidebar-accent`                                      | `#ebe8e4`                                     | Hover/nav wash                                                                         | Stone                  |
| `--sidebar-border`                                      | `#ebe8e4`                                     |                                                                                        | Stone                  |
| `--sidebar-ring`                                        | `#000000`                                     |                                                                                        | —                      |
| New `--ash`                                             | `#a59f97`                                     | Faintest helper text                                                                   | Ash                    |
| New `--graphite`                                        | `#44403b`                                     | Strong secondary text                                                                  | Graphite               |
| New `--eggshell` / `--warm-taupe` / `--stone` / `--ink` | as above                                      | Raw palette for one-off use                                                            | Tokens—Colors          |

Named radii (implements DESIGN.md §Border Radius; replaces the flat `--radius: 0` default):

```css
:root {
  /* ...existing motion scale stays untouched... */

  /* ─── Editorial radius (DESIGN.md §Spacing & Shapes) ─── */
  --radius-input: 4px; /* inputs, small elements   */
  --radius-card: 20px; /* cards, dialogs, drawers  */
  --radius-card-lg: 24px; /* large feature cards      */
  --radius-button: 9999px; /* buttons, tags, tab pills */
  /* Legacy scale kept for compatibility with existing component classes */
  --radius: 0.25rem; /* was 0 — base unit now 4px */
}
```

Whisper shadows (implements DESIGN.md §Shadows / §Elevation):

```css
:root {
  /* Buttons + elevated cards: 1px hard edge + 1px blur + 4px blur @ 4% */
  --shadow-whisper:
    rgba(0, 0, 0, 0.4) 0 0 1px 0, rgba(0, 0, 0, 0.04) 0 1px 1px 0,
    rgba(0, 0, 0, 0.04) 0 2px 4px 0;
  /* Inset border / focus halo */
  --shadow-inset-hairline: rgba(0, 0, 0, 0.075) 0 0 0 0.5px inset;
  /* Slightly stronger inset for emphasized plates */
  --shadow-inset-plate: rgba(0, 0, 0, 0.1) 0 0 0 1px inset;
}
```

Typography utilities (implements DESIGN.md §Typography — Waldenburg substituted by Inter 300 per the spec's own Substitute note):

```css
/* Display voice: whisper-weight Inter, tight tracking. Apply to page/section
   headings 32px+; body copy stays default font-sans (Inter 400/500). */
.font-display {
  font-weight: 300;
  letter-spacing: -0.02em;
  line-height: 1.08;
}
/* Type scale tokens (DESIGN.md §Type Scale) */
:root {
  --text-display: 48px; /* landing hero only            */
  --text-heading: 36px; /* marketing section headings   */
  --text-heading-sm: 32px; /* page titles                  */
  --text-body-lg: 20px;
  --text-subheading: 18px;
  /* body 16 / body-sm 14 / caption 10 already exist as Tailwind defaults */
}
```

Spark accents, decoration-only (A7):

```css
:root {
  --color-violet-spark: #0447ff;
  --color-ember-orange: #ff4704;
}
```

### 3.2 Dark palette — "graphite editorial" (novel — full detail)

DESIGN.md is light-only; this dark mapping is the project's adaptation (A3). Same warm hue family, surfaces step _up_ from the canvas instead of down:

| Token                            | Value                                                 | Rationale                                                   |
| -------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| `--background`                   | `#161412`                                             | Warm near-black canvas (not blue-gray like today's `.dark`) |
| `--foreground`                   | `#f5f3f1`                                             | Warm off-white ink                                          |
| `--card`                         | `#1d1a18`                                             | One step above canvas                                       |
| `--popover`                      | `#1d1a18`                                             |                                                             |
| `--secondary`                    | `#262220`                                             | Taupe-dark                                                  |
| `--muted`                        | `#262220`                                             |                                                             |
| `--muted-foreground`             | `#a59f97`                                             | Ash — quiet body text                                       |
| `--border` / `--input`           | `#35302b`                                             | Warm graphite hairlines                                     |
| `--ring`                         | `#f5f3f1`                                             | Light halo at low alpha                                     |
| `--sidebar`                      | `#12100e`                                             | Sidebar deeper than canvas (inverted vs light)              |
| `--sidebar-accent`               | `#262220`                                             |                                                             |
| `--sidebar-border`               | `#35302b`                                             |                                                             |
| `--destructive`                  | keep current dark oklch                               |                                                             |
| `--shadow-whisper` (dark)        | `rgba(0,0,0,0.5) 0 0 1px, rgba(0,0,0,0.25) 0 2px 4px` | Shadows read on dark                                        |
| `--shadow-inset-hairline` (dark) | `rgba(255,255,255,0.08) 0 0 0 0.5px inset`            | Light hairline                                              |

`data-primary` dark presets ([styles.css:844-984](../../../src/styles.css)) stay as-is — they already lighten the accent for dark backgrounds.

### 3.3 What stays untouched

- Motion scale (`--duration-*`, `--ease-*`, panel/dropdown/modal springs) — the redesign is not a motion redesign.
- `@custom-variant dark`, `@theme inline` mapping, MapLibre override block.
- `data-primary` / `data-font` preset mechanisms (values rebalanced where noted, mechanism intact).
- `.running-glow` keyframes — hue now comes from accent presets (A4); only its background-mix percentages get tuned in Phase 4.

---

## 4. Phases

> Every phase ends with `pnpm check-all` (typecheck + lint + tests) green and, where UI changed, screenshots attached to the phase notes in this file.

### Phase 1 — Prerequisites & audit

_Why first: the redesign touches 500+ files' worth of styling surface. We need a hard inventory of what will be affected before tokens change, and baseline screenshots to diff against. External/manual setup steps live here per planning convention._

Implements: A1, A2 validation; DESIGN.md §Quick Start (token formats confirmed for Tailwind v4).

- [ ] Confirm decisions A1–A11 with the stakeholder; record any changes in this file's §2.
- [ ] Inventory hardcoded styling that bypasses tokens:
  - [ ] `grep -rn "oklch(" src/components --include="*.tsx" | grep -v styles.css` — hardcoded colors in components.
  - [ ] `grep -rln "shadow-lg\|shadow-xl\|shadow-2xl\|shadow-md" src/components` — heavy shadows to replace with `--shadow-whisper`.
  - [ ] `grep -rln "rounded-md\|rounded-lg\|rounded-none" src/components/ui` — radius call sites to re-point at named radii.
  - [ ] Find all consumers of `.card-hover`, `.glow-copper`, `.border-gold-accent`, `.grain-texture`, and the copper/gold/cream/charcoal tokens (A11) — decide restyle vs remove per usage.
  - [ ] Find every direct `--primary` usage in marketing/landing CSS ([styles.css:24-120](../../../src/styles.css) ambient dots, scroll progress) — these become spark/ink-aware in Phase 6.
- [ ] Baseline screenshot sweep: extend the throwaway Playwright script (pattern: `playwright` is already a devDependency) to capture the top ~15 routes (dashboard, analytics, members, catalogs, settings, reports, timesheet, landing, pricing, auth, invite) in light + dark at desktop viewport; save to `plans/ui-redesign/baseline/`.
- [ ] Confirm font strategy: Inter Variable is already imported ([styles.css:6](../../../src/styles.css)); no new font packages (A10).
- [ ] Verify no `.env.local`/infra changes are needed — pure frontend work; flag anything discovered.

### Phase 2 — Design token foundation (`src/styles.css`)

_Why second: tokens cascade — once they land, primitives and screens pick the new look up automatically. This phase is the highest-leverage change and is specified in full in §3._

Implements: DESIGN.md §Tokens—Colors, §Typography, §Spacing & Shapes, §Shadows, §Elevation, §Surfaces, §Quick Start; A3–A7, A10, A11.

- [ ] Rewrite the light `:root` semantic block ([styles.css:248-340](../../../src/styles.css)) per §3.1 table — keep every variable name identical (no consumer breakage).
- [ ] Add raw palette tokens (`--eggshell`, `--warm-taupe`, `--stone`, `--ink`, `--graphite`, `--smoke`, `--ash`, sparks) to `:root`.
- [ ] Replace `--radius: 0` strategy with named radii per §3.1; set legacy `--radius` base to `0.25rem` so derived `--radius-md/lg/xl` stay sane.
- [ ] Add whisper/inset shadow tokens per §3.1.
- [ ] Rewrite the `.dark` block ([styles.css:777-809](../../../src/styles.css)) per §3.2.
- [ ] Add `.font-display` utility + type-scale tokens per §3.1.
- [ ] Register new tokens in the `@theme inline` block ([styles.css:644-695](../../../src/styles.css)) so Tailwind utilities (`bg-eggshell`, `text-smoke`, `shadow-whisper`, etc.) resolve.
- [ ] Keep all 8 `data-primary` preset pairs untouched except: remove any that set card/background-adjacent values (they don't today — verify).
- [ ] A11 cleanup: restyle `.card-hover` to `translateY(-2px)` + `var(--shadow-whisper)`; restyle `.glow-copper`/`.border-gold-accent` to whisper equivalents or delete if unused; map copper/gold/cream/charcoal `@theme` tokens to editorial approximations (`--color-gold` → graphite, etc.) to avoid breaking imports.
- [ ] Sanity-render: `pnpm dev`, open `/` and `/app/time-tracker` (light + dark). Expect: warm cream canvas, stone hairlines, ink text. Buttons/cards still sharp — that's Phase 3.
- [ ] `pnpm check-all` green.

### Phase 3 — UI primitives restyle (`src/components/ui/`)

_Why third: primitives are the atomic vocabulary; restyling them here propagates to every screen without touching screen code (A1)._

Implements: DESIGN.md §Components (Filled Pill Button, Outline Pill Button, Ghost Link Button, Feature Card, White Card with Whisper Shadow, Hairline Divider, Tab Pill); A6.

**Button — full reference implementation (the system's signature component; pill shape is non-negotiable per DESIGN.md §Do):**

Follow the cva pattern in [button.tsx](../../../src/components/ui/button.tsx); only the variant/size strings change:

```tsx
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform,filter] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)] outline-none select-none motion-reduce:transition-none focus-visible:shadow-[var(--shadow-inset-hairline)] focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Filled Pill Button: black fill, white text (DESIGN.md §Components)
        default:
          'bg-ink text-eggshell shadow-[var(--shadow-whisper)] hover:bg-ink/85',
        // Outline Pill Button: eggshell fill, ink text, stone border
        outline:
          'border-stone bg-eggshell text-ink shadow-[var(--shadow-whisper)] hover:bg-warm-taupe aria-expanded:bg-warm-taupe dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        // Taupe surface (formerly gray secondary)
        secondary:
          'bg-warm-taupe text-graphite hover:bg-stone aria-expanded:bg-stone aria-expanded:text-foreground',
        ghost:
          'text-ink hover:bg-warm-taupe hover:text-foreground aria-expanded:bg-warm-taupe aria-expanded:text-foreground dark:hover:bg-muted/50',
        // Destructive is functional — exempt from achromatic rule (A4 note)
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-ink underline-offset-4 hover:underline',
      },
      size: {
        // heights unchanged — only radii become pill
        default:
          'h-9 gap-1.5 px-4 in-data-[slot=button-group]:rounded-full has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        xs: 'h-6 gap-1 rounded-full px-2.5 text-xs in-data-[slot=button-group]:rounded-full [&_svg:not([class*=\"size-\"])]:size-3',
        sm: 'h-8 gap-1 rounded-full px-3 in-data-[slot=button-group]:rounded-full',
        lg: 'h-10 gap-1.5 px-5',
        icon: 'size-9 rounded-full',
        'icon-xs': 'size-6 rounded-full [&_svg:not([class*=\"size-\"])]:size-3',
        'icon-sm': 'size-8 rounded-full',
        'icon-lg': 'size-10 rounded-full',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)
```

- [ ] Button per reference above; sweep **all call sites** that assumed `default` = accent-colored (visual check in Phase 9 will catch stragglers).
- [ ] `card.tsx` — 20px radius; add `variant="taupe"` (Feature Card: `#f5f3f1` fill, no border, no shadow) and `variant="elevated"` (White Card with Whisper Shadow); default becomes elevated-on-eggshell.
- [ ] `input.tsx`, `password-input.tsx`, `combobox.tsx`, `searchable-create-popover.tsx` — 4px radius, stone hairline, eggshell fill, focus inset halo.
- [ ] `select.tsx`, `TimezoneSelect` — same input treatment; trigger gets pill-ish `radius-input` with stone border.
- [ ] `dialog.tsx`, `drawer.tsx`, `popover.tsx`, `dropdown-menu.tsx` — eggshell surface, `radius-card` (20px), stone hairline border, whisper shadow, no heavy blur-backdrop color shift.
- [ ] `table.tsx` — hairline row dividers (`border-stone`), taupe header row, no outer vertical borders.
- [ ] `calendar.tsx` — pill day cells (`radius-button`), ink-filled selected day, smoke out-of-month days.
- [ ] `pagination.tsx` — pill page items, ink active page.
- [ ] `kbd.tsx` — stone plate (`shadow-inset-plate`), graphite text, 4-6px radius.
- [ ] `theme-toggle.tsx` — restyle as ghost pill with ink icons.
- [ ] Badge/tag usages: grep for inline `rounded-full` badge classes across `src/components` and normalize to taupe fill + graphite text + pill (no new component file — this is a styling sweep).
- [ ] `BrandLogo` / `AppLogo` — no shape change; confirm logo mark reads on eggshell and graphite canvases (swap filter if needed).
- [ ] `pnpm check-all` green.

### Phase 4 — App shell & time-tracker dashboard

_Why fourth: the shell surrounds everything; the dashboard is the highest-traffic surface and exercises the most primitives (timer, entries, pickers, presets)._

Implements: DESIGN.md §Top Nav Bar (transparency/pill auth actions), §Hairline Divider; A4 (accent rebalance in running states).

- [ ] `AppSidebar` — taupe surface, stone group dividers, ink nav labels; **active item = accent-colored icon + ink label + stone wash** (accent demoted from full-fill to indicator, A4). Workspace switcher becomes outline-pill.
- [ ] `Navbar` / `AppShell` — app header becomes eggshell/transparent with hairline bottom border; user menu, notifications, theme toggle as ghost pills.
- [ ] `TimerPanel` — the hero surface: ink filled "Start"/"Stop" pill, eggshell/outline secondary actions, taupe preset tray (pill preset chips with stone borders). Running elapsed display: keep tabular numerics, ink digits, accent pulse ring (accent as spark).
- [ ] `.running-glow` tune — verify glow reads on eggshell (Phase 2 tokens); adjust mix percentages once, here, with the dashboard in view.
- [ ] Entries list (day/week/month) — rows separated by hairlines, running row keeps glow, action icons ghost.
- [ ] Pickers (client/project/tag/task pickers) — popover surfaces from Phase 3; ensure selected item = stone wash + accent check.
- [ ] `ManualEntryPanel`, edit drawer — 4px inputs, pill submit, hairline section dividers.
- [ ] Offline queue / sync indicators — accent-tinted status dots only (spark discipline).
- [ ] `pnpm check-all` green + screenshots (light/dark).

### Phase 5 — Feature screens

_Why fifth: screens inherit primitives; this phase is a styling sweep with a verification checklist, not new code patterns._

Implements: DESIGN.md §Layout (max-width, rhythm), §Hairline Divider; A1.

For each screen: replace heavy shadows with whisper, sharp corners with named radii, accent-fills with ink pills / taupe surfaces, and apply `.font-display` to page titles. Reference the dashboard patterns from Phase 4; no new patterns are introduced.

- [ ] Analytics + analytics overview + department analytics/member screens — `.font-display` page titles; chart containers become taupe Feature Cards; KPI stat cards become white-whisper cards.
- [ ] Members list + member detail — hairline table, pill role badges, ink primary actions.
- [ ] Catalogs (clients/projects/tags/departments/cohorts/roles) — uniform card grids → taupe cards with 20px radius; status pills (active/suspended) keep functional colors as tinted text + pill.
- [ ] Settings (workspace + profile) — section separation via Hairline Dividers instead of shadowed cards; inputs per Phase 3.
- [ ] Reports + timesheet + bulk report exports UI — filter bar as taupe band; export buttons ink/outline pills.
- [ ] Calendar + location history + workspace activity (map screen) — map chrome per Phase 7.
- [ ] My performance / leaderboard / public performance preview — podium/avatar treatments keep functional rank colors; rest to editorial.
- [ ] Audit logs, billing (subscription/Xendit), changelog, my-workspaces, onboarding-adjacent app screens.
- [ ] `pnpm check-all` green + screenshots (light/dark).

### Phase 6 — Marketing & public pages

_Why sixth: landing/auth/pricing are the editorial system's home turf (this is where DESIGN.md's 48px display type, tab pills, and trust-grid patterns apply in full), but they matter less to daily app usage — app surfaces go first._

Implements: DESIGN.md §Layout (hero asymmetry, 1280px column, 96-125px gaps), §Top Nav Bar, §Tab Pill, §Trust Logo Grid, §Logo Wordmark, §Agent Prompt Guide examples 1-5.

- [ ] Landing (`/`): hero headline → Inter 300, 48px, `-0.02em`, ink; CTA pair = filled ink pill + outline pill; section bands → eggshell ↔ taupe alternation; cards → taupe Feature Cards; `.landing-ambient-dot` and `.landing-scroll-progress` re-point from `--primary` to ink at low alpha (accent chrome ban, A4).
- [ ] Marketing section components (`src/components/marketing/*`) — FeaturesSection, HowItWorks, Testimonials, StatsBanner, PricingPreview, FaqSection, CtaBand, Footer, NewsletterSection: unify on the editorial rhythm; testimonial/pricing cards become taupe or white-whisper.
- [ ] Auth pages (`AuthSplitLayout`, sign-in/up, forgot/reset) — split-panel brand side: eggshell canvas, ink wordmark, whisper card for the form; submit = ink pill.
- [ ] Pricing (`/pricing`) — plan cards: white-whisper, ink "current plan" pill CTA, hairline comparison table.
- [ ] Invite acceptance (`/invite/$token`) and onboarding wizard — stepper pills, taupe step panels.
- [ ] Lounge + public performance (`/performance/$token`) — editorial typography, "Powered by Trackly" footer in smoke.
- [ ] 404/root error pages — ink on eggshell, outline pill home action.
- [ ] `pnpm check-all` green + screenshots (light + dark landing).

### Phase 7 — Charts, maps & dataviz accents

_Why seventh: dataviz is the exception zone — it needs deliberate decisions after the canvas it sits on has settled._

Implements: DESIGN.md §Tokens—Colors (spark discipline), §Imagery (monochrome iconography); A9.

- [ ] Re-tune `--chart-1..5` ramps (light + dark) to warmer editorial-compatible hues while keeping them mutually distinguishable; keep greens where "positive" semantics exist.
- [ ] Recharts consumers — axis lines to stone hairlines, gridlines to `color-mix(in oklab, var(--stone) 60%, transparent)`, tooltips to popover tokens, tabular numerics.
- [ ] Heatmap (analytics) — re-scale from accent-gradient to ink-density gradient (ink at low alpha = more hours); accent reserved for the "today" marker.
- [ ] MapLibre (activity map) — pins: ink for latest-entry, accent emerald→preset accent for running timers (keep semantic); popup surfaces use popover tokens; control chrome stays per existing override block.
- [ ] Confetti / celebration moments — may use spark accents (violet/ember) per A7.
- [ ] `pnpm check-all` green.

### Phase 8 — Theme customization UX (Settings screen)

_Why eighth: the customization UI must reflect the rebalanced system (accents are now sparks, not themes) — easiest to design once the new look is stable everywhere else._

Implements: A3–A6; DESIGN.md §Do (pill shape non-negotiable).

- [ ] Accent picker — restyle swatches as pills; add helper copy clarifying accent now drives highlights/active states; default stays violet.
- [ ] Font picker — restyle as outline-pill segmented control; default becomes Inter.
- [ ] Dark/light toggle preview — show mini eggshell/graphite canvas previews.
- [ ] Verify persistence path (`data-primary` / `data-font` / `.dark` attribute writers) needs no logic change — styling only.
- [ ] `pnpm check-all` green + screenshots.

### Phase 9 — Validation sweep

_Why ninth: a token-wide redesign breaks visual assumptions across hundreds of call sites; systematic verification is the phase gate._

- [ ] `pnpm check-all` — typecheck, lint (zero-warning), Vitest suite.
- [ ] `pnpm build` — production build clean.
- [ ] Playwright screenshot matrix — extend the Phase 1 script: top ~15 routes × {light, dark} × {default accent, teal preset}; save to `plans/ui-redesign/after/`; eyeball diff vs `baseline/`.
- [ ] Accent sweep — spot-check the 8 `data-primary` presets on dashboard + settings for readable contrast (accent text on eggshell/taupe).
- [ ] Contrast audit — smoke `#777169` on eggshell, ash `#a59f97` on taupe, and graphite text pairs pass WCAG AA for their sizes; adjust token values if not.
- [ ] Interaction QA — focus halos visible (keyboard tab through dashboard), dialog/drawer transitions intact, `prefers-reduced-motion` still honored, print styles (`/reports` PDF exports) unaffected.
- [ ] Cross-browser spot check — Chrome + Safari (MapLibre, dialog polyfills).
- [ ] Fix-forward pass — any straggler accent-filled CTA or heavy shadow found in screenshots gets a final sweep commit.

### Phase 10 — Documentation

_Required final phase: the adaptation decisions (especially the novel dark palette and accent rebalance) must be written down or the next developer will "fix" them back._

- [ ] Create `docs/ui-design-system.md` — the Trackly adaptation of DESIGN.md: token tables (§3.1-3.2 reproduced), named radii/shadows, `.font-display` usage rules, spark discipline, dark palette rationale, customization-system contract.
- [ ] Update `docs/system-overview.md` — add a "Design System" pointer under Branding & Configuration.
- [ ] Update `README.md` — note the editorial design system and link `docs/ui-design-system.md`.
- [ ] Update this file — check off phases, attach before/after screenshot links.

---

## 5. Risks & Callouts (for implementers)

- **Accent rebalancing (A4) is the widest-blast change.** Every `Button` with no `variant` prop currently renders accent-filled; after Phase 3 it renders ink. This is intended, but expect a visual diff wave in Phases 4-6 call-site sweeps.
- **`--radius: 0` today means many layouts may visually depend on sharp corners** (e.g., flush table-in-card). Verify card radius doesn't clip nested tables badly; use `overflow-hidden` + rounded wrappers consistently.
- **Do not** introduce violet/ember sparks into badges, buttons, or links (DESIGN.md §Don't) — confetti/empty-state art only.
- **Do not** rename or delete any CSS variable consumed by components — values change, names don't (A1).

---

## 6. Implementation notes (deviations & discoveries)

Everything below is what actually shipped, including the places the plan's letter had
to bend to the code. Full rationale lives in `docs/ui-design-system.md`.

### 6.1 Token-layer discoveries

- **Self-referencing `@theme` token.** The plan's §3.1 sketch wrote
  `--shadow-whisper` in `:root` _and_ registered it in `@theme inline` as
  `--shadow-whisper: var(--shadow-whisper)` — a circular reference that resolves to
  nothing. The raw values are now named `--elevation-whisper`,
  `--elevation-hairline`, `--elevation-plate`, and the `--shadow-*` names are the
  utility aliases. Do not "simplify" this back.
- **`--accent` is not the accent.** shadcn pairs `bg-accent` with
  `text-accent-foreground`, and the app used that pair ~160× as a hover/active
  _surface_. Mirroring the saturated preset there made dark-mode menu items unreadable
  (violet on near-black) and fought the achromatic rule. `--accent` is now pinned to
  the quiet warm wash in both modes; `--primary` / `--ring` / `--sidebar-primary`
  still track the preset. See §6.2 of the design-system doc.
- **The palette names are surface names.** `--ink` is the _filled-ink chip_ surface, so
  in dark mode it flips to near-white and `bg-ink/N` is the correct ink-density ramp.
  Consequently `text-ink` is always wrong — use `text-foreground`. The dark block also
  lifts `--graphite` / `--smoke` / `--ash` so text utilities stay legible without
  per-call-site `dark:` overrides.
- **Radius was re-pointed, not renamed.** With 447 `rounded-lg`, 212 `rounded-full`,
  118 `rounded-md` and 32 `rounded-xl` call sites, the standard scale was mapped onto
  the editorial values (`md`/`sm` → 4px, `lg` → 10px, `xl` → 20px, `3xl` → 24px)
  instead of editing ~700 sites. `--radius-input` / `--radius-card` /
  `--radius-card-lg` / `--radius-button` exist as the explicit intent names.
- **Legacy shadow utilities are re-pointed at whisper elevation**, so a stray
  `shadow-lg`/`shadow-2xl` cannot survive anywhere — this is a structural guarantee,
  not a sweep.
- **A11 cleanup:** `.grain-texture`, `.border-gold-accent`, `.glow-copper` and the
  copper/gold/cream/charcoal `@theme` colours had **zero consumers** and were deleted;
  `.card-hover` was restyled to a 2px lift + whisper elevation.
- **Landing motion CSS** re-points `.landing-scroll-progress` and `.landing-ambient-dot`
  from `--primary` to ink at low alpha (accent chrome ban).

### 6.2 Where the plan's letter changed

| Plan item                                    | What shipped                                                                             | Why                                                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `card.tsx` `variant="taupe"` / `"elevated"`  | shipped, plus `variant="plain"`; default is `elevated`                                   | Feature/whisper cards plus a hairline-only surface the settings screens needed                                                      |
| Button `size` padding → 16px / 14px          | heights and padding left at the existing shadcn values; **only radii became pill**       | Changing padding would shift every layout, which A1 rules out                                                                       |
| `.font-display` applied to page titles       | applied, and `font-bold`/`font-black` stripped from those titles                         | Adding the utility without dropping the weight would have been a no-op                                                              |
| Heatmap accent-gradient → ink-density        | shipped as `bg-ink/20 → /35 → /55 → /80` in both heatmaps                                | Accent reserved for the "today" marker                                                                                              |
| Decorative accent dots/bars → ink            | **kept as accent** (calendar/picker dots, sync + progress bars, leaderboard bars)        | PLAN §7 and DESIGN.md §Do allow accent for active indicators and chart leads; solid ink there would have made decorative dots black |
| MapLibre control chrome                      | restyled via the existing override block (eggshell, stone hairline, smoke text, whisper) | Kept the override mechanism intact                                                                                                  |
| Page max-width 1280px / section gap 96–125px | **not** imposed                                                                          | Layout grids stay as-is per A1; the marketing agent used the existing responsive container                                          |
| `lounge.tsx`, `performance.$token.tsx`       | unchanged                                                                                | No markup in the routes; they render components styled in their own scopes                                                          |

### 6.3 Verification actually performed

- `pnpm typecheck` → pass (run after every pass and at the end).
- `pnpm lint` (`--max-warnings 0`) → pass.
- `pnpm build` → pass.
- `pnpm test` → 374/375. The one failure
  (`buildPayrollPeriods > splits a single-cutoff month into 1–15 and 16–month-end`)
  is **pre-existing**: neither `payroll-periods.ts` nor its test is touched by this
  redesign (`git status` is clean for both). It was not "fixed" — that is functional
  work, out of scope.
- Visual matrix: 33 screenshots in `plans/ui-redesign/after/` — the public routes, plus
  13 authenticated routes × {light, dark}.
- A repo-wide residue audit confirms **zero** remaining `bg-background`, `bg-card`
  (except `ui/card.tsx` itself), `border-border`, `text-muted-foreground`,
  `text-secondary-foreground`, `text-ink`, `ring-1 ring-foreground/*`,
  `shadow-{sm,md,lg,xl,2xl}`, `hover:brightness-110`, or invalid
  `*-foreground-foreground` utilities.
- The two remaining `rounded-none` are deliberate: the calendar's `range_middle` cells
  and the day-button range-middle state span between two rounded end caps.

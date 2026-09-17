# UI Design System — Trackly "Editorial"

> The Trackly adaptation of the warm-cream editorial reference in [`DESIGN.md`](../DESIGN.md).
> **Status:** implemented. Source of truth for tokens: [`src/styles.css`](../src/styles.css).
> **Plan of record:** [`plans/ui-redesign/PLAN.md`](../plans/ui-redesign/PLAN.md).

This document exists so the next developer does not "fix" the deliberate deviations
from `DESIGN.md` back to the reference defaults. Everything here is a decision, not an
accident.

---

## 1. The one-paragraph summary

The interface is warm cream paper (`#fdfcfc`), black ink type, warm taupe secondary
surfaces, stone hairline borders, near-invisible "whisper" shadows, and pill-shaped
buttons. Display type is Inter at **weight 300** with **-0.02em** tracking (the
`DESIGN.md` Waldenburg substitute). Body copy is Inter 400/500 with **+0.01em**
tracking. Colour is 97% achromatic: the palette carries the brand, and the user's
chosen accent colour is a _spark_ (rings, active indicators, running-timer glow, chart
leads) — never a button fill.

**Black ink is the only CTA fill.** There is no second coloured CTA tier.

---

## 2. Token reference

All tokens live in `src/styles.css`. Names are **frozen** — only values may change.

### 2.1 Raw palette

| Token                         | Light        | Dark      | Role                                              |
| ----------------------------- | ------------ | --------- | ------------------------------------------------- |
| `--eggshell`                  | `#fdfcfc`    | `#1d1a18` | The "paper" surface — page canvas, cards, buttons |
| `--warm-taupe`                | `#f5f3f1`    | `#262220` | Secondary surface — bands, feature cards, washes  |
| `--stone`                     | `#ebe8e4`    | `#35302b` | Hairline borders, dividers, plates                |
| `--ink`                       | `#000000`    | `#f5f3f1` | The _filled-ink_ surface — text ink in light mode |
| `--graphite`                  | `#44403b`    | `#cfc9c1` | Strong secondary text                             |
| `--smoke`                     | `#777169`    | `#a8a29a` | Body / muted text — the dominant quiet voice      |
| `--ash`                       | `#a59f97`    | `#6f6a63` | Faintest helper text (footnote only)              |
| `--hairline`                  | `#e5e5e5`    | `#35302b` | Button borders per `DESIGN.md` §Components        |
| `--violet-spark`              | `#0447ff`    | —         | Product-visual spark. **Decoration only.**        |
| `--ember-orange`              | `#ff4704`    | —         | Product-visual spark. **Decoration only.**        |
| `--primary-action`            | `--ink`      | `#f5f3f1` | The single CTA fill                               |
| `--primary-action-foreground` | `--eggshell` | `#161412` | Text on the CTA fill                              |

> **The palette names are SURFACE names, not colour names.** `bg-eggshell` always means
> "the paper" and `bg-ink` always means "a filled-ink chip", so both flip with the mode.
> Never use `text-ink`: it would be near-white-on-cream in dark mode. Text uses
> `text-foreground` / `text-muted-foreground` or the raw text tones (`text-smoke`,
> `text-graphite`), which are lifted for dark mode.

### 2.2 Semantic mapping (shadcn contract)

`--background`/`--foreground`, `--card`, `--popover`, `--secondary`, `--muted`,
`--border`, `--input`, `--ring`, `--sidebar*` all map onto the palette above. The
variable **names are unchanged** from the pre-redesign contract, so every existing
consumer keeps working.

| Semantic token         | Light              | Dark      |
| ---------------------- | ------------------ | --------- |
| `--background`         | eggshell `#fdfcfc` | `#161412` |
| `--foreground`         | ink `#000000`      | `#f5f3f1` |
| `--card`               | eggshell           | `#1d1a18` |
| `--popover`            | eggshell           | `#1d1a18` |
| `--secondary`          | warm taupe         | `#262220` |
| `--muted`              | warm taupe         | `#262220` |
| `--muted-foreground`   | smoke `#777169`    | `#a59f97` |
| `--border` / `--input` | stone `#ebe8e4`    | `#35302b` |
| `--ring`               | ink `#000000`      | `#f5f3f1` |
| `--sidebar`            | warm taupe         | `#12100e` |
| `--sidebar-accent`     | stone              | `#262220` |
| `--accent`             | warm taupe         | `#2a2523` |
| `--accent-foreground`  | ink                | `#f5f3f1` |

#### The accent-surface decision (read this before changing `--accent`)

`--primary` is the **user's chosen accent preset** (8 presets under
`html[data-primary]`). `--accent` is the **surface** companion that shadcn pairs with
`--accent-foreground`, and the app uses `bg-accent` ~160 times as a menu/hover/active
wash. Historically `--accent` mirrored the saturated preset, which produced
unreadable dark-violet-on-black menu items in dark mode and fought the achromatic
rule in light mode.

Decision: `--accent` is pinned to the quiet warm wash in **both** modes, via a rule
that follows every preset block:

```css
html[data-primary] {
  --accent: var(--warm-taupe);
  --accent-foreground: var(--ink);
}
```

`--primary`, `--ring` and `--sidebar-primary` still track the preset, so the accent
still shows up exactly where the design system wants it: focus rings, active
indicators, links, the running-timer glow, and chart leads.

### 2.3 Radius

`DESIGN.md` §Border Radius, mapped onto the standard Tailwind radius scale so that
existing `rounded-md` / `rounded-lg` / `rounded-xl` call sites land on the right shape
without editing 700+ sites.

| Utility                             | Value  | Use                               |
| ----------------------------------- | ------ | --------------------------------- |
| `--radius-xs` (2px)                 | 2px    | dots, micro chips                 |
| `--radius-sm`                       | 4px    | kbd, menu items                   |
| `--radius-md` / `--radius-input`    | 4px    | inputs, selects, textareas        |
| `--radius-lg`                       | 10px   | small elements upper bound        |
| `--radius-2xl`                      | 16px   | medium plates                     |
| `--radius-xl` / `--radius-card`     | 20px   | cards, dialogs, drawers, popovers |
| `--radius-3xl` / `--radius-card-lg` | 24px   | large feature cards               |
| `--radius-button`                   | 9999px | **buttons, tags, tab pills**      |

The legacy `--radius: 0.25rem` base is kept only for compatibility.

### 2.4 Elevation

Two real shadows, plus deliberate re-pointing of the Tailwind shadow scale.

| Token                  | Value                                                                          |
| ---------------------- | ------------------------------------------------------------------------------ |
| `--elevation-whisper`  | `rgba(0,0,0,.4) 0 0 1px, rgba(0,0,0,.04) 0 1px 1px, rgba(0,0,0,.04) 0 2px 4px` |
| `--elevation-hairline` | `rgba(0,0,0,.075) 0 0 0 .5px inset`                                            |
| `--elevation-plate`    | `rgba(0,0,0,.1) 0 0 0 1px inset`                                               |

`--shadow-whisper`, `--shadow-inset-hairline` and `--shadow-inset-plate` are the
utility-facing aliases registered in `@theme inline`.

**Why the raw tokens are named `--elevation-*`:** registering a token as
`--shadow-whisper: var(--shadow-whisper)` inside `@theme inline` is a self-reference
and resolves to nothing. The raw values therefore have distinct names, and the
`--shadow-*` names are the aliases. Do not "simplify" this back.

`--shadow-xs`, `-sm`, `-md`, `-lg`, `-xl`, `-2xl` and `--shadow-subtle*` are all
re-pointed at whisper elevation, so a stray heavy shadow class cannot survive anywhere
in the app. In dark mode, whisper becomes
`rgba(0,0,0,.5) 0 0 1px, rgba(0,0,0,.25) 0 2px 4px` and the inset hairlines become
white at 8–10% alpha.

### 2.5 Type

| Token                 | Value                               |
| --------------------- | ----------------------------------- |
| `--text-display`      | 48px / 1.08 / -0.02em (hero only)   |
| `--text-heading`      | 36px / 1.17 / -0.02em (marketing)   |
| `--text-heading-sm`   | 32px / 1.13 / -0.02em (page titles) |
| `--text-body-lg`      | 20px / 1.35                         |
| `--text-subheading`   | 18px / 1.6                          |
| `--font-weight-light` | 300                                 |

- `.font-display` — the editorial display voice: `font-family: var(--font-display)`,
  weight **300**, `-0.02em`, line-height `1.08`. Apply to page/section/hero titles.
- `h1`–`h4` inherit the display voice from the base layer.
- Body copy gets `+0.01em`; the opposite tracking directions between display and body
  are intentional.
- `--font-display` maps to the active `[data-font]` heading family, so a user who
  picks a preset still gets their face at the editorial weight and tracking.

### 2.6 Font presets (A5)

All five `[data-font]` presets still work. **Inter is the editorial default**: the
preset fallback chains put `'Inter Variable'` in front of `system-ui`, so the system
default face is editorial rather than a generic sans. Inter Variable was already
bundled — no new font dependency was added (Geist Mono is deliberately skipped, A10;
`--font-mono` is the system mono stack).

---

## 3. Component rules

### 3.1 Buttons — the signature component

Pill radius is **non-negotiable**. The variant contract in
`src/components/ui/button.tsx`:

| Variant       | Treatment                                               |
| ------------- | ------------------------------------------------------- |
| `default`     | `bg-primary-action` ink fill + `--shadow-whisper`, pill |
| `outline`     | eggshell fill, stone hairline, ink text, pill           |
| `secondary`   | warm taupe fill, graphite text, pill                    |
| `ghost`       | no fill until hover (warm taupe wash)                   |
| `destructive` | functional colour, exempt from the achromatic rule      |
| `link`        | ink text, underline on hover                            |

`--primary` never appears as a button fill. This is the widest-blast change of the
redesign: every `<Button>` with no `variant` used to render accent-filled and now
renders ink, by design (A4).

### 3.2 Cards

`src/components/ui/card.tsx` takes a `variant`:

| Variant              | Treatment                                                        |
| -------------------- | ---------------------------------------------------------------- |
| `elevated` (default) | eggshell surface, stone hairline, whisper elevation, 20px radius |
| `taupe`              | warm taupe Feature Card — no border, no shadow                   |
| `plain`              | transparent surface, hairline only                               |

### 3.3 Inputs, overlays, tables

- **Inputs/selects/textarea** — 4px radius, stone hairline, eggshell fill, ink focus
  border with a 2px ink/20 halo.
- **Dialogs / drawers / popovers / dropdowns** — eggshell surface, stone hairline,
  20px radius, whisper shadow.
- **Tables** — stone hairline row dividers, warm taupe header row, no heavy outer
  shadow, tabular numerals.
- **Calendar** — pill day cells, ink-filled selected day, smoke out-of-month days.
- **Pagination** — pill page items, ink active page.
- **Badges/tags** — pill shape, warm taupe or stone fill, graphite text. Functional
  status colours are kept as tinted text + pill.

### 3.4 Spark discipline

`--violet-spark` and `--ember-orange` are **decoration only**: celebration/confetti
moments, empty-state art, illustration accents. Never buttons, links, badges, borders
or any interactive chrome (`DESIGN.md` §Don't).

### 3.5 Charts and maps (A9)

Charts are the sanctioned "product visual" colour exception — an achromatic chart is
illegible. `--chart-1..5` are re-tuned to warmer editorial hues (sage → deep teal →
muted blue → warm clay → soft violet) in both modes, ordered light → deep so
sequential ramps still read as a ramp.

- Axis lines → stone hairlines; gridlines → `color-mix(in oklab, var(--stone) 60%, transparent)`.
- Tooltips → popover tokens; numbers use tabular numerals.
- The analytics **heatmap is an ink-density gradient** (`bg-ink/20 → /35 → /55 → /80`),
  not an accent gradient; accent is reserved for the "today" marker.
- Map pins: ink for the latest entry, accent for running timers; popups use popover
  tokens. The MapLibre control chrome uses the editorial surfaces.

---

## 4. The retained user-customisation contract (A3–A6)

The redesign is **visual only** — no functional, routing or component-API changes.

| Mechanism                                                   | Status                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| Dark mode (`.dark` class strategy)                          | **Kept**, remapped to the warm "graphite editorial" palette         |
| 8 `data-primary` accent presets                             | **Kept**; `--primary`/`--ring`/`--sidebar-primary` still track them |
| 5 `data-font` presets                                       | **Kept**; Inter is the default face                                 |
| Accent picker / font picker / theme toggle                  | **Kept**, restyled as pills — no logic change                       |
| Motion scale (`--duration-*`, `--ease-*`, panel springs)    | **Untouched** — this was not a motion redesign                      |
| `@custom-variant dark`, `@theme inline`, MapLibre overrides | **Kept**                                                            |

The persistence path (`document.documentElement` attribute writers in
`src/lib/theme.ts` and the `THEME_INIT_SCRIPT` in `src/routes/__root.tsx`) was not
modified. Accent ids, font ids and storage keys are unchanged.

### 4.1 Dark mode — "graphite editorial"

`DESIGN.md` is light-only, so the dark palette is a Trackly adaptation: the same warm
hue family, but surfaces step **up** from the canvas into the light instead of down.
The canvas is warm near-black `#161412` (not blue-grey), cards are `#1d1a18`, the
sidebar is _deeper_ than the canvas (`#12100e`, inverted versus light), hairlines are
`#35302b`, and the raw text tones lift for legibility.

### 4.2 Known deviation: accent text contrast

Accent presets include very light hues (`amber` 0.72 L, `pink` 0.72 L). Those are
low-contrast as **text** on eggshell; they were already used that way before the
redesign, and the redesign did not widen the surface. If you are touching a place
where an accent hue carries body-sized text on a light surface, prefer
`text-foreground` and let the accent carry a ring, icon or dot instead.

`smoke` on eggshell and `graphite` on taupe pass WCAG AA for body text. `ash` is a
footnote-only tone (~2.7:1) — do not use it for essential copy.

---

## 5. House rules

**Do**

- Use ink (`bg-primary-action`) for the single primary action, and outline/ghost pills
  for everything below it.
- Use pill radius on anything button-shaped; 20px on cards; 4px on inputs.
- Prefer a stone hairline over a shadow for separation.
- Stack surfaces eggshell → warm taupe → stone; never pure white or pure grey.
- Use `text-foreground` / `text-muted-foreground` (or `text-smoke` / `text-graphite`)
  for text. Never `text-ink`.
- Apply `.font-display` (or `text-heading*`) to titles and leave its weight at 300.

**Don't**

- Don't fill buttons, links or badges with `--primary` / `--violet-spark` /
  `--ember-orange`.
- Don't bold display type.
- Don't add blurred elevation shadows — whisper only.
- Don't rename or delete a CSS variable that components consume; change the value.
- Don't add a new accent colour.
- Don't add call-site `dark:` overrides for the palette tokens — they already flip.

---

## 6. Where to change what

| I want to…                       | Edit                                                    |
| -------------------------------- | ------------------------------------------------------- |
| change a colour/shape/type token | `src/styles.css` (`:root`, `.dark`, `@theme inline`)    |
| add an accent or font preset     | `src/styles.css` + `src/lib/theme.ts` + the settings UI |
| restyle a primitive              | `src/components/ui/*`                                   |
| restyle a screen                 | that screen's component, using the tokens above         |
| understand a redesign decision   | `plans/ui-redesign/PLAN.md` §2–3                        |
| see the original reference spec  | `DESIGN.md`                                             |

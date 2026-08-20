# Trackly Design System

> Design tokens, component conventions, layout structure, and visual language for Trackly (formerly Tickr / Time Tracker).

## The Look: Feel & Idea

The UI is built on **layered neutrals instead of lines**. Surfaces separate by tone, not by borders:

- **Off-white canvas, white surfaces.** The page background (`--background`) is white with a whisper of black (`oklch(0.972 …)`). Cards and the app chrome (navbar, sidebar) stay pure white — so content cards and navigation visibly _lift_ off the canvas without a single divider line.
- **Borderless chrome.** The navbar and sidebar have no borders and no translucency — they are clean white panels that flow as one, and the slightly darker content canvas behind them does the separation.
- **Tints over strokes.** Grouping and selection are expressed with background tints — `bg-muted` for neutral hover/resting states, `bg-primary/10` for accent identity (workspace block, active sub-nav). Hairlines (`border-border/70`, `border-primary/15`) appear only _inside_ components where structure needs it, never as chrome outlines.
- **Sharp corners, deliberately.** `--radius: 0` is an intentional design decision — the whole UI is square-cornered. `rounded-*` classes remain in markup as semantic hooks but render sharp (except `rounded-full` pills/dots and the `+4px` `--radius-xl`).
- **Accent with restraint.** The primary color marks identity and state — the solid active nav item, the workspace block tint, key numbers — and stays out of the way everywhere else. Quiet grays do the daily work.

---

## Table of Contents

1. [Color System](#1-color-system)
2. [Typography](#2-typography)
3. [Spacing & Layout](#3-spacing--layout)
4. [Border Radius](#4-border-radius)
5. [Shadows](#5-shadows)
6. [Component Library](#6-component-library)
7. [Layout Architecture](#7-layout-architecture)
8. [Icons](#8-icons)
9. [Charts](#9-charts)
10. [Print Styles](#10-print-styles)
11. [Animation](#11-animation)
12. [Responsive Breakpoints](#12-responsive-breakpoints)
13. [Interactive States](#13-interactive-states)
14. [Utility Classes](#14-utility-classes)
15. [File Organization](#15-file-organization)

---

## 1. Color System

### 1.1 Core Palette (CSS Custom Properties)

All colors are defined in `oklch()` color space for perceptual uniformity. Declared in `src/styles.css` at `:root` and overridden in `.dark`.

#### Light mode (`:root`)

| Token                      | Value                        | Purpose                                                                  |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| `--background`             | `oklch(0.972 0.002 17.2)`    | Page canvas — off-white ("white + a little black") so white surfaces pop |
| `--foreground`             | `oklch(0.147 0.004 49.3)`    | Primary text                                                             |
| `--card`                   | `oklch(1 0 0)`               | Card/surface/chrome background (pure white)                              |
| `--card-foreground`        | `oklch(0.147 0.004 49.3)`    | Card text                                                                |
| `--popover`                | `oklch(1 0 0)`               | Dropdown/modal background                                                |
| `--popover-foreground`     | `oklch(0.147 0.004 49.3)`    | Popover text                                                             |
| `--primary`                | `oklch(0.496 0.265 301.924)` | Accent / CTA (default violet)                                            |
| `--primary-foreground`     | `oklch(0.977 0.014 308.299)` | Text on primary                                                          |
| `--secondary`              | `oklch(0.967 0.001 286.375)` | Secondary surfaces                                                       |
| `--secondary-foreground`   | `oklch(0.21 0.006 285.885)`  | Text on secondary                                                        |
| `--muted`                  | `oklch(0.96 0.002 17.2)`     | Subtle background                                                        |
| `--muted-foreground`       | `oklch(0.547 0.021 43.1)`    | Secondary/helper text                                                    |
| `--accent`                 | `oklch(0.496 0.265 301.924)` | Interactive hover/selected                                               |
| `--accent-foreground`      | `oklch(0.977 0.014 308.299)` | Text on accent                                                           |
| `--destructive`            | `oklch(0.577 0.245 27.325)`  | Error/danger actions                                                     |
| `--destructive-foreground` | `oklch(0.99 0 0)`            | Text on destructive                                                      |
| `--border`                 | `oklch(0.922 0.005 34.3)`    | Dividers, borders                                                        |
| `--input`                  | `oklch(0.922 0.005 34.3)`    | Form field borders                                                       |
| `--ring`                   | `oklch(0.714 0.014 41.2)`    | Focus ring                                                               |
| `--radius`                 | `0`                          | Global border radius base                                                |

#### Dark mode (`.dark`)

| Token                    | Value                        |
| ------------------------ | ---------------------------- |
| `--background`           | `oklch(0.225 0.018 255)`     |
| `--foreground`           | `oklch(0.94 0.008 255)`      |
| `--card`                 | `oklch(0.275 0.02 255)`      |
| `--card-foreground`      | `oklch(0.94 0.008 255)`      |
| `--popover`              | `oklch(0.29 0.021 255)`      |
| `--popover-foreground`   | `oklch(0.94 0.008 255)`      |
| `--primary`              | `oklch(0.438 0.218 303.724)` |
| `--primary-foreground`   | `oklch(0.977 0.014 308.299)` |
| `--secondary`            | `oklch(0.325 0.022 255)`     |
| `--secondary-foreground` | `oklch(0.94 0.008 255)`      |
| `--muted`                | `oklch(0.315 0.02 255)`      |
| `--muted-foreground`     | `oklch(0.75 0.018 255)`      |
| `--accent`               | `oklch(0.438 0.218 303.724)` |
| `--accent-foreground`    | `oklch(0.977 0.014 308.299)` |
| `--destructive`          | `oklch(0.704 0.191 22.216)`  |
| `--border`               | `oklch(0.4 0.025 255)`       |
| `--input`                | `oklch(0.43 0.026 255)`      |
| `--ring`                 | `oklch(0.68 0.04 255)`       |

Dark mode keeps the same layering idea: the canvas (`0.225`) sits below cards and chrome (`0.275`), so surfaces separate by tone without borders.

#### Dark mode no-change tokens

Chart colors (`--chart-1` through `--chart-5`) are identical between light and dark modes.

### 1.2 Sidebar Tokens

The sidebar surface is pure white in light mode — it shares the card token's value so navbar, sidebar, and content cards read as one white chrome family against the off-white canvas.

| Token                          | Light                        | Dark                         |
| ------------------------------ | ---------------------------- | ---------------------------- |
| `--sidebar`                    | `oklch(1 0 0)`               | `oklch(0.255 0.02 255)`      |
| `--sidebar-foreground`         | `oklch(0.147 0.004 49.3)`    | `oklch(0.94 0.008 255)`      |
| `--sidebar-primary`            | `oklch(0.558 0.288 302.321)` | `oklch(0.627 0.265 303.9)`   |
| `--sidebar-primary-foreground` | `oklch(0.977 0.014 308.299)` | `oklch(0.977 0.014 308.299)` |
| `--sidebar-accent`             | `oklch(0.96 0.002 17.2)`     | `oklch(0.32 0.022 255)`      |
| `--sidebar-accent-foreground`  | `oklch(0.214 0.009 43.1)`    | `oklch(0.94 0.008 255)`      |
| `--sidebar-border`             | `oklch(0.922 0.005 34.3)`    | `oklch(0.39 0.024 255)`      |
| `--sidebar-ring`               | `oklch(0.714 0.014 41.2)`    | `oklch(0.68 0.04 255)`       |

### 1.3 Chart Colors

Consistent across both themes:

| Token       | Value                        |
| ----------- | ---------------------------- |
| `--chart-1` | `oklch(0.871 0.15 154.449)`  |
| `--chart-2` | `oklch(0.723 0.219 149.579)` |
| `--chart-3` | `oklch(0.627 0.194 149.214)` |
| `--chart-4` | `oklch(0.527 0.154 150.069)` |
| `--chart-5` | `oklch(0.448 0.119 151.328)` |

### 1.4 Brand-Specific Colors (Tailwind `@theme`)

Defined in `src/styles.css` under `@theme inline`:

| Token                    | Value                   | Use                |
| ------------------------ | ----------------------- | ------------------ |
| `--color-copper`         | `oklch(0.58 0.12 185)`  | Accent elements    |
| `--color-copper-light`   | `oklch(0.75 0.08 185)`  | Hover/light accent |
| `--color-copper-dark`    | `oklch(0.42 0.08 185)`  | Dark accent        |
| `--color-gold`           | `oklch(0.65 0.12 75)`   | Golden elements    |
| `--color-gold-light`     | `oklch(0.82 0.08 75)`   | Light gold         |
| `--color-cream`          | `oklch(0.98 0.005 240)` | Cream surface      |
| `--color-cream-dark`     | `oklch(0.88 0.01 240)`  | Dark cream         |
| `--color-charcoal`       | `oklch(0.18 0.02 250)`  | Dark text/surface  |
| `--color-charcoal-light` | `oklch(0.28 0.03 250)`  | Lighter charcoal   |

### 1.5 Primary Color Presets

Users can choose from 7 accent colors. Each preset overrides `--primary`, `--accent`, `--ring`, and `--sidebar-primary` in both light and dark modes. Set via `data-primary` attribute on `<html>`.

| ID                 | Light (L C H)          | Dark (L C H)           |
| ------------------ | ---------------------- | ---------------------- |
| `teal`             | `oklch(0.58 0.12 185)` | `oklch(0.7 0.12 185)`  |
| `violet` (default) | `oklch(0.55 0.22 295)` | `oklch(0.68 0.2 295)`  |
| `blue`             | `oklch(0.55 0.18 250)` | `oklch(0.7 0.16 245)`  |
| `emerald`          | `oklch(0.6 0.14 155)`  | `oklch(0.72 0.15 155)` |
| `rose`             | `oklch(0.62 0.2 15)`   | `oklch(0.72 0.2 15)`   |
| `amber`            | `oklch(0.72 0.17 75)`  | `oklch(0.82 0.15 75)`  |
| `pink`             | `oklch(0.72 0.16 350)` | `oklch(0.82 0.14 350)` |

Managed by `src/lib/theme.ts` — `applyPrimaryColor(id)` sets `data-primary` and dispatches a `primary-color-change` custom event.

### 1.6 Decorative CSS Classes

Defined in `src/styles.css`:

- **`.grain-texture`** — Pseudo-element overlay with SVG fractal noise filter at 40% opacity. Applies grain texture over any container.
- **`.border-gold-accent`** — Gradient border (`oklch(0.72 0.12 85) → oklch(0.65 0.14 55) → oklch(0.72 0.12 85)`) at 135° via `border-image`.
- **`.glow-copper`** — `box-shadow` with copper-tinted multi-layered glow (`0 0 20px oklch(0.65 0.14 55 / 0.3)`, `0 0 40px oklch(0.65 0.14 55 / 0.1)`).
- **`.card-hover`** — Card hover effect: `translateY(-4px)` + dark shadow + copper glow on hover.

---

## 2. Typography

### 2.1 Font Variables

| Variable         | Default                                                        | Purpose   |
| ---------------- | -------------------------------------------------------------- | --------- |
| `--font-sans`    | `'Roboto Variable', system-ui, sans-serif`                     | Body text |
| `--font-heading` | `'DM Sans Variable', 'Roboto Variable', system-ui, sans-serif` | Headings  |

Fonts are set on `<html>` via the `data-font` attribute. Supported font options (defined in `src/lib/theme.ts`):

| ID                 | Body Font          | Heading Font       |
| ------------------ | ------------------ | ------------------ |
| `roboto` (default) | Roboto Variable    | DM Sans Variable   |
| `dm-sans`          | DM Sans Variable   | DM Sans Variable   |
| `inter`            | Inter Variable     | Inter Variable     |
| `nunito`           | Nunito Variable    | Nunito Variable    |
| `work-sans`        | Work Sans Variable | Work Sans Variable |

All fonts loaded via `@fontsource-variable/*` npm packages.

### 2.2 Tailwind Font Utilities

- **`font-sans`** → maps to `var(--font-sans)` via the Tailwind `@theme` inline default.
- **`font-heading`** → maps to `var(--font-heading)` via the Tailwind `@theme` inline custom font family.
- **`font-mono`** → `source-code-pro, Menlo, Monaco, Consolas, 'Courier New', monospace`.

### 2.3 Typographic Conventions

| Element                  | Tailwind Classes                                 | Notes                              |
| ------------------------ | ------------------------------------------------ | ---------------------------------- |
| Page title (`<h1>`)      | `text-3xl font-black tracking-tight sm:text-4xl` | Responsive, tight tracking         |
| Section heading (`<h2>`) | `m-0 text-xl font-black tracking-tight`          | No margin, black weight            |
| Card title               | `m-0 flex items-center gap-2 text-sm font-bold`  | 14px bold with icon                |
| Eyebrow label            | `text-xs font-bold uppercase tracking-[0.18em]`  | Small caps with wide letterspacing |
| Body                     | `text-sm leading-6 text-muted-foreground`        | 14px with 24px line-height         |
| Table cell               | `text-sm`                                        | 14px                               |
| Small / helper           | `text-xs text-muted-foreground`                  | 12px                               |
| Time/duration            | `font-mono tracking-tight`                       | Monospace for numerals             |

Headings use `font-heading` and `font-black` (900 weight) consistently. The standard heading hierarchy uses `m-0` (zero margin) and relies on parent spacing.

---

## 3. Spacing & Layout

### 3.1 Spacing Scale

Uses Tailwind's default spacing scale (4px base). Common values:

| Class                               | Value         | Use                    |
| ----------------------------------- | ------------- | ---------------------- |
| `gap-1`                             | 4px           | Tight icon-text gaps   |
| `gap-1.5`                           | 6px           | Button icon spacing    |
| `gap-2`                             | 8px           | Flex/grid gaps         |
| `gap-3`                             | 12px          | Section element gaps   |
| `gap-4`                             | 16px          | Card inner spacing     |
| `gap-6`                             | 24px          | Section spacing        |
| `gap-10`                            | 40px          | Large section gaps     |
| `p-3` / `p-4` / `p-5` / `p-6`       | 12–24px       | Card/container padding |
| `px-6` / `px-4` / `px-3` / `px-2.5` | 24/16/12/10px | Horizontal padding     |
| `py-1` / `py-1.5` / `py-2` / `py-3` | 4–12px        | Vertical padding       |

### 3.2 Container Max Width

| Context           | Max Width                                 |
| ----------------- | ----------------------------------------- |
| App shell content | `max-w-[1600px]` (navbar)                 |
| Changelog page    | `max-w-3xl`                               |
| Dashboard cards   | Fluid (flex/grid)                         |
| Dialog            | `max-w-[calc(100%-2rem)]` → `sm:max-w-md` |
| Popover dropdown  | `min-w-32` (auto-width via trigger)       |

---

## 4. Border Radius

Based on `--radius: 0` (default zero). Computed radii:

| Token          | Value                 |
| -------------- | --------------------- |
| `--radius-sm`  | `-4px` → clamped to 0 |
| `--radius-md`  | `-2px` → clamped to 0 |
| `--radius-lg`  | `0`                   |
| `--radius-xl`  | `4px`                 |
| `--radius-2xl` | `calc(0 * 1.8)` → `0` |
| `--radius-3xl` | `calc(0 * 2.2)` → `0` |
| `--radius-4xl` | `calc(0 * 2.6)` → `0` |

**Effective radius:** `--radius: 0` is a deliberate choice — the entire UI is square-cornered. Keep `rounded-*` classes in markup as semantic hooks (they let us re-introduce rounding in one place if ever wanted), but understand they render sharp today. Only two exceptions produce visible rounding:

| Class                                        | Rendered                      | Use                               |
| -------------------------------------------- | ----------------------------- | --------------------------------- |
| `rounded-full`                               | always round                  | Avatars, pill chips, status dots  |
| `rounded-xl`                                 | `+4px` (from `calc(0 + 4px)`) | Rare soft accents                 |
| `rounded-md` / `rounded-lg` / `rounded-2xl`+ | **0 (square)**                | Buttons, inputs, cards, nav items |

---

## 5. Shadows

Consistent shadow strategy using `ring` borders instead of box shadows where possible:

| Pattern             | Implementation                                         |
| ------------------- | ------------------------------------------------------ |
| Card                | `shadow-xs ring-1 ring-foreground/10`                  |
| Dropdown/Popover    | `shadow-md ring-1 ring-foreground/10`                  |
| Dialog              | `ring-1 ring-foreground/10` (no shadow)                |
| Active button focus | `focus-visible:ring-3 focus-visible:ring-ring/50`      |
| Error focus         | `aria-invalid:ring-3 aria-invalid:ring-destructive/20` |
| Input               | `shadow-xs` (subtle)                                   |
| Dashboard header    | `shadow-sm`                                            |

---

## 6. Component Library

### 6.1 shadcn/ui Primitives (`src/components/ui/`)

All components follow shadcn/ui patterns — `data-slot` attributes, `cn()` for class merging, Radix UI primitives:

| Component                 | Radix Primitive           | Key Styles                                                                                                                                                                                                                    |
| ------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                  | `Slot.Root` via `asChild` | CVA-based: `default`, `outline`, `ghost`, `secondary`, `destructive`, `link`. Sizes: `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`. Active state: `active:translate-y-px`.                             |
| `Card`                    | Native `<div>`            | `rounded-xl`, `shadow-xs`, `ring-1 ring-foreground/10`. Sizes: `default` (gap-6, py-6) and `sm` (gap-4, py-4). Parts: `CardHeader`, `CardTitle` (font-heading), `CardDescription`, `CardContent`, `CardFooter`, `CardAction`. |
| `Dialog`                  | `DialogPrimitive`         | Centered modal. Overlay: `bg-black/10 backdrop-blur-xs`. Content: `rounded-xl`, `ring-1 ring-foreground/10`. Close button in top-right.                                                                                       |
| `Drawer`                  | `vaul`                    | Mobile-side sheet (from Vaul). Same overlay pattern as Dialog.                                                                                                                                                                |
| `DropdownMenu`            | `DropdownMenuPrimitive`   | `rounded-md`, `shadow-md`, `ring-1 ring-foreground/10`. Item: `focus:bg-accent focus:text-accent-foreground`.                                                                                                                 |
| `Input`                   | Native `<input>`          | `rounded-md`, `border-input`, `shadow-xs`. Focus: `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`. Error: `aria-invalid:border-destructive`.                                                      |
| `Label`                   | `LabelPrimitive`          | `text-sm leading-none font-medium`                                                                                                                                                                                            |
| `Select`                  | Native `<select>`         | `.scroll-my-1 p-1` content area. Parts mirror `DropdownMenu` patterns.                                                                                                                                                        |
| `Table`                   | Native `<table>`          | `<div>` wrapper for scroll: `overflow-x-auto`. Row: `border-b hover:bg-muted/50`.                                                                                                                                             |
| `Calendar`                | `react-day-picker`        | `rounded-xl` on cells. Nav: ghost buttons. Custom `captionLayout` support.                                                                                                                                                    |
| `Pagination`              | Native                    | Standard pagination controls.                                                                                                                                                                                                 |
| `Popover`                 | `PopoverPrimitive`        | Floating panel.                                                                                                                                                                                                               |
| `SearchableCreatePopover` | `PopoverPrimitive`        | Combobox with inline creation.                                                                                                                                                                                                |
| `Kbd`                     | Native `<kbd>`            | Keyboard shortcut display.                                                                                                                                                                                                    |
| `PasswordInput`           | Native `<input>` + Button | Visible/hidden toggle.                                                                                                                                                                                                        |
| `TimezoneSelect`          | Native `<select>`         | Timezone picker.                                                                                                                                                                                                              |
| `ThemeToggle`             | Native `<button>`         | Sun/Moon toggle.                                                                                                                                                                                                              |
| `AppLogo`                 | Native `<img>`            | Sized containers: `sm` (32px), `md` (44px), `lg` (56px).                                                                                                                                                                      |

### 6.2 Component Slot Attributes

Every shadcn/ui component uses `data-slot` for targeted styling:

| Attribute      | Example Values                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-slot`    | `"button"`, `"card"`, `"card-header"`, `"card-title"`, `"dialog"`, `"dialog-content"`, `"dialog-overlay"`, `"dropdown-menu"`, `"dropdown-menu-content"`, `"dropdown-menu-item"`, `"input"`, `"label"`, `"select"`, `"table"`, `"table-container"`, `"drawer"` |
| `data-variant` | `"default"`, `"outline"`, `"ghost"`, `"secondary"`, `"destructive"`, `"link"`                                                                                                                                                                                 |
| `data-size`    | `"default"`, `"sm"`, `"icon"` (on card/button)                                                                                                                                                                                                                |
| `data-inset`   | `"true"` (dropdown items with inset)                                                                                                                                                                                                                          |

### 6.3 State Selectors

Components use `data-*` attributes and Tailwind's `data-*` variant for state styling:

| State          | Selector             | Example                                                      |
| -------------- | -------------------- | ------------------------------------------------------------ |
| Disabled       | `data-disabled`      | `data-disabled:pointer-events-none data-disabled:opacity-50` |
| Open           | `data-open`          | `data-open:animate-in`                                       |
| Closed         | `data-closed`        | `data-closed:animate-out`                                    |
| Side (popover) | `data-[side=bottom]` | `data-[side=bottom]:slide-in-from-top-2`                     |
| Aria invalid   | `aria-invalid`       | `aria-invalid:border-destructive`                            |
| Aria expanded  | `aria-expanded`      | `aria-expanded:bg-muted`                                     |

---

## 7. Layout Architecture

### 7.1 App Shell

```
┌─────────────────────────────────────────────────┐
│  Navbar (sticky, z-40, h-[4.5rem])              │
│  ┌───────────────────────────────────────────┐   │
│  │ Logo + Name  │ WorkspaceSwitcher │ Avatar │   │
│  └───────────────────────────────────────────┘   │
├─────────┬───────────────────────────────────────┤
│Sidebar  │  Main Content (Outlet)                 │
│(hidden  │  overflow-y-auto, p-4 sm:p-6           │
│mobile,  │  max-w-[1600px] mx-auto                │
│260px or │                                        │
│60px     │                                        │
│collapsed)│                                       │
├─────────┴───────────────────────────────────────┤
│  (Embed footer — only when embed=1)              │
└─────────────────────────────────────────────────┘
```

**Key properties:**

- Full viewport (`h-screen w-full flex flex-col`)
- Sidebar: `lg:flex` (hidden below lg), `transition-[width] duration-200`
- Navbar: `sticky top-0 z-40`, backdrop-blur-xl, border-b
- Main: `min-w-0 flex-1 overflow-y-auto overflow-x-hidden`
- Embed mode: hides Navbar + Sidebar, adds footer

### 7.2 Navbar (`src/components/time-tracker/Navbar.tsx`)

- `h-[4.5rem]` with `px-4 py-3 sm:px-6`
- Left: Logo + BRAND.name (hidden on mobile)
- Right: Workspace live indicator (hidden below lg) → WorkspaceSwitcher → User avatar dropdown
- User dropdown: Name/email header → Profile settings → What's new → (separator) → Theme mode toggle → Accent color picker → (separator) → Sign out

### 7.3 Sidebar (`src/components/time-tracker/AppSidebar.tsx`)

- Width: `w-[260px]` expanded, `w-[60px]` collapsed
- Sections: Workspace info box → Timer → Calendar → Analytics (expandable) → Settings (expandable)
- Collapsed mode: icons only, labels hidden
- **Active state**: `bg-primary text-primary-foreground`
- **Inactive**: `text-muted-foreground hover:bg-accent hover:text-foreground`
- Expandable groups use `ChevronDown` rotation on toggle
- Nested children indented: `ml-3 border-l border-border`

### 7.4 Mobile Nav (`src/components/time-tracker/MobileNav.tsx`)

- Drawer (Vaul) triggered by hamburger menu
- Mirrors sidebar structure as a vertical drawer

### 7.5 Page Layout Conventions

| Page           | Layout Pattern                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Time Tracker   | `DashboardHeader` → `InputSection` (timer + manual entry) → `AllEntriesSection` (paginated entries) |
| Analytics      | Tabs/cards with maximize dialogs, `max-w-[1600px]` container                                        |
| My Performance | Card-based grid with performance badge, heatmap, charts                                             |
| Members        | Search bar → Table (scrollable)                                                                     |
| Catalogs       | Navigation cards → Nested content (clients, projects, tags, etc.)                                   |
| Changelog      | `mx-auto max-w-3xl` — timeline layout with vertical line + dot + release cards                      |

---

## 8. Icons

Two icon libraries used simultaneously:

| Library          | Import Path                  | When to Use                                               |
| ---------------- | ---------------------------- | --------------------------------------------------------- |
| **Lucide React** | `from 'lucide-react'`        | Primary — nav, actions, general UI                        |
| **Tabler Icons** | `from '@tabler/icons-react'` | Supplemental — check marks, chevrons, close, calendar nav |

Icon sizing convention: `size-4` (16px) default, `size-3.5` (14px) for compact, `size-3` (12px) for inline. All icons use `shrink-0`.

---

## 9. Charts

Powered by **Recharts**. Chart color tokens (5 levels) defined as CSS custom properties `--chart-1` through `--chart-5`.

Chart types used in the app:

- **Pie charts** — department/member analytics
- **Bar charts** — time breakdowns
- **Heatmap** — activity intensity (My Performance page)
- **Line charts** — trends over time

---

## 10. Print Styles

Defined in `src/styles.css`:

```css
@media print {
  .no-print {
    display: none !important;
  }
  main {
    overflow: visible !important;
    padding: 0 !important;
  }
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
```

- Navbar and Sidebar marked with `print:hidden`
- Report exports (PDF) use landscape (bulk) or portrait (individual) layouts

---

## 11. Animation

### 11.1 Motion Preferences

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 11.2 Common Animations

| Pattern            | Implementation                                                           |
| ------------------ | ------------------------------------------------------------------------ |
| Dropdown entrance  | `data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95`          |
| Dropdown exit      | `data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95` |
| Dialog entrance    | `data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95`          |
| Sidebar width      | `transition-[width] duration-200 ease-in-out`                            |
| Collapse indicator | `transition-transform duration-200` (ChevronDown rotation)               |
| Card hover         | `transition: transform 0.3s ease, box-shadow 0.3s ease`                  |
| Nav active ping    | `animate-ping` (live indicator dot)                                      |
| Spinner            | `animate-spin` (loading states)                                          |
| Reduce motion      | All animations disabled per user preference                              |

---

## 12. Responsive Breakpoints

Using Tailwind's default breakpoints:

| Breakpoint | Min Width | Behavior                                                    |
| ---------- | --------- | ----------------------------------------------------------- |
| `sm`       | 640px     | Container padding increases, single-column → two-column     |
| `md`       | 768px     | Text scales to `md:text-sm`                                 |
| `lg`       | 1024px    | Sidebar becomes visible (`lg:flex`), live indicator visible |
| `xl`       | 1280px    | Full width utilization                                      |
| `2xl`      | 1536px    | Not commonly used                                           |

### Mobile-Specific Patterns

- **Sidebar** → Drawer (Vaul) triggered by hamburger
- **Dialogs** → Full-screen on mobile (`sm:max-w-md` constraint dropped on very small)
- **Tables** → Horizontal scroll wrapper (`overflow-x-auto`)
- **Timer** → Streamlined mobile form (no Options sheet)
- **Touch targets** → Enlarged for thumb interaction

---

## 13. Interactive States

| State            | Visual Treatment                                                               |
| ---------------- | ------------------------------------------------------------------------------ |
| Default          | `text-muted-foreground` or `bg-background`                                     |
| Hover            | `hover:bg-accent hover:text-foreground` (nav) or `hover:bg-muted` (table rows) |
| Active/Pressed   | `active:translate-y-px` (buttons)                                              |
| Focus (keyboard) | `focus-visible:ring-3 focus-visible:ring-ring/50`                              |
| Selected/Active  | `bg-primary text-primary-foreground` (nav links)                               |
| Expanded         | `aria-expanded:bg-muted`                                                       |
| Disabled         | `disabled:opacity-50 disabled:pointer-events-none`                             |
| Error            | `aria-invalid:border-destructive`                                              |
| Loading          | Replaced with spinner or `disabled` state                                      |

---

## 14. Utility Classes

### 14.1 Textual

| Class                     | Use                                  |
| ------------------------- | ------------------------------------ |
| `font-black`              | 900 weight — headings, totals        |
| `font-bold`               | 700 weight — button text, labels     |
| `font-semibold`           | 600 weight — nav items               |
| `font-medium`             | 500 weight — form labels             |
| `tracking-tight`          | Closer letter-spacing for headings   |
| `tracking-[0.18em]`       | Wide caps — eyebrow labels           |
| `leading-none`            | Tight line-height for headings       |
| `leading-6` / `leading-7` | Comfortable reading                  |
| `truncate`                | Text overflow ellipsis               |
| `whitespace-pre-wrap`     | Preserve whitespace (error messages) |
| `break-words`             | Word break (long text)               |

### 14.2 Layout

| Class                 | Use                                           |
| --------------------- | --------------------------------------------- |
| `m-0`                 | Zero margin on all headings/p                 |
| `shrink-0`            | Prevent flex child from shrinking             |
| `min-w-0`             | Allow flex child to shrink below content size |
| `min-h-0`             | Allow flex container to shrink                |
| `max-w-full`          | Constrain images/text                         |
| `inset-0`             | Full cover for overlays/pseudo-elements       |
| `pointer-events-none` | Decorative/non-interactive elements           |

### 14.3 Accessibility

| Class          | Use                                                     |
| -------------- | ------------------------------------------------------- |
| `sr-only`      | Screen-reader only text                                 |
| `outline-none` | Remove default outline (paired with focus-visible ring) |
| `select-none`  | Prevent text selection (buttons, draggable items)       |
| `aria-label`   | Accessible labels on icon-only buttons                  |

---

## 15. File Organization

```
src/
├── components/
│   ├── time-tracker/
│   │   ├── AppShell.tsx           # Root app layout (Navbar + Sidebar + Outlet)
│   │   ├── AppSidebar.tsx         # Desktop sidebar (260px / 60px collapsed)
│   │   ├── MobileNav.tsx          # Mobile drawer navigation
│   │   ├── Navbar.tsx             # Top bar with logo, workspace switcher, user menu
│   │   ├── dashboard/             # Time tracker home (timer, entries, filters)
│   │   ├── analytics/             # Analytics screens and charts
│   │   ├── workspace/             # Members, Catalogs, Settings
│   │   ├── shared/                # Shared components (export dialogs, grouping)
│   │   └── performance/           # My Performance page
│   ├── layout/
│   │   └── WorkspaceSwitcher.tsx   # Workspace dropdown
│   ├── marketing/                 # Landing page components
│   └── ui/                        # shadcn/ui primitives (19 files)
├── lib/
│   ├── brand.ts                   # BRAND constants (single source of truth)
│   ├── theme.ts                   # Theme/color/font management
│   └── utils.ts                   # cn() class merger
└── styles.css                     # All design tokens, @theme, animations
```

---

## Design Principles

1. **Single source of truth** — Brand name/tagline/logo come from `src/lib/brand.ts`. Theme state is managed via `data-*` attributes on `<html>` (never component-local). Retheme by editing one file.
2. **oklch color space** — All colors use `oklch()` for perceptual uniformity across light and dark modes.
3. **Component-slot model** — shadcn/ui components use `data-slot` attributes for targeted CSS overrides — no deep selector chains.
4. **Dark mode as overlay** — `.dark` class overrides CSS variables. Components respond automatically via `var(--*)` tokens.
5. **Accessible by default** — Keyboard focus rings, aria labels, `sr-only` text, reduced-motion support.
6. **Responsive via Tailwind** — Mobile-first breakpoints, sidebar collapses to drawer on small screens.

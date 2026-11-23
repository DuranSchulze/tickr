# Trackly design system ("Editorial")

Source of truth: `src/styles.css` (tokens) and `docs/ui-design-system.md`
(decisions). Reference spec: `DESIGN.md`.

## Product context

Trackly is an internal time-tracking web app for Duran File Pino, a
professional-services firm in the Philippines (timezone Asia/Manila).

- **Users:**
  - staff (Employees) log hours against clients, projects, tasks, tags, and
    billable status;
  - Managers and Admins oversee their department;
  - Owners see the whole workspace.
- **Device mix:** about 110 members use it on desktop browsers at work, on
  phones (mobile web), and through an Android app (Capacitor WebView of the
  same UI). Every page must work from 360px wide up.
- **Jobs to be done:**
  1. Start or stop a timer, or add a manual entry, in seconds.
  2. See today's and this week's hours against the daily minimum: 7h30m
     Monday–Friday, and 4h Saturday for Saturday workers.
  3. Fix or complete missing entries; answer the morning check-in ("Were you on
     leave?").
  4. Department Admins and Owners review timesheets, analytics, and reports,
     and export PDF or Excel.
  5. Admins manage members, roles, and catalogs (clients, projects, tags,
     departments, cohorts).

## Key pages (after sign-in, inside the AppShell)

- `/app/time-tracker`, the dashboard and main page. It holds:
  - the timer panel (description, project and task pickers, tags, billable,
    start/stop);
  - the manual entry panel and presets;
  - the entries list grouped by day, with filters and day/week/month/all views;
  - the Report emails button (Owners and Admins).
- `/app/timesheet`: weekly grid per member and day, with exports.
- `/app/analytics`, `/app/reports`, `/app/calendar`, `/app/my-performance`.
- `/app/workspace/*`: members, catalogs tables, settings, billing, activity, and
  audit logs.

## Brand and styling

- **Surfaces:** warm cream paper.
  - eggshell `#fdfcfc` for canvas, cards, and buttons;
  - warm taupe `#f5f3f1` for secondary surfaces, the sidebar, and the app frame;
  - stone `#ebe8e4` for hairline borders;
  - the main content plane `--app-surface` is `#ffffff` in light mode.
- **Text:**
  - ink `#000000` for primary text;
  - graphite `#44403b` for strong secondary text;
  - smoke `#777169` for body and muted text;
  - ash `#a59f97` for footnotes only.
- **Dark mode** ("graphite editorial"): canvas `#161412`, cards `#1d1a18`,
  sidebar `#12100e`, hairlines `#35302b`, text `#f5f3f1`.
- **Accent:** a user-chosen preset (`--primary`) used only as a spark: focus
  rings, active indicators, the running-timer glow, and chart leads. Never a
  button fill.
- **CTA:** black ink (`--primary-action`) is the only filled button. Secondary
  is an outline pill; tertiary is a ghost pill.
- **Type:**
  - body: Inter or Roboto Variable (user font presets), 14–16px, weight
    400/500, +0.01em tracking;
  - display and titles: weight 300, -0.02em tracking (`.font-display`);
  - page titles 32px; numbers use tabular numerals.
- **Radius:** buttons, tags, and tab pills 9999px; cards, dialogs, drawers, and
  popovers 20px; large cards 24px; inputs and selects 4px.
- **Elevation:** whisper only
  (`rgba(0,0,0,.4) 0 0 1px, rgba(0,0,0,.04) 0 1px 1px, rgba(0,0,0,.04) 0 2px 4px`).
  Prefer stone hairlines over shadows.
- **Spacing:** 4px base, comfortable density, 8–16px between elements, 20–32px
  card padding.
- **Icons:** lucide-react and @tabler/icons-react, 16–20px, stroke style.
- **Status colors:** functional only, as tinted text inside a pill.
  - Complete: green `#067647`
  - Short: amber `#b54708`
  - No time: red `#b42318`
  - Running timer: accent glow

## Layout and responsiveness

- **Desktop (≥1024px):** a taupe frame with a left sidebar (collapsible),
  a top bar, and a white content plane. Content max width is about 1280px.
- **Below 1024px:** the sidebar is replaced by a header with a menu button that
  opens the mobile nav drawer.
- **Below 640px:** single column. Tables become cards or stacked rows. Primary
  actions stay reachable (sticky timer controls on mobile). Never scroll the
  whole page horizontally; a wide table scrolls inside its own container.
- **Touch targets** are at least 40px. Dialogs become bottom drawers on phones
  where practical.

## Motion

The existing motion scale (`--duration-*`, `--ease-smooth-out`) stays: modal
open 250ms and close 150ms, dropdown scale-in, panel springs. Respect
`prefers-reduced-motion`.

## Hard rules

- Use only the colors, fonts, radii, and shadows above. No new accent colors, no
  gradients on chrome, no serif or decorative fonts, no heavy shadows, and no
  bold display type.
- Keep the real nav items, labels, icons, and data shapes. Visual and layout
  changes only, unless the user asks otherwise.

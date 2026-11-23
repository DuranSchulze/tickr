# Extractable components

## Layout Components (appear on most pages)

## AppShell

- Source: `src/components/time-tracker/AppShell.tsx`
- Category: layout
- Description: Authenticated frame. Taupe sidebar/frame on desktop, mobile header with menu button below `lg`, top Navbar, and a white `--app-surface` main content plane.
- Extractable props: activeRoute (string, default: "/app/time-tracker"), sidebarCollapsed (boolean, default: false)
- Hardcoded: frame colors, spacing, border-stone dividers, dialog mounts

## AppSidebar

- Source: `src/components/time-tracker/AppSidebar.tsx`
- Category: layout
- Description: Desktop sidebar with workspace name, nav items (Time tracker, Timesheet, Calendar, Analytics group, Reports, workspace admin group), and a user block.
- Extractable props: activeItem (string, default: "time-tracker"), collapsed (boolean, default: false), timerActive (boolean, default: false), analyticsOpen (boolean, default: false), settingsOpen (boolean, default: false)
- Hardcoded: nav labels, lucide/tabler icons, BrandLogo, permission-based visibility

## Navbar

- Source: `src/components/time-tracker/Navbar.tsx`
- Category: layout
- Description: Top bar with workspace context, theme toggle, user avatar menu (profile, workspaces, sign out), and an optional mobile menu button.
- Extractable props: showMobileMenuButton (boolean, default: false)
- Hardcoded: menu items, avatar styling, icons

## MobileNav

- Source: `src/components/time-tracker/MobileNav.tsx`
- Category: layout
- Description: Small-screen navigation drawer that mirrors the sidebar groups.
- Extractable props: activeItem (string, default: "time-tracker"), open (boolean, default: false), timerActive (boolean, default: false)
- Hardcoded: nav labels, icons, drawer styling

## Page

- Source: `src/components/time-tracker/screens/shared/Page.tsx`
- Category: layout
- Description: Screen wrapper with an eyebrow label, a title, and content.
- Extractable props: title (string), eyebrow (string)
- Hardcoded: typography scale, spacing

## Basic Components (used across pages)

## Button

- Source: `src/components/ui/button.tsx`
- Category: basic
- Description: Pill button (cva variants: default, outline, ghost, destructive, link; sizes sm, default, lg, icon).
- Extractable props: variant (string, default: "default"), size (string, default: "default")
- Hardcoded: radius, focus ring, transitions

## Card

- Source: `src/components/ui/card.tsx`
- Category: basic
- Description: Eggshell card with whisper border and elevation.
- Extractable props: none
- Hardcoded: border-stone, padding

## Dialog

- Source: `src/components/ui/dialog.tsx`
- Category: basic
- Description: Modal with editorial open/close motion; used for check-in, exports, and confirmations.
- Extractable props: open (boolean, default: true)
- Hardcoded: overlay, radius, motion tokens

## Combobox

- Source: `src/components/ui/combobox.tsx`
- Category: basic
- Description: Searchable select used for client, project, task, and department pickers.
- Extractable props: placeholder (string)
- Hardcoded: list styling

## TimerPanel

- Source: `src/components/time-tracker/dashboard/TimerPanel.tsx`
- Category: basic
- Description: Dashboard timer bar with description input, project, task and tags pickers, billable toggle, and start/stop with the running time.
- Extractable props: running (boolean, default: false)
- Hardcoded: layout, icons

## EntryRow

- Source: `src/components/time-tracker/dashboard/EntryRow.tsx`
- Category: basic
- Description: A single time entry row (description, project, tags, times, duration, actions) inside day groups.
- Extractable props: billable (boolean, default: false)
- Hardcoded: columns, icons

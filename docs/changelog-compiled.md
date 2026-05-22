# Compiled Changelog — Flow Track (Tickr)

Covers all changes made during the feature development session spanning the My Performance page redesign, catalog bulk selection, feature announcements module, and Google Sheet sync improvements.

---

# Feature Announcement Module

## Overview

A self-contained feature module (`src/features/announcements/`) that manages two types of dialogs driven by a single JSON manifest. No code changes needed to publish new updates — just edit the manifest.

## Files

| File                                                  | Purpose                                                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/features/announcements/manifest.json`            | Single source of truth: onboarding steps + changelog entries                                                   |
| `src/features/announcements/types.ts`                 | TypeScript interfaces + localStorage key constants                                                             |
| `src/features/announcements/useAnnouncements.ts`      | Hook that reads localStorage and decides which dialog to show                                                  |
| `src/features/announcements/AnnouncementProvider.tsx` | React context provider that renders the correct dialog + exposes `showOnboarding` / `showChangelog` to the app |
| `src/features/announcements/OnboardingDialog.tsx`     | Step-through carousel with progress bars, skip, back/next, optional image area, and action links               |
| `src/features/announcements/ChangelogDialog.tsx`      | "What's New" dialog with feature cards, optional screenshots, and CTA buttons                                  |
| `src/features/announcements/index.ts`                 | Barrel exports                                                                                                 |

## Integration

- `AnnouncementProvider` wraps the entire layout in `AppShell.tsx` — fires after user has logged in and loaded workspace
- `useAnnouncementContext()` hook makes `showOnboarding()` / `showChangelog()` available anywhere in the app tree

## Dialog Triggers

| Trigger                 | Shows                                       | Persistence                                           |
| ----------------------- | ------------------------------------------- | ----------------------------------------------------- |
| First visit (auto)      | OnboardingDialog — step-by-step walkthrough | `localStorage: tickr_onboarding_dismissed` (once)     |
| App version bump (auto) | ChangelogDialog — one-time notification     | `localStorage: tickr_changelog_version` (per version) |
| `?` → "Tour the app"    | OnboardingDialog (re-open)                  | Manual, always available                              |
| `?` → "What's new"      | Navigates to `/app/changelog`               | Full browsable history page                           |

## Changelog Page

`src/routes/app/changelog.tsx` — full-page timeline showing all updates from `manifest.json`, sorted newest-first. Each release card shows version badge, date, summary, feature cards, and CTA links.

## Publishing New Updates

Edit `src/features/announcements/manifest.json`:

```json
{
  "appVersion": "1.4.0", // bump this
  "updates": [
    {
      "version": "1.4.0",
      "publishedAt": "2025-07-01",
      "title": "Calendar View",
      "body": "The calendar...",
      "features": [
        /* ... */
      ],
      "actions": [
        /* ... */
      ]
    }
  ]
}
```

No code changes, no rebuild needed (Vite hot-reloads the JSON import).

---

# Catalog Sync Improvements

## Overview

Complete rewrite of the Google Sheet sync logic (`streaming-import.server.ts`) from a simple one-way import to a **three-phase bidirectional sync**.

## The Three Phases

### Phase 1: Sheet → Database (new / changed only)

| Scenario                         | DB Write                      | Dialog Label |
| -------------------------------- | ----------------------------- | ------------ |
| Row has ID + data matches DB     | ❌ Skipped entirely (no emit) | —            |
| Row has ID + data differs        | ✅ Update                     | "Updated"    |
| Row has no ID + name found in DB | ✅ Update + write back ID     | "Updated"    |
| Row has no ID + name not in DB   | ✅ Insert + write back ID     | "Created"    |
| Client not found (projects only) | ❌ Skipped                    | "Skipped"    |

### Phase 2: Archive deleted rows

If a row was **removed from the sheet** but still exists in the DB:

- Tries to archive it (`clientStatus: 'INACTIVE'` / `archived: true`)
- If archiving fails (dependencies) → re-adds the row to the sheet with a **"Warning"** label
- Emit: "Archived" (amber) or "Warning" (red)

### Phase 3: Database → Sheet (export missing)

Active DB records **not present in the sheet** (created via the app UI) get automatically **appended** to the sheet.

- Uses resolved IDs so newly created records aren't accidentally re-exported
- Emit: "Exported" (violet)

## Files Changed

| File                                                       | Change                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/tracker/streaming-import.server.ts`        | Full rewrite of `streamImportClients`, `streamImportProjects`, `streamImportTags` — added 3-phase logic, removed `inArray` dependency |
| `src/components/time-tracker/catalogs/SyncSheetDialog.tsx` | Added icon/label support for `synced`, `exported`, `archived`, `warning` actions                                                      |

## New Action Types (UI)

| Icon             | Color  | Label    |
| ---------------- | ------ | -------- |
| ✅ CheckCircle2  | Sky    | In sync  |
| 🔮 ArrowUpCircle | Violet | Exported |
| 📦 Archive       | Amber  | Archived |
| ⚠️ AlertTriangle | Red    | Warning  |

---

# UI & Navigation Updates

## Navbar INFO Button

Added a `?` (CircleHelp) icon button in the top navbar between the WorkspaceSwitcher and user avatar dropdown.

**Dropdown menu:**

```
Info & Updates
  ❔ Tour the app     → opens OnboardingDialog
  ✨ What's new       → navigates to /app/changelog
```

## Onboarding Dialog Redesign

- **Image area** — fixed 176px placeholder with dashed border + icon, always visible even without an image set
- **Navigation separated from actions** — "Skip" / "Back" (left) | step counter (center) | "Next" / "Done" (right) always present
- **Action CTAs** — full-width buttons above the navigation that navigate to specific app pages without ending the tour

## Sync Sheet Dialog Improvements

- Added **tab-close warning banner** (amber) during active sync
- Added `beforeunload` event listener to prevent accidental tab closure
- Changed title from "Sync from Google Sheet" → "Sync with Google Sheet"

## Catalog & Settings Reorganization

### Catalogs Page (`/app/workspace/catalogs`)

- **Removed** the Google Sheet sync section entirely
- Page now shows only catalog navigation cards (Roles, Clients, Projects, Tags, Departments, Cohorts)

### Settings Page (`/app/workspace/settings`)

- **Added** "Sync time entries" section with the `GoogleSheetSyncButton`
- Only visible when a Google Sheet URL is linked
- **Route guard expanded** to include Managers (`OWNER | ADMIN | MANAGER`)
- **Removed** the "Import catalogs from sheet" subsection from `WorkspaceGoogleSheetPanel`
- Last sync time always visible — shows **"Never synced"** when no prior sync exists

### Google Sheet Panel

- Now handles only Sheet URL configuration + service-account hint
- Removed catalog import subsection and `SyncSheetDialog` dependency

---

# Auto-Sync

## Every 2 Hours

Added a `useEffect` in `AppShell.tsx` that auto-syncs time entries to the linked Google Sheet every **2 hours** (7,200,000 ms).

- Only runs for users with `permissionLevel` of **OWNER**, **ADMIN**, or **MANAGER**
- Silently catches errors (no sheet URL, role mismatch)
- Calls `router.invalidate()` after success to update the UI timestamp
- Cleans up interval on unmount

---

# Architecture Decisions

- **JSON-driven announcements** — `manifest.json` is the single source of truth; editing it is all that's needed to publish updates
- **localStorage-based state** — lightweight, no DB migrations needed; user doesn't need authentication for this to work
- **Bidirectional sync** — sheet → DB (new/changed), DB → sheet (missing), and deleted-from-sheet → archive, keeping both sides consistent
- **Skip unchanged rows** — subsequent syncs only process what actually changed, making them much faster

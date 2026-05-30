# Workspace Export Feature

> Memory bank — documentation for the workspace export feature available on the Members and Activity pages.

---

## Overview

The **Workspace Export Feature** provides an **Export** button on two admin/owner workspace pages that allows users to download data as a CSV file or print/save as PDF via the browser's native print dialog. This gives workspace owners and admins a quick way to pull structured data out of Tickr for reporting, auditing, or record-keeping.

---

## Pages Where This Feature Appears

| Page         | Route                     | Component                     |
| ------------ | ------------------------- | ----------------------------- |
| **Members**  | `/app/workspace/members`  | `MembersScreen.tsx`           |
| **Activity** | `/app/workspace/activity` | `WorkspaceActivityScreen.tsx` |

Both pages render the shared `ExportMenu` component, which provides a dropdown with two actions:

1. **Export CSV** — downloads a `.csv` file via a server-generated blob.
2. **Print / Save as PDF** — opens the browser's print dialog, where the user can choose "Save as PDF".

---

## Shared Component: `ExportMenu`

**File:** `Tickr/src/components/time-tracker/shared/ExportMenu.tsx`

### Props

| Prop            | Type                  | Required | Description                                                   |
| --------------- | --------------------- | -------- | ------------------------------------------------------------- |
| `onExportCsv`   | `() => Promise<void>` | Yes      | Async callback that fetches CSV data and triggers a download. |
| `onSyncToSheet` | `() => Promise<void>` | No       | Optional callback to sync with a Google Sheet.                |
| `disabled`      | `boolean`             | No       | Disables the trigger button.                                  |

### Helper: `downloadCsv`

```ts
function downloadCsv(csv: string, filename: string): void
```

Creates a temporary blob URL and programmatically clicks an `<a>` element to trigger the download.

---

## Members Page Export

### File: `Tickr/src/components/time-tracker/screens/MembersScreen/MembersScreen.tsx`

The `MembersScreen` component renders the `ExportMenu` inside the "Managed user list" section header. It passes `onExportCsv` that calls `exportMembersCsvFn()`.

### Server Function: `exportMembersCsvFn`

**File:** `Tickr/src/lib/server/tracker.ts` (line 168)

```ts
export const exportMembersCsvFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    const { exportMembersCsv } = await import('./tracker/export.server')
    return exportMembersCsv()
  },
)
```

### Server Logic: `exportMembersCsv`

**File:** `Tickr/src/lib/server/tracker/export.server.ts`

- Selects all workspace members with their name, email, role, department, and status.
- For admin-level users, computes per-member stats (total hours, billable hours, this-week/this-month hours, entry count).
- Logs an `EXPORT_MEMBERS` audit entry.

### CSV Columns

| Column         | Description                                    |
| -------------- | ---------------------------------------------- |
| Name           | Member's display name (falls back to email)    |
| Email          | Member's email address                         |
| Role           | Workspace role name                            |
| Department     | Department name                                |
| Status         | Member status (ACTIVE, INVITED, etc.)          |
| Total Hours    | _(Admin only)_ Sum of all entry durations      |
| Billable Hours | _(Admin only)_ Sum of billable entry durations |
| This Week (h)  | _(Admin only)_ Hours logged this week          |
| This Month (h) | _(Admin only)_ Hours logged this month         |
| Entries        | _(Admin only)_ Total entry count               |

---

## Activity Page Export

### File: `Tickr/src/components/time-tracker/screens/WorkspaceActivityScreen/WorkspaceActivityScreen.tsx`

The `WorkspaceActivityScreen` component renders the `ExportMenu` in the header area, next to the auto-refresh indicator. It passes `onExportCsv` that calls `exportActivityCsvFn()`.

### Server Function: `exportActivityCsvFn`

**File:** `Tickr/src/lib/server/tracker.ts`

```ts
export const exportActivityCsvFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    const { exportActivityCsv } = await import('./tracker/export.server')
    return exportActivityCsv()
  },
)
```

### Server Logic: `exportActivityCsv`

**File:** `Tickr/src/lib/server/tracker/export.server.ts`

- Queries all active workspace members joined with their current running timer entry (if any).
- Gated by `assertOwnerOrAdmin` — only workspace Owners and Admins can export activity data.
- Logs an `EXPORT_ACTIVITY` audit entry.

### CSV Columns

| Column       | Description                                                     |
| ------------ | --------------------------------------------------------------- |
| Name         | Member's display name                                           |
| Email        | Member's email                                                  |
| Status       | "Online" if the member has an active timer, otherwise "Offline" |
| Active Entry | Description of the active timer entry (or blank if offline)     |
| Project      | Project name of the active timer entry (or blank)               |
| Started At   | ISO timestamp when the active timer started (or blank)          |

---

## Audit Log Events

Both exports create audit log entries for traceability:

| Action            | Target    | Details |
| ----------------- | --------- | ------- |
| `EXPORT_MEMBERS`  | workspace | —       |
| `EXPORT_ACTIVITY` | workspace | —       |

Audit logging happens in the respective server functions (`exportMembersCsv` and `exportActivityCsv`).

---

## Related Files

| File                                                                                      | Role                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `src/components/time-tracker/shared/ExportMenu.tsx`                                       | Reusable Export dropdown UI component             |
| `src/components/time-tracker/screens/MembersScreen/MembersScreen.tsx`                     | Members page with ExportMenu integration          |
| `src/components/time-tracker/screens/WorkspaceActivityScreen/WorkspaceActivityScreen.tsx` | Activity page with ExportMenu integration         |
| `src/lib/server/tracker.ts`                                                               | Server function declarations for both exports     |
| `src/lib/server/tracker/export.server.ts`                                                 | Server-side CSV generation logic for both exports |
| `src/routes/app/workspace/members.tsx`                                                    | Route loader for the members page                 |
| `src/routes/app/workspace/activity.tsx`                                                   | Route loader for the activity page                |

# Workspace Export Feature — Per-User PDF Export

> Memory bank — documentation for the per-user monthly time entry PDF export feature available on the Members and Activity pages.

---

## Overview

Each workspace member row/card on the **Members** and **Activity** pages has an **Export** button that generates a **monthly time entry report** as an HTML page that opens in a new tab, then triggers the browser's **Print → Save as PDF** dialog. The report includes:

- Summary cards (Total Hours, Billable Hours, Entry Count, Billable Amount)
- A detailed table with Date, Project/Client, Tags, Description, Hours, Rate, Amount, and Billable/Non-billable
- A footer with generation timestamp

If the user has no entries for the selected month, the PDF is still generated — it shows 0 hours, 0 entries, and an empty table.

---

## Pages Where This Feature Appears

| Page         | Route                     | Component                | Per-User Button Location         |
| ------------ | ------------------------- | ------------------------ | -------------------------------- |
| **Members**  | `/app/workspace/members`  | `MemberRow.tsx`          | Actions column in each table row |
| **Activity** | `/app/workspace/activity` | `MemberActivityCard.tsx` | Bottom-right of each member card |

Both use the same pattern: a button labeled **Export** with a `FileText` icon, opening a popover with month options (current month + 5 previous months).

---

## How It Works

### User Flow

1. User clicks the **Export** button on a member row/card
2. A popover appears with month options (e.g., "May 2026", "April 2026", ...)
3. User selects a month
4. The app fetches the time entries for that member + month via `getMemberMonthlyReportFn`
5. An HTML document is generated server-side, opened in a new tab, and `window.print()` is called
6. The browser print dialog appears — user can choose **Save as PDF**
7. If the server call fails, a toast error is shown

### Server Function: `getMemberMonthlyReportFn`

**File:** `Tickr/src/lib/server/tracker.ts`

```ts
export const getMemberMonthlyReportFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => memberMonthlyReportSchema.parse(input))
  .handler(async ({ data }) => {
    const { getMemberMonthlyReport } = await import('./tracker.server')
    return getMemberMonthlyReport(data)
  })
```

### Server Logic: `getMemberMonthlyReport`

**File:** `Tickr/src/lib/server/tracker.server.ts` → `member-report.server.ts`

- Permission-gated:
  - **OWNER/ADMIN**: can target any member in the workspace
  - **MANAGER**: can only target members in their own department
  - **EMPLOYEE**: can only target themselves
- Fetches all completed time entries for the given member in the given month
- Joins projects, clients, and tags
- Computes billable rates and amounts
- Returns structured `MemberMonthlyReport` data

---

## Components

### Members Page — MemberRow.tsx

**File:** `Tickr/src/components/time-tracker/MemberRow.tsx`

The Export button is in the **Actions** column of the table. It's a `<button>` element with:

- `FileText` icon + **Export** label
- A `Popover` containing month option buttons (6 months: current + 5 previous)
- Loading state with spinner animation while generating
- Disabled state during generation to prevent double-clicks

```tsx
// Key state
const [exportPopoverOpen, setExportPopoverOpen] = useState(false)
const [exportingMonth, setExportingMonth] = useState<string | null>(null)

// Key handler
const handleExportMonthlyReport = useCallback(
  async (month: string) => { ... },
  [member.id],
)
```

### Activity Page — MemberActivityCard.tsx

**File:** `Tickr/src/components/time-tracker/screens/WorkspaceActivityScreen/MemberActivityCard.tsx`

The Export button is at the **bottom-right** of each member card, below the status/entry info. Uses the same pattern as `MemberRow`:

- Same `Export` button with `FileText` icon
- Same popover with month options
- Same report generation logic (duplicated because the cards are in a grid and can't share row-level state)

---

## Report HTML / PDF Styling

The generated HTML includes inline CSS optimized for print:

- **Page margin**: 1.5cm via `@page`
- **Font**: System font stack
- **Header**: Blue title bar with member name, email, and month
- **Summary cards**: Four card metrics in a flex row
- **Table**: Full-width with styled header, alternating rows, and billable badges
- **Footer**: "Generated on ... · Tickr"
- **Auto-print**: `<script>window.print()</script>` triggers the print dialog on load

---

## Related Files

| File                                                                                 | Role                                                     |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `src/components/time-tracker/MemberRow.tsx`                                          | Members table row with Export button + popover           |
| `src/components/time-tracker/screens/WorkspaceActivityScreen/MemberActivityCard.tsx` | Activity member card with Export button + popover        |
| `src/lib/server/tracker.ts`                                                          | Server function declaration (`getMemberMonthlyReportFn`) |
| `src/lib/server/tracker.server.ts`                                                   | Route to `member-report.server.ts`                       |
| `src/lib/server/tracker/member-report.server.ts`                                     | Server-side report generation logic                      |
| `src/components/ui/popover.tsx`                                                      | Shared Popover UI component                              |
| `src/lib/time-tracker/billing.ts`                                                    | `formatCurrency` utility                                 |
| `src/routes/app/workspace/members.tsx`                                               | Route loader for the members page                        |
| `src/routes/app/workspace/activity.tsx`                                              | Route loader for the activity page                       |

---

## Notes

- The export uses `window.print()` for PDF generation (browser-native), avoiding server-side PDF libraries
- The `computeEffectiveRate` and `formatCurrency` imports from `#/lib/time-tracker/billing` are used in the HTML template string
- The popover uses `align="end"` to stay within the right edge of the screen
- Activity cards export months are computed at module level via `generateMonthOptions()` (static, not per-instance)

# Export Start/End Time and Decimal Rate Consistency

> **Status:** ✅ Done

## 1. Goal

Improve every supported time-report export so that users receive accurate, readable, and structurally consistent PDF and CSV files containing:

- Each entry's workspace-timezone start time.
- Each entry's workspace-timezone end time.
- The entry duration.
- The effective hourly rate represented as a decimal value with two fractional digits.
- The billable amount where applicable.

The work must cover exports used for BP, BH, Admin, and other permitted member or organizational scopes without deleting, rewriting, or migrating existing database records. The requested delivery target is before June 30, 2026.

## 2. Context Summary

The request says:

- “add decimal rate on the extracted (even BP, BH, and Admin)”
- “start time and end time on the extracted”

“Extracted” is understood to mean downloaded or printable time reports, primarily the member, bulk, and analytics PDF/CSV export paths.

The current repository already contains part of the requested behavior:

- Member and bulk report server models already expose clipped `startedAt`, `endedAt`, `durationSeconds`, `effectiveRate`, and `billableAmount`.
- Member and bulk CSV exports already contain Start, End, Duration, `Rate/hr`, and Amount columns.
- Analytics CSV already contains Started, Ended, Hours, `Rate/hr`, and Amount columns.
- The generated member and bulk PDF tables contain Start, End, Time, Billable, and Amount, but do not currently show `Rate/hr`.
- The member PDF reuses the same wide report table in portrait orientation, creating a high risk of narrow columns, excessive wrapping, and overlapping or unreadable text.
- Bulk/member CSV rates are plain two-decimal values, while analytics CSV rates and amounts are formatted as currency strings. The formats are therefore inconsistent.
- Export timestamps are calculated from existing entry timestamps, clipped to the requested date range, and formatted in the workspace timezone.
- Workspace and member billable rates already use numeric database columns with scale 2. No new rate storage is required.

Recommended interpretation of “decimal rate”:

- Export the effective hourly rate as a plain decimal number such as `150.00`, not a currency-formatted string such as `₱150.00`.
- Include the rate for every exported row, including non-billable rows, so the underlying assigned/default rate remains visible. Keep Amount empty for non-billable entries.
- Continue calculating effective rate using the member override first and the workspace default as fallback.

Missing business clarification:

- The repository does not define BP or BH as technical permission levels. They may be department, cohort, role, or business labels in production data. The implementation should remain data-driven and work for every member/scope rather than hard-code those names.
- Confirm whether the requester means hourly **rate** (`150.00`) or decimal **hours** (`1.50`). This plan assumes hourly rate because the request explicitly says “decimal rate.”
- Confirm whether non-billable rows should display their effective rate or leave it blank. This plan recommends displaying the rate while keeping Amount blank.

## 3. Scope

- Audit all user-facing export entry points and ensure they use consistent report fields.
- Standardize member, bulk, and analytics CSV columns and row ordering.
- Add decimal `Rate/hr` to generated member and bulk PDF tables.
- Retain separate Start, End, and Duration columns in generated reports.
- Preserve workspace-timezone formatting for Start and End.
- Preserve boundary clipping so exported timestamps reconcile with exported duration.
- Improve generated PDF table sizing, orientation, wrapping, page breaks, and headers so long content does not overlap.
- Verify CSV escaping and column alignment for commas, quotes, line breaks, long descriptions, and multiple tags.
- Preserve existing role- and department-scoped export permissions.
- Add focused automated tests for export data and CSV structure.
- Manually verify generated PDF and CSV files for representative BP, BH, Admin, manager, and employee data scopes where those labels exist.
- Keep all changes limited to export/report logic, formatting, tests, and minimal export-dialog copy if needed.

## 4. Out of Scope

- Deleting, rewriting, normalizing, or backfilling existing time entries.
- Database migrations or schema changes.
- Changing stored workspace or member billable rates.
- Recalculating historical records in the database.
- Changing timer creation, timer stopping, manual-entry, or overlap-warning behavior.
- Changing analytics billing formulas beyond export representation.
- Adding hard-coded BP or BH roles, departments, cohorts, or permission levels.
- Replacing the current PDF or CSV libraries.
- Redesigning unrelated analytics pages or time-tracker screens.
- Introducing Excel/XLSX export unless separately requested.
- Changing Google Sheets synchronization unless “extracted” is later confirmed to include synchronized sheets.

## 5. Affected Files and Folders

```txt
src/
├── components/time-tracker/
│   ├── analytics/
│   │   └── AnalyticsScreen.tsx
│   └── shared/
│       ├── BulkExportDialog.tsx
│       ├── ExportMenu.tsx
│       └── MemberExportDialog.tsx
├── lib/
│   ├── server/tracker/
│   │   ├── bulk-report.server.ts
│   │   ├── export.server.ts
│   │   ├── member-report.server.ts
│   │   ├── report-utils.server.ts
│   │   └── shared/dates.ts
│   └── time-tracker/
│       ├── billing.ts
│       ├── bulk-report-export.ts
│       ├── export-utils.ts
│       ├── member-report-export.ts
│       └── work-intervals.ts
├── lib/server/__tests__/
│   ├── export-formatting.test.ts             (candidate new file)
│   ├── report-export-data.test.ts            (candidate new file)
│   └── dates.test.ts
└── routes/app/
    └── analytics.tsx

plans/
└── export-time-and-decimal-rate/
    └── PLAN.md

src/db/
└── schema.ts                                  (review only)

drizzle/                                       (no changes expected)
```

- `bulk-report.server.ts` and `member-report.server.ts` are the source of report row fields and effective-rate calculations.
- `export.server.ts` creates the analytics CSV and currently formats rate and amount differently from bulk/member CSV.
- `bulk-report-export.ts` is the shared PDF/CSV renderer for both bulk and member reports and is the primary formatting/layout change location.
- `member-report-export.ts` maps member reports into the grouped renderer and chooses portrait orientation.
- `export-utils.ts` contains shared CSV escaping and report formatting and is the preferred location for reusable decimal-rate formatting.
- `BulkExportDialog.tsx`, `MemberExportDialog.tsx`, `ExportMenu.tsx`, and analytics route/screen files should be reviewed to ensure every export action reaches the corrected implementation.
- `schema.ts` should only be inspected to confirm existing `numeric(... scale: 2)` rate storage. It must not be edited for this task.

## 6. Step-by-Step Implementation Plan

1. **Confirm export acceptance rules and terminology**
   - What to do: Confirm that “decimal rate” means effective hourly rate with exactly two decimal places, determine whether non-billable rows show the rate, and map BP/BH/Admin to their actual production roles, departments, cohorts, or report scopes.
   - Why it is needed: The repository has no BP or BH permission constants, and confusing rate with decimal hours would produce the wrong report.
   - Affected files/folders: No source changes; record the confirmed rules in the implementation issue or acceptance notes.
   - Dependency: Complete before changing report headers or output values.

2. **Define one export column contract**
   - What to do: Establish the canonical entry columns and their order for all downloadable tabular reports. Recommended order: Member, Email, Date, Start, End, Project, Client, Tags, Description, Duration, Billable, `Rate/hr`, Amount, Notes where supported.
   - Why it is needed: Shared ordering prevents PDF/CSV drift and makes column/row validation deterministic.
   - Affected files/folders: `bulk-report-export.ts`, `export.server.ts`, `export-utils.ts`.
   - Dependency: Use this contract for subsequent PDF, CSV, and test work.

3. **Standardize decimal-rate formatting**
   - What to do: Add or reuse a shared formatter that converts a finite non-negative effective rate to a plain two-decimal string such as `150.00`. Decide whether the currency code belongs in report metadata or a separate column, rather than embedding it in the rate cell.
   - Why it is needed: Bulk/member CSV currently emits plain decimals, while analytics CSV emits currency-formatted text. Spreadsheet consumers need predictable numeric-looking values.
   - Affected files/folders: `export-utils.ts`, `billing.ts`, `bulk-report-export.ts`, `export.server.ts`.
   - Dependency: Preserve `computeEffectiveRate()` as the source of member-override/workspace-default behavior.

4. **Verify and preserve report server data**
   - What to do: Confirm member and bulk report entry types always return clipped Start, End, Duration, effective rate, and amount. Ensure rate conversion handles database numeric strings, zero rates, missing member overrides, and workspace defaults without mutating data.
   - Why it is needed: Renderers should consume a stable report model and must not reproduce billing logic differently.
   - Affected files/folders: `member-report.server.ts`, `bulk-report.server.ts`, `report-utils.server.ts`, `billing.ts`, `work-intervals.ts`.
   - Dependency: No database writes, migrations, or historical updates.

5. **Add Rate/hr to generated PDFs**
   - What to do: Add a `Rate/hr` header and two-decimal rate cell to the shared generated PDF table. Retain Date, Start, End, Duration/Time, Billable, and Amount.
   - Why it is needed: Generated PDF currently omits the requested rate even though the server already provides it.
   - Affected files/folders: `bulk-report-export.ts`, indirectly `member-report-export.ts`.
   - Dependency: Use the canonical column contract and shared decimal formatter.

6. **Prevent PDF text and column overlap**
   - What to do:
     - Recalculate column widths after adding Rate/hr.
     - Prefer landscape orientation for the full detailed member report, or define a tested compact portrait variant if portrait is a firm requirement.
     - Apply line wrapping to Description, Project, Client, and Tags.
     - Keep Date, Start, End, Duration, Rate, and Amount at fixed readable widths.
     - Right-align numeric columns.
     - Repeat table headers on new pages.
     - Keep member section headers with at least one entry row.
     - Ensure long unbroken text wraps or truncates safely without drawing into adjacent cells.
   - Why it is needed: The existing member PDF already places ten columns in portrait orientation; an additional rate column will otherwise reduce readability and may overlap.
   - Affected files/folders: `bulk-report-export.ts`, `member-report-export.ts`.
   - Dependency: Visually verify both short and pathological content.

7. **Normalize member and bulk CSV output**
   - What to do: Keep separate Start, End, and Duration columns; ensure `Rate/hr` is always in the same position and uses two-decimal plain values. Preserve Amount as a two-decimal value and currency as report metadata. Ensure every detail row has the exact same number of fields as the header.
   - Why it is needed: This makes CSV imports reliable and prevents shifted rows when values contain commas, quotes, tags, or line breaks.
   - Affected files/folders: `bulk-report-export.ts`, `export-utils.ts`, `member-report-export.ts`.
   - Dependency: Retain RFC-style CSV quoting through the shared `buildCsv()` helper.

8. **Align analytics CSV with the shared contract**
   - What to do: Keep Started and Ended values in workspace timezone, rename headers to the agreed Start/End terminology if consistency is desired, emit `Rate/hr` as a two-decimal value, and keep currency in metadata rather than inside numeric rate cells. Verify summary rows and detail rows remain rectangular.
   - Why it is needed: Analytics CSV currently formats rate and amount as currency strings and uses a separate local CSV implementation.
   - Affected files/folders: `export.server.ts`, preferably `export-utils.ts` if server-safe helpers are shared or extracted appropriately.
   - Dependency: Avoid importing browser-only download helpers into server code; split pure CSV/format helpers if necessary.

9. **Review every export entry point**
   - What to do: Trace member export buttons, bulk export buttons, analytics CSV, and Print/Save as PDF actions to ensure they use the corrected report path. Confirm the same behavior from Analytics, Department Member Analytics, Members, Workspace Activity, and the dashboard.
   - Why it is needed: The request applies across the system, and the shared dialogs are mounted in several screens.
   - Affected files/folders: `MemberExportDialog.tsx`, `BulkExportDialog.tsx`, `ExportMenu.tsx`, `AnalyticsScreen.tsx`, `DepartmentMemberDetailScreen.tsx`, `MemberDetailScreen.tsx`, `MemberRow.tsx`, `MembersScreen.tsx`, `WorkspaceActivityScreen/`, `TimeTrackerDashboard.tsx`, relevant routes.
   - Dependency: Avoid duplicating export logic at individual call sites.

10. **Add automated export tests**
    - What to do:
      - Test effective-rate fallback and two-decimal formatting.
      - Test Start/End clipping against a selected date range.
      - Test workspace-timezone formatting, including cross-midnight entries.
      - Test CSV header/detail/summary field counts.
      - Parse generated CSV and verify commas, quotes, CR/LF, multiple tags, empty optional fields, and Unicode do not shift columns.
      - Test billable and non-billable rate/amount rules.
      - Test zero and fractional rates such as `0.00`, `10.50`, and `1234.56`.

- Why it is needed: Export regressions are easy to miss visually, and CSV structural failures can silently corrupt downstream spreadsheet data.
- Affected files/folders: candidate tests under `src/lib/server/__tests__/`, existing date/work-interval tests, and pure formatter utilities.
- Dependency: Refactor only enough pure logic to make deterministic tests possible.

11. **Perform visual and file-level QA**
    - What to do:
      - Generate member and bulk PDFs with long descriptions, long project/client names, many tags, decimal rates, and multiple pages.
      - Open PDFs and verify no overlapping, clipped, or unreadable text.
      - Open each CSV in a text editor and spreadsheet application and verify all columns/rows align.
      - Validate representative BP, BH, Admin, manager, and employee exports using actual configured scopes and permissions.
      - Verify Start + Duration reconciles with End for boundary-clipped entries.

- Why it is needed: PDF layout and spreadsheet import behavior cannot be proven by type checking alone.
- Affected files/folders: No production data changes; generated files should remain temporary test artifacts.
- Dependency: Use non-destructive test data or existing read-only records.

12. **Run regression checks and prepare delivery**
    - What to do: Run type checking, lint, unit tests, production build, and focused browser checks. Review the final diff to ensure no schema, migration, seed, or unrelated application files changed.
    - Why it is needed: The deadline is June 30, 2026, and the export change must not destabilize tracking or billing.
    - Affected files/folders: `package.json` scripts; entire final diff for review.
    - Dependency: Resolve all export test and visual QA findings before release.

## 7. Database Changes

No database changes required.

Existing rate storage is already suitable:

- `workspaces.default_billable_rate` is numeric with precision 12 and scale 2.
- `workspace_members.billable_rate` is numeric with precision 12 and scale 2.
- `time_entries.started_at`, `time_entries.ended_at`, and duration data already exist.

The implementation must remain read-only with respect to historical entries and rates. No migration, backfill, deletion, normalization query, or destructive script should be introduced.

## 8. Backend Changes

- Preserve `computeEffectiveRate(memberRate, defaultRate)` as the canonical rate selection:
  - Use member-specific rate when present.
  - Otherwise use workspace default rate.
  - Treat zero as a valid rate.
- Keep report date-range queries overlap-aware:
  - Include completed entries that intersect the requested period.
  - Clip Start and End to report boundaries.
  - Calculate exported Duration from the clipped interval.
- Continue exporting timestamps in the workspace timezone.
- Ensure report entry types expose:
  - `startedAt`
  - `endedAt`
  - `durationSeconds`
  - `effectiveRate`
  - `billableAmount`
- Normalize analytics CSV output to the same rate representation as member and bulk exports.
- Preserve all existing permission checks:
  - Owner/Admin: workspace-level exports.
  - Manager: department-limited exports.
  - Employee: personal exports.
- Preserve existing export audit logging.
- Do not add write queries or modify database records.

## 9. Frontend Changes

- Update the shared PDF renderer to display Rate/hr in each entry row.
- Adjust PDF orientation and table styling to keep all columns readable:
  - Landscape is recommended for detailed member and bulk reports.
  - Long textual fields should wrap within their own cells.
  - Numeric and time columns should remain compact and stable.
- Keep Start, End, and Duration as separate columns rather than combining them.
- Keep existing export dialogs and date-range controls unless minor explanatory copy is needed.
- Avoid adding rate or amount columns back into unrelated on-screen analytics tables unless separately requested.
- Ensure loading, success, and error behavior of export buttons remains unchanged.
- Verify print styles for the analytics “Print / Save as PDF” action so visible Start/End/Duration text remains readable. Do not create a new analytics PDF generator unless the existing print path cannot meet acceptance criteria.

## 10. Validation Rules

- Start date and end date are required.
- Start date must not be after end date.
- Exported entries must intersect the selected workspace date range.
- Completed exports require a valid End timestamp after Start.
- Clipped Start must be no earlier than the report boundary.
- Clipped End must be no later than the report boundary.
- Exported duration must equal clipped End minus clipped Start.
- Effective rate must be finite and non-negative.
- Decimal rate output must always contain exactly two fractional digits.
- Zero rate must render as `0.00`, not as blank.
- Missing member rate must fall back to the workspace default.
- Billable amount must use clipped duration and effective rate.
- Non-billable Amount must remain blank unless the product owner specifies zero.
- CSV detail rows must have the same number of fields as the header.
- Values containing commas, quotes, CR/LF, or multiple tags must be escaped.
- Timestamps must be formatted using the report's workspace timezone.
- Unknown BP/BH labels must not cause hard-coded branching or access changes.

## 11. Security Considerations

- Keep server-side workspace and member permission enforcement; do not rely on hidden UI buttons.
- Preserve tenant isolation by requiring `workspaceId` in report queries and scope lookups.
- Managers must not export members outside their department.
- Employees must not export another member's report.
- Scope IDs for client, department, and tag exports must resolve within the active workspace.
- Avoid exposing rates for members the requesting user cannot otherwise report on.
- Continue audit logging for analytics and bulk exports; confirm whether member exports require an audit event under current policy.
- Treat descriptions, notes, project names, client names, tags, member names, and emails as untrusted text:
  - Escape CSV cells.
  - Pass plain text—not executable HTML—to PDF rendering.
- Consider spreadsheet formula injection protection for cells beginning with `=`, `+`, `-`, or `@`. If exports may be opened in Excel or Google Sheets, prefix unsafe user-controlled cells with an apostrophe while keeping known numeric rate/amount fields numeric.
- Do not log full exported content or sensitive billing data in client/server error messages.

## 12. Testing Plan

### Automated tests

- Happy path:
  - Member export contains Date, Start, End, Duration, Rate/hr, and Amount.
  - Bulk export contains the same fields for multiple members.
  - Analytics CSV contains equivalent time and rate fields.
  - Member override rate is exported with two decimals.
  - Workspace fallback rate is exported with two decimals.
- Error cases:
  - Invalid date range is rejected.
  - Unauthorized member or scope export is rejected.
  - Invalid timestamps or non-positive intervals are excluded safely.
- Edge cases:
  - Rate `0`, integer rate, one-decimal rate, and two-decimal rate.
  - Very small and large valid rates within schema precision.
  - Entry crossing midnight.
  - Entry starting before or ending after the requested range.
  - Daylight-saving transitions for non-Manila workspaces.
  - Long descriptions, projects, clients, tags, names, and emails.
  - Commas, double quotes, newlines, Unicode, and formula-like text in CSV.
  - Empty project, client, tags, notes, and member override.
  - Multiple-page PDF.
  - No matching entries.
- Permission cases:
  - Owner/Admin can export permitted workspace scopes.
  - Manager remains restricted to their department.
  - Employee remains restricted to self.
  - Production BP/BH/Admin configurations return identical column structures.
- Regression coverage:
  - Tracked, Actual, Overlap, Billable, and Amount summaries remain correct.
  - Existing filename conventions remain stable.
  - Start/End timezone values reconcile with Duration.
  - Export audit events still fire.

### Manual tests

- Download member PDF and CSV from each screen that exposes member export.
- Download bulk PDF and CSV for Everything, Client, Department, and Tag.
- Download analytics CSV for personal, department, and organization scopes.
- Exercise the analytics Print / Save as PDF action.
- Open CSV files in Excel or Google Sheets and verify:
  - Header count equals detail-row field count.
  - No data shifts into neighboring columns.
  - Rate cells show two decimals.
  - Start, End, and Duration remain separate.
- Inspect PDFs at 100% zoom and printed scale:
  - No overlapping text.
  - No clipped headers or values.
  - Repeated headers appear after page breaks.
  - Long text stays within its assigned cell.
  - Rate and Amount remain legible.
- Verify no database rows, timestamps, durations, or rates change before and after exports.

## 13. Rollback Plan

- Revert only the export formatter, report-model, and test changes from this task.
- Restore the previous PDF column definition and member PDF orientation if the revised layout causes production issues.
- Restore the prior analytics CSV rate formatting if downstream consumers explicitly depend on currency-formatted text; document that compatibility requirement before reattempting standardization.
- Because there are no migrations or database writes, no database rollback or data restoration should be necessary.
- Retain existing historical records unchanged throughout deployment and rollback.
- If release risk is discovered near the June 30, 2026 deadline, ship the independently verified Start/End/Duration and PDF layout fixes first, then release rate-format normalization only after confirming downstream CSV expectations.

## 14. Final Checklist

- [x] Plan reviewed
- [x] Files identified
- [x] Database changes checked
- [x] Backend changes checked
- [x] Frontend changes checked
- [x] Validation rules checked
- [x] Security considerations checked
- [x] Tests planned
- [x] Rollback plan reviewed
- [x] Assumptions and open questions resolved
- [x] "Decimal rate" confirmed as hourly rate rather than decimal hours
- [x] BP and BH mapped to actual production scopes without hard-coding
- [x] Non-billable rate display rule confirmed
- [x] PDF orientation and column layout approved
- [x] CSV columns verified as rectangular
- [x] No database mutation, migration, backfill, or deletion included
- [x] Delivery completed before June 30, 2026

# Trackly weekly department exports

- **Author** `zafajardo9`
- **Status** Proposed
- **Date** 2026-11-20

## Overview

Trackly will use its existing weekly email flow to send a consolidated department export to each eligible workspace owner or admin assigned to that department. The export will cover all seven dates for each included member and show recorded work on Saturdays and Sundays. Members will have a way to account for a past weekday with no recorded tasks so a blank day can be understood when someone reviews the report.

## The Problem

The weekly email job currently generates a personal PDF for each eligible member. This uses email capacity on individual reports and leaves owners and admins without one scheduled export they can review for their department. The dashboard also shows the **Weekly emails** button to members whose roles will no longer receive the scheduled report.

The Timesheet CSV and Excel exports already include one row per member per date, with `NO_TIME` and zero hours for an empty day. The weekly email PDF is built from completed time entries, so it omits dates with no entries and skips entirely empty weeks. A date without entries does not establish whether a member forgot to log work or was away.

## Goals

- Send one combined weekly report per department to each active `OWNER` or `ADMIN` assigned to that department. Attach the PDF when it fits. Include a signed-in Trackly page where eligible recipients can download PDF or Excel for that department and reporting week.
- Limit the **Weekly emails** control and its server-side settings to owners and admins. Apply the recipient rules when creating scheduled jobs and when sending the email.
- Show every date in the reporting period for each included member. Keep recorded Saturday and Sunday entries visible and leave empty weekends free of missing-hours reminders.
- Let members account for past weekdays with no recorded tasks. At login, let the member confirm an `N/A` record for 8 AM–5 PM. Show confirmed status in exports while keeping worked and billable totals based on actual time entries.

## Non-Goals

- Daily email reminders based on weekday or weekend hour thresholds.
- Leave requests, approval workflows, or holiday calendars.
- Changes to access to manual personal exports.

## Technical Plan (Architecture)

```text
Weekly cron → Find eligible recipients → Queue a department job per recipient
           → Build the department export → Recheck access → Send through Resend
```

### Schedule and authorization

Keep the authenticated weekly cron route, workspace-local Sunday 08:00 schedule, and preceding Sunday–Saturday reporting period. Keep the existing rollout switch, workspace allowlist, bounded job claims, provider throttling, and retry behavior. The new delivery uses the existing Resend integration.

In [`weekly-reports.server.ts`](../../src/lib/server/tracker/weekly-reports.server.ts), select active, account-linked workspace members who have an `OWNER` or `ADMIN` permission level, an email preference enabled before the report was due, and a department belonging to the same workspace. The member's assigned department determines the scope. A recipient without a valid department has no report to send. Where multiple eligible recipients belong to a department, each receives the combined export in a separate email.

Record the department and report type on each job. Give department jobs a distinct identity from legacy personal jobs. Retire unsent personal jobs at cutover and keep their delivery history. Where delivery status is uncertain, retain that status for investigation. Recheck the recipient's active membership, role, department, email, and preference when preparing the report and at the final send check. A transfer or role change ends the queued delivery. Before retrying an already prepared attachment, compare its included member IDs against the current authorized roster. If a member in the attachment is outside that scope, skip the job and clear the attachment.

### Department export

Use the job's workspace, department, timezone, and explicit reporting dates to load the department roster and the reportable time entries. Include eligible department members with no completed entries. Use the existing workspace date boundaries and report clipping so an entry crossing midnight contributes to the relevant local dates without duplicating time. Pass the seven job dates directly to the shared date and export logic. The manual Timesheet has its own week-start normalization and the scheduled report must use the dates stored on the job.

Reuse the applicable parts of [`timesheet.server.ts`](../../src/lib/server/tracker/timesheet.server.ts), [`timesheet-export.ts`](../../src/lib/time-tracker/timesheet-export.ts), and [`bulk-report-export.ts`](../../src/lib/time-tracker/bulk-report-export.ts) through a server-side query with explicit scope. Generate PDF and Excel from the same department data. Both formats show seven date rows per member, including weekends, with completed work, totals, and a status for empty dates. Continue to exclude running timers from the completed-work report. During missing-day confirmation, check for running or completed entries that overlap the date.

### Weekly email and report downloads

Send one email with a PDF attachment when it fits the weekly mailer's attachment budget. Always link to the signed-in weekly department report page. If the PDF exceeds the budget, send the email with the page link and explain that both formats are available there. Generate Excel only when requested, so it uses no email attachment capacity.

The page identifies the workspace, department, and exact Sunday–Saturday dates, with **Download PDF** and **Download Excel** actions. Authorize the page and each download against the current active `OWNER` or `ADMIN` membership for the report department. Signed-in recipients with access can reopen the page to download files without another email. Downloads use current report data for those dates, so late corrections may appear in a download after the original PDF was sent. Keep the page and downloads private and avoid caching staff data in shared caches.

### Missing-weekday confirmation

After workspace access resolves and the app is online, check only the most recent completed Monday–Friday date in the workspace timezone. On Monday, that date is Friday. Prompt if the member has no overlapping entries or prior confirmation. **Later** closes the prompt for the current app session. On confirmation, persist `N/A` for 8 AM–5 PM local time as a day-status record keyed by workspace, member, and date. Recheck the day at write time and make repeated confirmation safe. Allow the member to undo their own confirmation in Timesheet. Late or offline-synced work takes precedence in exports. Keep the interval out of tracked hours, billing, and payroll totals. Older gaps and unresolved dates remain `NO_TIME`. Reserve `LEAVE` for confirmed leave.

### Dashboard and preferences

In [`TimeTrackerDashboard.tsx`](../../src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx), render **Weekly emails** for `OWNER` and `ADMIN`. Update [`WeeklyReportEmailsButton.tsx`](../../src/components/time-tracker/shared/WeeklyReportEmailsButton.tsx) to identify the department and next reporting period, and show when a missing department makes delivery unavailable. Authorize reads and updates in [`weekly-report-preferences.server.ts`](../../src/lib/server/weekly-report-preferences.server.ts) using the same role policy. Read delivery history for department jobs and keep the existing per-recipient opt-out. Manual personal export remains available through **Export my time**.

## Alternatives Considered

### Show `N/A` only in exports

The export could show `N/A` with zero tracked hours for all past weekdays without entries. This requires no confirmation storage or login interruption. The label would still describe a gap in the data, and reviewers would have no way to tell whether the member had checked that date.

**Rejected by author:** The author chose the login confirmation flow, which records the member's response and lets the export distinguish confirmed dates from unresolved gaps.

### Keep sending personal weekly emails

The current job provides a private report of completed entries to each eligible member. It uses one delivery per eligible member and gives department owners and admins no consolidated report through that job.

**Rejected by author:** Email delivery capacity is limited. Send the combined department report to the eligible owners and admins who review it. Members can still use the manual personal export.

### Send weekend shortfall reminders

A four-hour threshold could identify weekend logs below a target. Applying it to all staff would also flag people who were off. Applying it only to people who logged time would miss a scheduled shift with zero entries.

**Rejected by author:** The weekend requirement is to include Saturdays and Sundays in exports. Weekend attendance enforcement is outside the requested scope.

### Attach PDF and Excel to the same email

Attaching both files would let recipients open either format directly from their inbox. It would also increase the message size and require the job to generate both formats before sending.

**Rejected by author:** Attach PDF when it fits and make Excel available through Trackly. The same page provides a way to download the PDF when the attachment is too large.

## Additional Resources

- [Timesheet dates and empty-day status](../../src/lib/time-tracker/timesheet.ts)
- [Existing weekly email worker](../../src/lib/server/tracker/weekly-reports.server.ts)
- [Weekly email operations](../../docs/email-logics/weekly-personal-reports.md)

## Detailed Implementation Plan

1. **Store weekday confirmations and department job scope.** Update [`src/db/schema.ts`](../../src/db/schema.ts) and create `drizzle/0028_weekly_department_reports.sql` and `drizzle/meta/0028_snapshot.json`. Register the migration in [`drizzle/meta/_journal.json`](../../drizzle/meta/_journal.json). Add a day-status table with workspace ID, member ID, local date, and confirmation timestamp. Use one row per workspace, member, and date. A row represents a member-confirmed `N/A` interval of 8 AM–5 PM local time. Store no leave reasons and create no `time_entries` rows. Add report type, department ID, and frozen attachment roster IDs to weekly jobs. Adjust the unique key to distinguish personal and department jobs for the same recipient and week. Keep one department delivery per recipient and report week, even if the recipient changes departments during scheduling.

2. **Implement the missing-weekday APIs.** Create `src/lib/server/tracker/missing-weekday.server.ts` and `src/lib/server/missing-weekday.ts` for the server-only queries and authenticated server functions. Derive workspace and member from the session. Calculate the previous local calendar day, step back over weekends, and check only that date. Skip dates before the member's workspace membership was created. Use the day interval from [`src/lib/server/tracker/shared/dates.ts`](../../src/lib/server/tracker/shared/dates.ts). A completed entry overlaps the day when it starts before day-end and ends after day-start. A running entry starting before day-end also suppresses the prompt. Confirm only the current candidate date using an atomic conditional insert. Return the existing confirmation on a repeat and refresh when a newly synced entry makes the date ineligible. Undo deletes only the signed-in member's confirmation for the supplied date. Use the existing trusted-origin checks for writes.

3. **Show the prompt and support corrections.** Create `src/components/time-tracker/shared/MissingWeekdayDialog.tsx` and mount it from [`src/components/time-tracker/AppShell.tsx`](../../src/components/time-tracker/AppShell.tsx) after the workspace loads. Scope its query by workspace and account using [`src/lib/time-tracker/query-keys.ts`](../../src/lib/time-tracker/query-keys.ts). Fetch online and keep this request outside the blocking app loader. Show the candidate date, the local 8 AM–5 PM interval, and actions to **Confirm N/A** or **Later**. Remember **Later** for that user, workspace, and candidate date during the mounted app session. Keep the dialog open if a write fails. In [`src/components/time-tracker/timesheet/TimesheetScreen.tsx`](../../src/components/time-tracker/timesheet/TimesheetScreen.tsx), expose **Undo N/A** only on a signed-in member's own confirmed day. Refresh the prompt and Timesheet data after either mutation. Render confirmed `N/A` in a separate status field from actual time in and out.

4. **Build a single department report dataset.** Create `src/lib/server/tracker/weekly-department-report.server.ts` and reuse the date-range and interval-clipping functions used by [`src/lib/server/tracker/member-report.server.ts`](../../src/lib/server/tracker/member-report.server.ts). Query active members in the department and workspace, completed entries overlapping the specified week, and applicable confirmations. Include members who have zero entries. Use each job's stored Sunday–Saturday dates and timezone. Split completed intervals across local days. Include one row per day for each active member and use `WORK` for recorded work, `N/A` for a valid confirmation, and `NO_TIME` otherwise. Exclude running time from weekly totals and suppress a confirmation when a real entry overlaps the date. Show 8 AM–5 PM in confirmation fields only. Use blank actual time fields and zero worked hours for `N/A`. Apply the same status overlay for the scoped manual Timesheet in [`src/lib/server/tracker/timesheet.server.ts`](../../src/lib/server/tracker/timesheet.server.ts) and update [`src/lib/time-tracker/timesheet.ts`](../../src/lib/time-tracker/timesheet.ts) and [`src/lib/time-tracker/timesheet-export.ts`](../../src/lib/time-tracker/timesheet-export.ts) so the manual grid, CSV, and Excel can display it. Preserve the manual Timesheet's Monday–Sunday dates and existing access rules.

5. **Render report files.** Create `src/lib/time-tracker/weekly-department-report-export.ts` for server-compatible PDF and Excel output. Use the PDF table and pagination pattern from [`src/lib/time-tracker/bulk-report-export.ts`](../../src/lib/time-tracker/bulk-report-export.ts) and the workbook builder pattern from [`src/lib/time-tracker/timesheet-export.ts`](../../src/lib/time-tracker/timesheet-export.ts). Put the department, reporting dates, timezone, daily rows, and worked-hour totals in both files. Use filterable daily rows, numeric duration columns, and existing spreadsheet text handling in Excel. Generate either format from the same row data. Use the department and week in each filename. Preserve the manual personal export and its existing task-level renderer.

6. **Provide a signed-in report page and download endpoints.** Create `src/routes/app/weekly-department-report.$reportId.tsx`, `src/routes/api/reports/weekly-department.$reportId.$format.ts`, and `src/lib/server/weekly-department-report.ts`. Use the stored department job ID to look up the exact dates and timezone. Authorize metadata and files against the signed-in account's active same-workspace membership, `OWNER` or `ADMIN` role, and current assignment to that department. Resolve the workspace from the report so opening an email while another workspace is selected cannot expose that workspace's data or select the wrong report. Show the report details and **Download PDF** and **Download Excel** on the page. Validate the format, regenerate just that file, and return it as a private, non-cacheable attachment. Return an unavailable response for a missing, expired, or unauthorized report. A report link carries no authority by itself. Retain download links for the existing job metadata retention window of 90 days after terminal status. In [`src/routes/app.tsx`](../../src/routes/app.tsx) and [`src/routes/auth/index.tsx`](../../src/routes/auth/index.tsx), carry a validated report ID through sign-in into this typed report route. Leave invite and ordinary sign-in routing intact. Regenerate [`src/routeTree.gen.ts`](../../src/routeTree.gen.ts) from the new routes.

7. **Switch the weekly worker to department delivery.** Update [`src/lib/server/tracker/weekly-reports.server.ts`](../../src/lib/server/tracker/weekly-reports.server.ts). Enqueue only eligible department recipients. Revalidate role, department, account email, preference, and the frozen PDF roster at the guarded send attempt. Build the PDF and include it when it fits the existing 10 MiB attachment budget. For a larger PDF, send the same report link without an attachment. Generate no Excel workbook in the cron worker. Keep existing job leases, frozen retry payloads, provider idempotency keys, capacity limits, and retry classifications. Clear frozen payload and roster metadata at terminal outcomes. During cutover, skip unsent personal jobs and quarantine any legacy delivery still marked as processing after a provider attempt. Preserve sent and uncertain history. Keep the existing cron route and deployment schedule.

8. **Restrict weekly settings and link to the available report.** Update [`src/lib/server/weekly-report-preferences.server.ts`](../../src/lib/server/weekly-report-preferences.server.ts), [`src/components/time-tracker/shared/WeeklyReportEmailsButton.tsx`](../../src/components/time-tracker/shared/WeeklyReportEmailsButton.tsx), and [`src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx`](../../src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx). Guard both preference reads and writes by the active membership's role. Render the button only for owners and admins. Show the recipient's department, preference, and next week. Show that delivery requires a department when one is absent. Read department jobs only and link the latest available report for the recipient's current department so they can reach the same download page without the email. Keep existing preference values and disable pending jobs for a recipient who opts out.

9. **Document rollout and extend verification.** Update [`docs/email-logics/weekly-personal-reports.md`](../../docs/email-logics/weekly-personal-reports.md) and [`docs/email-logics/README.md`](../../docs/email-logics/README.md) to explain the new recipient rule, links, attachment fallback, retention, and cutover. Disable the existing weekly switch during cutover, apply the migration, deploy the replacement, verify one allowlisted workspace, and expand after checking recipient scopes and sample downloads. Stop deliveries with the existing switch if needed. Update [`src/lib/server/__tests__/weekly-reports.integration.test.ts`](../../src/lib/server/__tests__/weekly-reports.integration.test.ts), [`src/lib/time-tracker/weekly-report-pdf.test.ts`](../../src/lib/time-tracker/weekly-report-pdf.test.ts), and [`src/lib/time-tracker/timesheet-export.test.ts`](../../src/lib/time-tracker/timesheet-export.test.ts). Add `src/lib/server/__tests__/missing-weekday.integration.test.ts` and `src/lib/server/__tests__/weekly-department-report-access.test.ts` for the new confirmation and download paths.

### Verification Plan

- Run `pnpm lint`, `pnpm build`, and `pnpm test`. Apply the migration to disposable local Postgres and run the database integration tests there.
- Verify days around workspace-local midnight, Friday selection on Monday, concurrent confirmations, undo, a running timer crossing midnight, and a late sync. Verify `N/A` never adds tracked, billable, or payroll time. Verify existing personal exports remain available.
- Compare PDF and Excel for the same Sunday–Saturday report. Check a member with no entries, both weekend days, a cross-midnight entry, a confirmed weekday, and a `NO_TIME` date. Verify the manual Timesheet remains Monday–Sunday.
- Verify one email per eligible recipient, PDF attachment under the budget, link-only delivery above it, and access to both formats when the PDF is omitted. Test an employee, manager, another department, another workspace, and a transferred or demoted recipient through settings, email, and direct download. Verify sign-in returns the user to the requested report, an expired link has a clear unavailable state, and role or roster changes invalidate an unauthorized retry.
- Exercise concurrent cron invocations, legacy job retirement, unchanged payload on an authorized retry, provider throttling, and uncertain-delivery handling. Use a scoped test inbox to check the email link, filenames, attachment, and fallback before broader rollout.

*Drafted with EGM*

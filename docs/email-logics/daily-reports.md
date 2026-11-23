# Daily reports and short-hours reminders

Trackly replaces the end-of-shift routine of exporting logs and sending them to
department heads. Every night it emails each member's day to the member, each
department's day to that department's Admins, and the whole workspace's day to
the Owners. It also reminds members whose timesheet looks incomplete.

## What is sent

| Email                 | When (workspace time)            | Recipients                                                                                     | Covers                    |
| --------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------- |
| Member report         | From 00:00, for the previous day | The member                                                                                     | Their own day and entries |
| Department report     | From 00:00                       | Every Admin assigned to that department                                                        | That department only      |
| Workspace report      | From 00:00                       | Roles with **Receive daily attendance digest** (Owner by default) and `DAILY_REPORT_HR_EMAILS` | Every department          |
| End-of-shift reminder | Mon–Fri from 17:00               | Members under the minimum with no running timer                                                | Today so far              |

- A department with no Admin gets no department report. Managers are never
  used as a fallback; the Owners still see that department in the workspace
  report.
- Admins get the workspace report only if an Owner turns the permission on for
  the Admin role in Catalogs → Roles → Permissions. Any other role (for example
  an HR role) can be given it the same way.
- A member report is sent when the member logged time that day or needs a
  reminder. Nobody gets an email for an empty Sunday or holiday.

## Morning check-in

When a member opens Trackly, a dialog shows their previous working day once
per day: hours against the minimum, time in–out, billable time, entries, the
largest entries, and any timer left running. Sundays and holidays are skipped.
Saturday is skipped too unless the member logged time on the Saturday before,
so on Monday a Monday–Friday member sees Friday and a Saturday worker sees
Saturday.

If that day is Short or has no time, the dialog asks **"Were you on leave on
…?"**:

- **Yes, I was on leave** records the answer. The day becomes **On leave** in
  daily reports and is no longer flagged. For a Monday–Friday with no entries it
  also stores the existing N/A confirmation, so the weekly department export
  shows the day as accounted for. The member can undo it.
- **No work to log (N/A)** appears for a Monday–Friday with no time. It saves
  the existing N/A confirmation without adding tracked hours.
- **No, I'll add my time** opens the Timesheet for that week.
- **Later** asks again the next time the app is opened.

Answers are audit events (`DAY_LEAVE_DECLARED` and `DAY_LEAVE_WITHDRAWN`,
shown under **Attendance** in Audit logs), so no new table is needed. Members
can answer for the last 14 days. The check-in only appears for people who
logged time in the last 30 days.

The check-in shows first. After it is closed, or when there is none, the
missing-weekday N/A prompt may ask about an earlier weekday. It never asks about
the date the check-in covered. On a Monday, for example, the check-in covers
Saturday and the N/A prompt can still ask about Friday. Code:
`src/components/time-tracker/shared/DailyRecapDialog.tsx`,
`src/components/time-tracker/shared/MissingWeekdayDialog.tsx`, and
`src/lib/server/tracker/daily-recap.server.ts`.

## PDF, Excel, and the download link

Every report email carries a link to a signed-in **download page** with
**Download PDF** and **Download Excel** buttons. The PDF is also attached when
it is no larger than `DAILY_REPORT_ATTACHMENT_MAX_MB` (2 MB by default). When
it is larger, cannot be built, or the run is short on time, the email carries
only the link. Excel is never attached; it is built when someone clicks
download.

- The link is a signed token (`/daily-report?t=…`, valid 90 days) naming the
  workspace, the scope (member, department, or workspace), and the date. No
  report row is stored.
- Opening the page or a download requires signing in, and access is checked
  against current membership every time: the workspace report needs the
  permission; a department report needs Owner, the permission, or Admin in that
  department; a member report needs the member themself or someone who can open
  their department.
- Files are built from current data, so entries corrected after the email went
  out are included in a later download.

Measured on production data for one day: member PDFs about 14 KB, the largest
department about 110 KB, and the whole workspace about 240 KB.

## Rules

- **Monday–Friday minimum:** the workspace's expected daily hours minus a break
  allowance. With the default 8 hours and 0.5 hour allowance, that is 7.5 hours.
- **Saturday minimum:** 4 hours (a half day), only for members who logged time
  on the previous Saturday. For them, a Saturday with no entries is flagged like
  a weekday. Everyone else is treated as working Monday–Friday: Saturday is a
  rest day for them, they are not flagged or asked about it, and they are left
  out of Saturday's department and workspace reports unless they worked. Set
  `DAILY_REPORT_SATURDAY_MIN_HOURS=0` to make Saturday a rest day for
  everyone.
- **Sundays and holidays** are rest days and are never flagged. Holidays come
  from `DAILY_REPORT_HOLIDAYS`.
- **Statuses:** Complete, Short, No time logged, On leave (answered in the
  morning check-in), N/A (an earlier N/A confirmation), Rest day.
- **Hours** are completed entries clipped to the local day, the same rule as the
  weekly department report. A timer still running at midnight is not counted
  and is called out so the member can stop or fix it.
- **Who is reminded:** members who logged time in the last 30 days and are not
  Owners. Members who have not tracked time in 30 days are left out of the
  department and workspace reports too.

## Delivery

- Cron route `/api/cron/daily-reports` runs every 5 minutes (see `vercel.json`)
  and is protected by `CRON_SECRET`. It only acts inside each workspace's
  windows: 00:00–06:00 for the nightly report and two hours from
  `DAILY_REPORT_NUDGE_HOUR` for the reminder.
- Each email has a stable key such as
  `daily:department_digest:2026-11-19:<departmentId>.<adminMemberId>`. After a
  successful send the key is written to the audit log as `DAILY_REPORT_EMAIL`
  (noting `pdf_attached` or `link_only`), and later ticks skip it. Permanent
  provider rejections are written as `DAILY_REPORT_EMAIL_FAILED` and are not
  retried. Admins can filter both under **Automated emails** in Audit logs.
- The same key is sent to Resend as the idempotency key, so a retry after a
  timeout or a lost audit write cannot deliver twice.
- Sends share the weekly report's Resend budget (`weekly_report_throttle`, one
  per second). Each tick stops starting new sends after 25 seconds; the next
  tick continues where it stopped. A department's PDF and link are built once
  per tick and reused for all of its Admins.

Code: `src/lib/server/tracker/daily-reports.server.ts` (worker),
`daily-report-data.server.ts` (queries), `daily-report-access.server.ts` (page
and download access), `src/lib/time-tracker/daily-report.ts` (rules and
configuration), `daily-report-export.ts` (PDF and Excel),
`src/lib/server/email-templates/daily-report.ts` (templates),
`src/routes/daily-report.tsx` and `src/routes/api/reports/daily.$format.ts`.

## Configuration

| Variable                             | Default | Purpose                                             |
| ------------------------------------ | ------- | --------------------------------------------------- |
| `DAILY_REPORT_EMAILS_ENABLED`        | `false` | Master switch                                       |
| `DAILY_REPORT_WORKSPACE_IDS`         | empty   | Limit to these workspaces; empty means all          |
| `DAILY_REPORT_HR_EMAILS`             | empty   | Shared mailboxes that also get the workspace report |
| `DAILY_REPORT_NUDGE_HOUR`            | `17`    | Local hour for the Mon–Fri reminder, or `off`       |
| `DAILY_REPORT_BREAK_ALLOWANCE_HOURS` | `0.5`   | Subtracted from expected daily hours on weekdays    |
| `DAILY_REPORT_SATURDAY_MIN_HOURS`    | `4`     | Saturday minimum; `0` makes Saturday a rest day     |
| `DAILY_REPORT_HOLIDAYS`              | empty   | Comma-separated `YYYY-MM-DD` rest days              |
| `DAILY_REPORT_ATTACHMENT_MAX_MB`     | `2`     | Largest PDF to attach; `0` sends links only         |

`RESEND_API_KEY`, `APP_URL` (or `BETTER_AUTH_URL`), `BETTER_AUTH_SECRET` (signs
the links), and `CRON_SECRET` are required.

## Rollout

1. Check each department's Admins in Members. Departments without an Admin are
   covered only by the workspace report.
2. Enable for one workspace with `DAILY_REPORT_WORKSPACE_IDS` and check the
   Audit log the next morning.
3. Remove the workspace limit.

## Known limits

- There is no per-member opt-out; the switch is per deployment and workspace.
- There is no leave calendar or approval. Members say they were on leave in
  the morning check-in after the fact, so they still get that evening's
  reminder. Saturday leave shows in the daily reports but not in the weekly
  department export, whose N/A table only accepts Monday–Friday.
- Members who habitually log the next morning will show as short in that
  night's report. Downloads made later include their entries.
- Rotating `BETTER_AUTH_SECRET` invalidates links in emails already sent.

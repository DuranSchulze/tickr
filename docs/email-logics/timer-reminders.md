# Timer Reminder Emails

## Purpose

Timer reminder emails notify users when they still have an active time entry late in the day.

## Trigger path

- Cron route: `src/routes/api/cron/timer-reminders.ts`
- Worker logic: `src/lib/server/tracker/timer-reminders.server.ts`
- Delivery path: `sendTimerReminderEmail(...)` -> `sendEmail(...)`

## Current logic

1. Load active time entries where `endedAt IS NULL`
2. Join workspace, member, user, project, task, and client data
3. Convert current time and timer start time into the workspace timezone
4. Mark a timer as due once local hour is `>= LATE_TIMER_REMINDER_HOUR`
5. Avoid duplicate same-day sends via `timer_reminder_emails`
6. Email the member and persist a sent record

## Data guardrails

Deduplication is backed by:

- table: `timer_reminder_emails`
- unique key: `(timeEntryId, reminderDate)`

That means one timer gets at most one reminder per local calendar date.

## Findings

### Good

- Reminder sending is timezone-aware at the workspace level.
- Duplicate same-day sends are prevented at both code and database level.
- Failures are captured in the cron response payload and server logs.

### Gaps

- Reminder policy is global via env var, not configurable per workspace.
- There is no user-level opt-out or snooze behavior.
- The route is cron-protected, but there is no built-in scheduler health report in the UI.
- Reminder sends are persisted only as "sent"; provider outcome metadata is not stored.

## Recommended improvements

1. Add workspace-level settings:
   - reminders enabled
   - reminder hour
   - optional repeat interval
2. Add user-level suppression or snooze preferences.
3. Store provider, delivery status, and failure reason in an email-delivery table.
4. Add a small admin report showing:
   - last cron run
   - due count
   - sent count
   - failure count

## Related files

- `src/routes/api/cron/timer-reminders.ts`
- `src/lib/server/tracker/timer-reminders.server.ts`
- `src/lib/server/email-templates/timer-reminder.ts`
- `src/lib/server/mailer.ts`
- `src/db/schema.ts`

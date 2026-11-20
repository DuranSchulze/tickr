# Weekly department reports

The weekly worker sends one consolidated department report to each active, account-linked workspace owner or admin assigned to that department who opted in by the scheduled send time. All seven dates appear for each included member, even when no work was recorded. Weekly emails and delivery history are available to owners and admins. Members can still export their own time from the tracker.

Each email links to a signed-in Trackly page that offers PDF and Excel for that department and week. The PDF is attached when its raw size is at most 10 MiB and the worker can prepare it within its budget. The worker sends the link alone when PDF preparation is unavailable, over budget, or the roster exceeds 100 members.

## Rollout

1. Set `WEEKLY_REPORT_EMAILS_ENABLED=false` for the legacy deployment. Cut over between weekly runs, after the previous delivery window and before the next Sunday occurrence. Wait for running invocations to finish before applying the migration. Confirm no workspace has a partially processed member cursor for the next occurrence.
2. Apply migration `0028_weekly_department_reports`, then deploy the department worker and report routes. The migration retires pending or retryable personal jobs. It records a legacy processing job with a started attempt as `uncertain` and preserves sent and uncertain history. The department worker claims department jobs only.
3. Configure `CRON_SECRET`, `RESEND_API_KEY`, a verified `RESEND_FROM` or `EMAIL_FROM`, and HTTPS `APP_URL`. Weekly delivery uses Resend.
4. Set `WEEKLY_REPORT_WORKSPACE_IDS=<test-workspace-id>` and `WEEKLY_REPORT_EMAILS_ENABLED=true`. Verify the department scope, both downloads, an attached PDF, and a link-only message in a test inbox. Check that job age stays within the delivery window for a representative large department before expanding the allowlist.
5. Set `WEEKLY_REPORT_EMAILS_ENABLED=false` to pause future delivery. Trackly cannot recall a message already accepted by Resend. Previously published links remain available until they expire.

## Schedule and privacy

The authenticated cron uses the workspace’s local Sunday 8 AM occurrence. Its report covers the preceding Sunday to Saturday in the timezone recorded for that occurrence. During an outage it recovers only the latest occurrence still within the 48-hour delivery window. It preserves the existing bounded claims, provider throttling, and retry window. A delivery whose acceptance is uncertain has no automatic retry.

Each department and reporting week has a shared report link, independent of individual delivery jobs. It expires 90 days after the scheduled occurrence, even with delivery paused. Access requires a current active owner or admin assignment to that exact department and workspace. Opting out of email does not revoke download access. Generated files use current data for the stored dates so late corrections can differ from the emailed PDF.

Reports use the active department roster and clip work to the start of each member’s current department assignment. New assignments are tracked from the migration onward. For earlier assignments Trackly uses the membership creation date as the starting point. Dates before the assignment are marked `OUT_OF_SCOPE`. Worked and billable totals sum clipped completed entry durations, including overlapping entries. Running timers contribute zero completed time. A confirmed weekday without overlapping time is `N/A` from 8 AM to 5 PM. That confirmation is a separate record and adds no worked, billable, or payroll hours. An unresolved gap stays `NO_TIME`.

## Verification

```sh
pnpm check-all
pnpm build
pnpm test src/lib/server/__tests__/weekly-reports.integration.test.ts
# Optional multi-connection run against a disposable local PostgreSQL server.
WEEKLY_REPORT_TEST_DATABASE_URL=postgres://postgres:weekly-local-test@127.0.0.1:55439/weekly_test \
  pnpm test src/lib/server/__tests__/weekly-reports.integration.test.ts
```

The default integration run applies the real weekly migrations to an embedded PostgreSQL database. The optional local PostgreSQL run exercises the job logic across separate connections. Resend calls are mocked in tests.

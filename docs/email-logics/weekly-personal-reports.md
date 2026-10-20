# Weekly personal PDF emails

Active account-linked workspace members receive only their own completed entries, Sunday–Saturday, beginning Sunday at 08:00 in the workspace timezone. Each workspace produces a separate private email. Empty reports are skipped; running timers are excluded and the PDF/email explain this. The existing member-report query, clipping, totals, rates, and PDF renderer are reused.

## Rollout

1. Run `pnpm db:migrate` to apply `0026_weekly_personal_reports.sql` in the intended environment. The migration is additive; no production migration is run by the implementation workflow.
2. Configure `CRON_SECRET`, `RESEND_API_KEY`, a verified `RESEND_FROM` (or `EMAIL_FROM`), and HTTPS `APP_URL`. Weekly reports require Resend and never fall back to SMTP.
3. Set `WEEKLY_REPORT_EMAILS_ENABLED=true` and `WEEKLY_REPORT_WORKSPACE_IDS=<test-workspace-id>` to activate a test workspace. The switch defaults off; member preferences default on for existing/new members.
4. Deploy on a Vercel plan supporting five-minute cron. `vercel.json` invokes `/api/cron/weekly-reports`; Nitro gives this route a 60-second maximum, while the worker targets 40 seconds. GET and POST require the bearer cron secret. Preview deployments must keep the switch off unless explicitly used as the test environment.
5. Activation registers future Sundays only; activate before the desired Sunday. There is no initial historical backfill. Validate the PDF/email in a test inbox, opt-out, cron heartbeat, quota, and queue drain before clearing the workspace allowlist for global rollout.
6. Roll back delivery immediately with `WEEKLY_REPORT_EMAILS_ENABLED=false`. An already submitted email cannot be recalled. Keep the additive schema and preferences; resume safely after investigation.

Members manage the preference via **Time tracker → Weekly emails**, beside **Export my time**. The dialog shows recipient, workspace, timezone, next period, last outcome, and rollout activation. Turning it off cancels unsent jobs. Turning it on records a fresh eligibility boundary, so already-due periods are not backfilled. No recipient input or admin controls exist.

## Scheduling and capacity

Schedules initialize 100 workspaces per invocation and page 250 members per due workspace, with at most 25 due workspaces considered before the scheduling time budget. Cursor advancement and job insertion share an atomic SQL statement. Jobs are unique by workspace/member/week. Outages catch up only the latest scheduled week within 48 hours; older periods are skipped. Invalid timezone names cannot initialize a schedule and should be corrected in workspace settings.

Workers claim at most 25 jobs per invocation using row locks and `SKIP LOCKED`, with two generators and two-minute leases. Claims stop after 20 seconds to leave time for the 15-second provider timeout and persistence within the 40-second budget. All work is awaited before responding. A database-backed shared reservation limits weekly-report sends to one request/second, with provider `Retry-After` suppression across invocations. Other app emails share the provider quota and can cause additional rate limits.

The theoretical upper bound is 300 reports/hour (25 jobs × 12 invocations); actual capacity is lower when generation, retries, or scheduling consume time. A 1,000-report backlog therefore needs at least 3h20m at this configuration. Before global activation, measure the eligible count, representative large PDF generation time/memory, provider quota, actual sent/hour, and oldest pending age. Increase worker cadence/capacity only after measuring; adopt an external worker queue if the delivery window cannot be met. The local integration suite tests 251-member pagination and concurrent invocations, not production provider throughput.

## Delivery safety

PDF attachment limit is 10 MiB before base64 encoding. Frozen payloads include recipient, sender, subject, body, and PDF. Jobs record sanitized failure codes only; attachment bytes and message bodies are never logged. Frozen payloads are cleared on terminal outcomes and retained only while work is pending/retrying. A changed account email causes the frozen job to be skipped rather than altering the idempotent request.

Provider acceptance is `sent`, not inbox delivery. A stable per-job Resend idempotency key protects retries. Explicit rate-limit rejections retry with exponential backoff and `Retry-After`, up to five attempts and strictly within 20 hours of the first provider attempt. Ambiguous timeouts, 5xx responses, or failure to persist acceptance become `uncertain`, with no automatic resend. Investigate in the provider dashboard before any manual intervention. An expired lease with prior delivery attempts is likewise quarantined; an expired pre-send lease returns to pending.

Resend references: [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [error classification](https://resend.com/docs/api-reference/errors).

## Monitoring and retention

Every successful enabled invocation logs a timestamped heartbeat, duration, per-run outcome counts, pending count, and oldest pending age. Failed invocations return HTTP 500 with a sanitized error. Alert externally when heartbeat is absent for 15 minutes, backlog grows across runs, oldest pending exceeds the agreed delivery window, or any terminal/uncertain outcome occurs. No new monitoring SaaS or alert destination is provisioned by this change.

Inspect job metadata without payloads:

```sql
SELECT status, count(*), min(due_at) AS oldest_due
FROM weekly_report_jobs GROUP BY status;

SELECT id, workspace_id, member_id, week_start, status, attempts,
       provider_id, error, updated_at
FROM weekly_report_jobs
WHERE status IN ('terminal_failure', 'uncertain')
ORDER BY updated_at DESC;
```

Completed metadata is retained for 90 days and pruned in batches of 500. Keep the cron enabled for cleanup, even when there is no due work. The global kill switch pauses cleanup too.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
# Disposable local Postgres only; the integration suite refuses remote hosts.
WEEKLY_REPORT_TEST_DATABASE_URL=postgres://postgres:weekly-local-test@127.0.0.1:55439/weekly_test \
  pnpm test src/lib/server/__tests__/weekly-reports.integration.test.ts
```

The integration suite creates an isolated schema, applies the actual migration, exercises real PostgreSQL locking/cursors, and drops its schema afterward. PDF and provider delivery are mocked in those queue tests. The PDF renderer and mail transport have separate tests. Staging inbox delivery, production quota checks, and production load measurements remain rollout requirements.

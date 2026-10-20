import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '#/db'
import { buildMemberReport } from './member-report.server'
import { buildWeeklyMemberReportPdf } from '#/lib/time-tracker/member-report-export'
import { formatHms } from '#/lib/time-tracker/export-utils'
import {
  retryAllowed,
  retryDelayMs,
} from '#/lib/time-tracker/weekly-report-schedule'
import {
  getResendFromAddress,
  sendWeeklyReportEmail,
  WeeklyEmailError,
} from '../mailer'
import type { SendEmailInput } from '../mailer'

export function weeklyReportsEnabled() {
  return process.env.WEEKLY_REPORT_EMAILS_ENABLED === 'true'
}
function allowedWorkspaces() {
  return (process.env.WEEKLY_REPORT_WORKSPACE_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
function scopeFilter(column: ReturnType<typeof sql>) {
  const ids = allowedWorkspaces()
  return ids.length
    ? sql`${column} in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql`true`
}
function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  )
}

type Job = {
  id: string
  workspace_id: string
  member_id: string
  timezone: string
  week_start: string
  week_end: string
  due_at: string
  attempts: number
  first_attempt_at: string | null
  lease_token: string
  payload: SendEmailInput | null
}
type Recipient = { email: string; workspace_name: string }
async function recipient(job: Job): Promise<Recipient | undefined> {
  const result = await db.execute<Recipient>(sql`
    select u.email, w.name as workspace_name from workspace_members m
    join users u on u.id = m.user_id join workspaces w on w.id = m.workspace_id
    where m.id = ${job.member_id} and m.workspace_id = ${job.workspace_id}
      and m.status = 'ACTIVE' and m.weekly_report_email_enabled
      and m.weekly_report_enabled_at <= ${job.due_at}::timestamptz`)
  return result.rows[0]
}

/** All cursor movement and inserts happen in the same statement (Neon HTTP compatible). */
async function enqueue(deadline: number) {
  // Initialize future schedules only: enabling rollout never backfills historical weeks.
  await db.execute(sql`
    insert into weekly_report_schedules (workspace_id, timezone, due_at)
    select w.id, w.timezone,
      (case when local_due > now() at time zone w.timezone then local_due
        else local_due + interval '7 days' end) at time zone w.timezone
    from workspaces w
    cross join lateral (select date_trunc('week', (now() at time zone w.timezone) + interval '1 day')
      - interval '1 day' + interval '8 hours' as local_due) t
    where not exists (select 1 from weekly_report_schedules s where s.workspace_id = w.id)
      and exists (select 1 from pg_timezone_names z where z.name = w.timezone)
      and ${scopeFilter(sql`w.id`)}
    order by w.id limit 100 on conflict do nothing`)
  // An outage can span weeks: recover only the latest Sunday, never a backlog of weeks.
  await db.execute(sql`
    with stale as (
      select workspace_id from weekly_report_schedules where due_at < now() - interval '48 hours'
        and ${scopeFilter(sql`workspace_id`)} order by due_at limit 100 for update skip locked
    ), dates as (
      select s.workspace_id, date_trunc('week', (now() at time zone s.timezone) + interval '1 day')
        - interval '1 day' + interval '8 hours' as sunday from weekly_report_schedules s join stale using (workspace_id)
    ) update weekly_report_schedules s set member_cursor = '',
      due_at = (case when dates.sunday at time zone s.timezone >= now() - interval '48 hours'
        then dates.sunday else dates.sunday + interval '7 days' end) at time zone s.timezone
    from dates where s.workspace_id = dates.workspace_id`)

  const due = await db.execute<{ workspace_id: string }>(sql`
    select workspace_id from weekly_report_schedules where due_at <= now()
      and ${scopeFilter(sql`workspace_id`)} order by due_at, workspace_id limit 25`)
  for (const schedule of due.rows) {
    if (Date.now() >= deadline) break
    await db.execute(sql`
      with locked as (
        select * from weekly_report_schedules where workspace_id = ${schedule.workspace_id}
          and due_at <= now() for update skip locked
      ), members as (
        select m.id from workspace_members m join locked s on s.workspace_id = m.workspace_id
        where m.id > s.member_cursor order by m.id limit 250
      ), inserted as (
        insert into weekly_report_jobs (id, workspace_id, member_id, week_start, week_end, timezone, due_at)
        select s.workspace_id || ':' || m.id || ':' || ((s.due_at at time zone s.timezone)::date - 7)::text,
          s.workspace_id, m.id, (s.due_at at time zone s.timezone)::date - 7,
          (s.due_at at time zone s.timezone)::date - 1, s.timezone, s.due_at
        from locked s join workspace_members m on m.workspace_id = s.workspace_id
        join users u on u.id = m.user_id join members page on page.id = m.id
        where m.status = 'ACTIVE' and m.weekly_report_email_enabled
          and m.weekly_report_enabled_at <= s.due_at and s.due_at >= now() - interval '48 hours'
        on conflict do nothing returning id
      )
      update weekly_report_schedules s set
        member_cursor = case when (select count(*) from members) = 250 then (select max(id) from members) else '' end,
        due_at = case when (select count(*) from members) = 250 then s.due_at else
          (case when s.due_at >= now() - interval '48 hours'
            then (s.due_at at time zone s.timezone)::date + interval '7 days 8 hours'
            else date_trunc('week', (now() at time zone w.timezone) + interval '1 day') + interval '6 days 8 hours'
          end) at time zone w.timezone end,
        timezone = case when (select count(*) from members) = 250 then s.timezone else w.timezone end
      from locked l, (select id, coalesce((select name from pg_timezone_names z where z.name = w.timezone limit 1),
        (select timezone from weekly_report_schedules old where old.workspace_id = w.id)) as timezone from workspaces w) w where s.workspace_id = l.workspace_id and w.id = s.workspace_id`)
  }
}
async function claim(): Promise<Job | undefined> {
  const token = randomUUID()
  const result = await db.execute<Job>(sql`
    with candidate as (
      select id from weekly_report_jobs where status in ('pending', 'retryable_failure')
        and next_attempt_at <= now() and ${scopeFilter(sql`workspace_id`)}
      order by due_at, id for update skip locked limit 1
    ) update weekly_report_jobs j set status = 'processing', lease_until = now() + interval '2 minutes',
      lease_token = ${token}, updated_at = now() from candidate c where j.id = c.id returning j.*`)
  return result.rows[0]
}
async function finish(
  job: Job,
  status: string,
  error: string | null = null,
  providerId: string | null = null,
) {
  await db.execute(sql`update weekly_report_jobs set status = ${status}, error = ${error}, provider_id = ${providerId},
    payload = null, lease_until = null, lease_token = null, updated_at = now()
    where id = ${job.id} and lease_token = ${job.lease_token} and status = 'processing'`)
}
async function release(job: Job, next: Date, error: string | null) {
  await db.execute(sql`update weekly_report_jobs set status = 'retryable_failure', error = ${error},
    lease_until = null, lease_token = null, next_attempt_at = ${next.toISOString()}::timestamptz, updated_at = now()
    where id = ${job.id} and lease_token = ${job.lease_token} and status = 'processing'`)
}

/** Cross-invocation rate reservation, never an unbounded in-memory queue. */
async function reserveSend(): Promise<number | null> {
  const result = await db.execute<{ wait_ms: number }>(sql`
    update weekly_report_throttle set next_allowed_at = greatest(next_allowed_at, now()) + interval '1 second'
    where id = 'resend' and next_allowed_at < now() + interval '5 seconds'
    returning greatest(0, extract(epoch from (next_allowed_at - interval '1 second' - now())) * 1000)::int as wait_ms`)
  return result.rows[0]?.wait_ms ?? null
}
async function prepare(
  job: Job,
  target: Recipient,
): Promise<SendEmailInput | null> {
  const report = await buildMemberReport({
    workspaceId: job.workspace_id,
    memberId: job.member_id,
    startDate: job.week_start,
    endDate: job.week_end,
    timezone: job.timezone,
  })
  if (!report.entries.length) return null
  const pdf = await buildWeeklyMemberReportPdf(report, target.workspace_name)
  if (pdf.byteLength > 10 * 1024 * 1024) throw new Error('attachment_too_large')
  const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL
  if (!appUrl) throw new Error('app_url_missing')
  // The message names the workspace because the active-workspace cookie may differ.
  const text = `${target.workspace_name}\nWeekly personal time report: ${job.week_start} to ${job.week_end}\nTimezone: ${job.timezone}\nTotal time: ${formatHms(report.summary.totalSeconds)}\nCompleted entries only. Running timers are excluded.\nManage weekly personal report emails: ${appUrl.replace(/\/$/, '')}/app/time-tracker\nSelect ${target.workspace_name}, then Weekly emails beside Export my time.`
  return {
    from: getResendFromAddress(),
    to: target.email,
    subject: `${target.workspace_name} — Weekly time report (${job.week_start} to ${job.week_end})`,
    text,
    html: `<p style="white-space:pre-line">${escapeHtml(text)}</p>`,
    attachments: [
      {
        filename: `weekly-time-report-${job.week_start}-to-${job.week_end}.pdf`,
        content: Buffer.from(pdf).toString('base64'),
        contentType: 'application/pdf',
      },
    ],
  }
}
async function processJob(job: Job, deadline: number): Promise<string> {
  let deliveryStarted = false
  try {
    if (!weeklyReportsEnabled()) {
      await release(job, new Date(Date.now() + 300000), null)
      return 'paused'
    }
    if (Date.now() - new Date(job.due_at).getTime() > 48 * 3600000) {
      await finish(job, 'skipped', 'report_expired')
      return 'skipped'
    }
    let target = await recipient(job)
    if (!target) {
      await finish(job, 'skipped', 'member_ineligible')
      return 'skipped'
    }
    if (
      job.attempts &&
      (!job.first_attempt_at ||
        !retryAllowed(job.attempts, new Date(job.first_attempt_at), new Date()))
    ) {
      await finish(job, 'terminal_failure', 'retry_window_exhausted')
      return 'terminal_failure'
    }
    const payload = job.payload ?? (await prepare(job, target))
    if (!payload) {
      await finish(job, 'skipped', 'empty_week')
      return 'skipped'
    }
    if (!job.payload) {
      const frozen =
        await db.execute(sql`update weekly_report_jobs set payload = ${JSON.stringify(payload)}::jsonb
        where id = ${job.id} and lease_token = ${job.lease_token} and status = 'processing' returning id`)
      if (!frozen.rows.length) return 'cancelled'
    }
    if (Date.now() > deadline - 18000) {
      await release(job, new Date(Date.now() + 300000), null)
      return 'deferred'
    }
    const waitMs = await reserveSend()
    if (waitMs === null) {
      await release(job, new Date(Date.now() + 60000), 'provider_throttled')
      return 'deferred'
    }
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
    target = await recipient(job)
    if (!target || target.email !== payload.to) {
      await finish(job, 'skipped', 'recipient_or_preference_changed')
      return 'skipped'
    }
    if (!weeklyReportsEnabled()) {
      await release(job, new Date(Date.now() + 300000), null)
      return 'paused'
    }
    const started = await db.execute<{
      attempts: number
      first_attempt_at: string
    }>(sql`
      update weekly_report_jobs set attempts = attempts + 1, first_attempt_at = coalesce(first_attempt_at, now())
      where id = ${job.id} and lease_token = ${job.lease_token} and status = 'processing'
        and lease_until > now()
        and exists (select 1 from workspace_members m join users u on u.id = m.user_id
          where m.id = ${job.member_id} and m.workspace_id = ${job.workspace_id}
            and m.status = 'ACTIVE' and m.weekly_report_email_enabled
            and m.weekly_report_enabled_at <= ${job.due_at}::timestamptz and u.email = ${payload.to})
        returning attempts, first_attempt_at`)
    if (!started.rows[0]) return 'cancelled'
    job.attempts = started.rows[0].attempts
    job.first_attempt_at = started.rows[0].first_attempt_at
    deliveryStarted = true
    const sent = await sendWeeklyReportEmail(payload, `weekly-report/${job.id}`)
    await finish(job, 'sent', null, sent.id)
    return 'sent'
  } catch (error) {
    if (error instanceof WeeklyEmailError) {
      if (error.outcome === 'retryable') {
        const next = new Date(
          Date.now() + retryDelayMs(job.attempts, error.retryAfterSeconds),
        )
        await db.execute(
          sql`update weekly_report_throttle set next_allowed_at = greatest(next_allowed_at, ${next.toISOString()}::timestamptz) where id = 'resend'`,
        )
        if (
          job.first_attempt_at &&
          retryAllowed(job.attempts, new Date(job.first_attempt_at), next)
        ) {
          await release(job, next, 'provider_rate_limited')
          return 'retryable_failure'
        }
      }
      const status =
        error.outcome === 'uncertain' ? 'uncertain' : 'terminal_failure'
      await finish(job, status, `provider_${error.outcome}`)
      return status
    }
    const status = deliveryStarted ? 'uncertain' : 'terminal_failure'
    await finish(
      job,
      status,
      deliveryStarted
        ? 'delivery_persistence_failed'
        : error instanceof Error &&
            ['attachment_too_large', 'app_url_missing'].includes(error.message)
          ? error.message
          : 'report_generation_failed',
    )
    return status
  }
}

export async function runWeeklyReports() {
  const start = Date.now()
  if (!weeklyReportsEnabled()) return { enabled: false }
  if (!process.env.RESEND_API_KEY)
    throw new Error('Weekly reports require RESEND_API_KEY')
  await db.execute(
    sql`insert into weekly_report_throttle (id) values ('resend') on conflict do nothing`,
  )
  await db.execute(sql`update weekly_report_jobs set status = case when attempts > 0 then 'uncertain' else 'pending' end,
    payload = case when attempts > 0 then null else payload end, error = 'worker_lease_expired',
    lease_until = null, lease_token = null, updated_at = now()
    where status = 'processing' and lease_until < now()`)
  await db.execute(sql`delete from weekly_report_jobs where id in (
    select id from weekly_report_jobs where status in ('sent', 'skipped', 'terminal_failure', 'uncertain')
      and updated_at < now() - interval '90 days' limit 500)`)
  await enqueue(start + 10000)
  let claimed = 0
  const outcomes: Record<string, number> = {}
  async function worker() {
    while (Date.now() < start + 20000 && claimed < 25) {
      claimed++
      const job = await claim()
      if (!job) return
      const outcome = await processJob(job, start + 40000)
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1
    }
  }
  await Promise.all([worker(), worker()])
  const metrics =
    await db.execute(sql`select count(*) filter (where status in ('pending', 'retryable_failure'))::int as pending,
    coalesce(extract(epoch from (now() - min(due_at) filter (where status in ('pending', 'retryable_failure')))), 0)::int as oldest_pending_seconds
    from weekly_report_jobs`)
  return {
    enabled: true,
    outcomes,
    queue: metrics.rows[0],
    durationMs: Date.now() - start,
    heartbeat: new Date().toISOString(),
  }
}

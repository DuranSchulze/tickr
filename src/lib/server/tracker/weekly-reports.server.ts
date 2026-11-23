import '@tanstack/react-start/server-only'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '#/db'
import {
  buildDepartmentReport,
  departmentReportRoster,
  departmentReportRosterIsCurrent,
} from './weekly-department-report.server'
import {
  buildWeeklyDepartmentPdf,
  weeklyDepartmentReportFilename,
} from '#/lib/time-tracker/weekly-department-report-export'
import { weeklyDepartmentReportPath } from '#/lib/time-tracker/weekly-department-report'
import type { DepartmentReportScope } from '#/lib/time-tracker/weekly-department-report'
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
import { reserveSend } from './resend-throttle.server'

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
  due_at: string
  attempts: number
  first_attempt_at: string | null
  lease_token: string
  payload: SendEmailInput | null
  attachment_roster: Record<string, string> | null
}
type Recipient = DepartmentReportScope & { email: string }

function eligibleRecipient(dueAt: ReturnType<typeof sql>) {
  return sql`m.status = 'ACTIVE' and m.weekly_report_email_enabled
    and m.weekly_report_enabled_at <= ${dueAt} and role.permission_level in ('OWNER', 'ADMIN')`
}

async function recipient(job: Job): Promise<Recipient | undefined> {
  const result = await db.execute<Recipient>(sql`
    select r.id, r.workspace_id, r.department_id, r.week_start::text, r.week_end::text,
      r.timezone, u.email, w.name as workspace_name, d.name as department_name
    from weekly_report_jobs j
    join weekly_department_reports r on r.id = j.report_id and r.workspace_id = j.workspace_id
    join departments d on d.id = r.department_id and d.workspace_id = r.workspace_id
    join workspace_members m on m.id = j.member_id and m.workspace_id = r.workspace_id
      and m.department_id = r.department_id
    join workspace_roles role on role.id = m.workspace_role_id and role.workspace_id = m.workspace_id
    join users u on u.id = m.user_id join workspaces w on w.id = r.workspace_id
    where j.id = ${job.id} and j.report_type = 'department' and r.expires_at > now()
      and ${eligibleRecipient(sql`j.due_at`)}
  `)
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
      ), eligible as (
        select m.id, m.department_id from locked s
        join workspace_members m on m.workspace_id = s.workspace_id
        join members page on page.id = m.id
        join users u on u.id = m.user_id
        join workspace_roles role on role.id = m.workspace_role_id and role.workspace_id = m.workspace_id
        join departments d on d.id = m.department_id and d.workspace_id = m.workspace_id
        where ${eligibleRecipient(sql`s.due_at`)} and s.due_at >= now() - interval '48 hours'
      ), reports as (
        insert into weekly_department_reports (workspace_id, department_id, week_start, week_end, timezone, due_at, expires_at)
        select s.workspace_id, dep.department_id, (s.due_at at time zone s.timezone)::date - 7,
          (s.due_at at time zone s.timezone)::date - 1, s.timezone, s.due_at, s.due_at + interval '90 days'
        from locked s cross join (select distinct department_id from eligible) dep
        on conflict (workspace_id, department_id, week_start)
          do update set due_at = weekly_department_reports.due_at
        returning id, workspace_id, department_id, week_start, week_end, timezone, due_at
      ), inserted as (
        insert into weekly_report_jobs (id, workspace_id, member_id, week_start, week_end, timezone, due_at, report_type, report_id)
        select 'dept:' || r.workspace_id || ':' || m.id || ':' || r.week_start::text,
          r.workspace_id, m.id, r.week_start, r.week_end, r.timezone, r.due_at, 'department', r.id
        from reports r join eligible m on m.department_id = r.department_id
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
      select id from weekly_report_jobs where report_type = 'department' and status in ('pending', 'retryable_failure')
        and next_attempt_at <= now() and ${scopeFilter(sql`workspace_id`)}
      order by due_at, id for update skip locked limit 1
    ) update weekly_report_jobs j set status = 'processing', lease_until = now() + interval '2 minutes',
      lease_token = ${token}, attempt_started_in_lease = false, updated_at = now() from candidate c where j.id = c.id returning j.*`)
  return result.rows[0]
}
async function finish(
  job: Job,
  status: string,
  error: string | null = null,
  providerId: string | null = null,
) {
  await db.execute(sql`update weekly_report_jobs set status = ${status}, error = ${error}, provider_id = ${providerId},
    payload = null, attachment_roster = null, attempt_started_in_lease = false, lease_until = null, lease_token = null, updated_at = now()
    where id = ${job.id} and lease_token = ${job.lease_token} and status = 'processing'`)
}
async function release(job: Job, next: Date, error: string | null) {
  await db.execute(sql`update weekly_report_jobs set status = 'retryable_failure', error = ${error},
    lease_until = null, lease_token = null, attempt_started_in_lease = false, next_attempt_at = ${next.toISOString()}::timestamptz, updated_at = now()
    where id = ${job.id} and lease_token = ${job.lease_token} and status = 'processing'`)
}

const attachmentBudget = 10 * 1024 * 1024
const maxAttachmentMembers = 100

async function prepare(target: Recipient, deadline: number) {
  const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL
  if (!appUrl) throw new Error('app_url_missing')
  const link = new URL(weeklyDepartmentReportPath(target.id), appUrl).href
  const period = `${target.week_start} to ${target.week_end}`
  let attachments: SendEmailInput['attachments']
  let roster: Record<string, string> | null = null
  // Leave time for the provider call and avoid entering an unbounded PDF render.
  if (Date.now() < deadline - 25_000) {
    try {
      const rows = await buildDepartmentReport(target, maxAttachmentMembers)
      if (rows && Date.now() < deadline - 22_000) {
        const pdf = await buildWeeklyDepartmentPdf(target, rows)
        if (
          pdf.byteLength <= attachmentBudget &&
          Date.now() < deadline - 19_000
        ) {
          attachments = [
            {
              filename: weeklyDepartmentReportFilename(target, 'pdf'),
              content: Buffer.from(pdf).toString('base64'),
              contentType: 'application/pdf',
            },
          ]
          roster = departmentReportRoster(rows)
        }
      }
    } catch {
      // The signed-in report remains available when the optional PDF fails.
    }
  }
  const heading = `${target.workspace_name} — ${target.department_name}`
  const note = attachments
    ? 'The PDF is attached. Download the Excel or PDF version in Trackly.'
    : 'Sign in to Trackly to download the PDF or Excel version.'
  const text = `${heading}\nWeekly department report: ${period} (${target.timezone})\n${note}\n${link}`
  const payload: SendEmailInput = {
    from: getResendFromAddress(),
    to: target.email,
    subject: `${heading} — Weekly department report (${period})`,
    text,
    html: `<p>${escapeHtml(heading)}<br>Weekly department report: ${escapeHtml(period)} (${escapeHtml(target.timezone)})</p>
      <p>${escapeHtml(note)} <a href="${escapeHtml(link)}">Open weekly report</a></p>`,
    ...(attachments ? { attachments } : {}),
  }
  return { payload, roster }
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
    const { payload, roster } = job.payload
      ? { payload: job.payload, roster: job.attachment_roster }
      : await prepare(target, deadline)
    if (!job.payload) {
      const frozen = await db.execute(sql`update weekly_report_jobs
        set payload = ${JSON.stringify(payload)}::jsonb, attachment_roster = ${roster ? JSON.stringify(roster) : null}::jsonb
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
      update weekly_report_jobs j
      set attempts = attempts + 1, first_attempt_at = coalesce(first_attempt_at, now()), attempt_started_in_lease = true
      where j.id = ${job.id} and j.lease_token = ${job.lease_token} and j.status = 'processing'
        and j.lease_until > now() and j.report_type = 'department'
        and exists (
          select 1 from weekly_department_reports r
          join departments d on d.id = r.department_id and d.workspace_id = r.workspace_id
          join workspace_members m on m.id = j.member_id and m.workspace_id = r.workspace_id
            and m.department_id = r.department_id
          join workspace_roles role on role.id = m.workspace_role_id and role.workspace_id = m.workspace_id
          join users u on u.id = m.user_id
          where r.id = j.report_id and r.workspace_id = j.workspace_id and r.expires_at > now()
            and u.email = ${payload.to} and ${eligibleRecipient(sql`j.due_at`)}
        )
        and ${roster ? departmentReportRosterIsCurrent(job.workspace_id, target.department_id, roster) : sql`true`}
        returning attempts, first_attempt_at`)
    if (!started.rows[0]) {
      await finish(job, 'skipped', 'recipient_or_roster_changed')
      return 'cancelled'
    }
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
        : error instanceof Error && error.message === 'app_url_missing'
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
  await db.execute(sql`update weekly_report_jobs set status = case when attempt_started_in_lease then 'uncertain' else 'pending' end,
    payload = case when attempt_started_in_lease then null else payload end,
    attachment_roster = case when attempt_started_in_lease then null else attachment_roster end,
    attempt_started_in_lease = false, error = 'worker_lease_expired',
    lease_until = null, lease_token = null, updated_at = now()
    where report_type = 'department' and status = 'processing' and lease_until < now()`)
  await db.execute(sql`delete from weekly_report_jobs where id in (
    select id from weekly_report_jobs where status in ('sent', 'skipped', 'terminal_failure', 'uncertain')
      and updated_at < now() - interval '90 days' limit 500)`)
  await db.execute(sql`delete from weekly_department_reports where id in (
    select id from weekly_department_reports where expires_at <= now() order by expires_at limit 500)`)
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

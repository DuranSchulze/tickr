import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { db } from '#/db'
import type { RolePermission } from '#/db/schema'
import { hasPermission } from '#/lib/rbac/permissions'
import {
  dailyEmailKey,
  duePhases,
  formatHoursMinutes,
  isFlagged,
  readDailyReportConfig,
} from '#/lib/time-tracker/daily-report'
import type {
  DailyPhase,
  DailyReportConfig,
} from '#/lib/time-tracker/daily-report'
import {
  buildDailyReportPdf,
  dailyReportFilename,
} from '#/lib/time-tracker/daily-report-export'
import type { DailyReportDataset } from '#/lib/time-tracker/daily-report-export'
import { dailyReportPagePath } from '#/lib/time-tracker/daily-report-link'
import type { DailyReportScope } from '#/lib/time-tracker/daily-report-link'
import { normalizeWeekStart } from '#/lib/time-tracker/timesheet'
import { signDailyReportLink } from '../daily-report-link.server'
import {
  renderAttendanceDigestEmail,
  renderDailyMemberReportEmail,
  renderDepartmentDigestEmail,
  renderShiftNudgeEmail,
} from '../email-templates/daily-report'
import type {
  DailyDownload,
  DailyMemberLine,
} from '../email-templates/daily-report'
import type { RenderedEmail } from '../email-templates/layout'
import {
  getResendFromAddress,
  sendWeeklyReportEmail,
  WeeklyEmailError,
} from '../mailer'
import type { SendEmailInput } from '../mailer'
import { createAuditLog } from './audit/audit-logger.server'
import {
  dateLabel,
  entryProject,
  evaluateMembers,
  loadEntries,
  loadMemberDays,
  loadWorkspaces,
  membersInScope,
  minimumFor,
  NO_DEPARTMENT,
  timeLabel,
  toDataset,
} from './daily-report-data.server'
import type {
  DailyWorkspace,
  EvaluatedMember,
} from './daily-report-data.server'
import {
  deferResendUntil,
  ensureResendThrottle,
  reserveSend,
} from './resend-throttle.server'

/** Stop starting new sends after this long; later cron ticks pick up the rest. */
const RUN_BUDGET_MS = 25_000
/** Skip building a PDF this close to the budget; the email still links to downloads. */
const ATTACHMENT_HEADROOM_MS = 8_000
const MAX_ENTRY_LINES = 40

type DigestRecipient = {
  id: string
  email: string
  name: string
  permission_level: RolePermission
  permission_overrides: unknown
}

type ReportRef = {
  scope: DailyReportScope
  targetId: string
  date: string
  dataset: () => DailyReportDataset
}

type Job = {
  key: string
  email: string
  targetType: 'member' | 'department' | 'workspace' | 'mailbox'
  targetId: string | null
  /** The report this email links to and may attach; absent for reminders. */
  report?: ReportRef
  render: (download: DailyDownload | null) => RenderedEmail
}

type RunContext = {
  appUrl: string
  config: DailyReportConfig
  deadline: number
  /** Per-run caches so a department PDF and link are built once for all its Admins. */
  links: Map<string, Promise<string>>
  pdfs: Map<string, Promise<Uint8Array | null>>
}

type DailyReportRunResult =
  | { enabled: false }
  | {
      enabled: true
      workspaces: number
      due: number
      sent: number
      attached: number
      alreadySent: number
      failed: number
      deferred: number
      errors: string[]
      durationMs: number
    }

function getAppUrl() {
  const url = process.env.APP_URL ?? process.env.BETTER_AUTH_URL
  if (!url) throw new Error('Daily reports require APP_URL or BETTER_AUTH_URL')
  return url.replace(/\/$/, '')
}

function timesheetUrl(appUrl: string, date: string, departmentId?: string) {
  const url = new URL('/app/timesheet', appUrl)
  url.searchParams.set('weekStart', normalizeWeekStart(date))
  if (departmentId) url.searchParams.set('departmentId', departmentId)
  return url.href
}

/** Members whose role grants the workspace-wide report, plus HR mailboxes. */
async function loadWorkspaceRecipients(
  workspaceId: string,
  config: DailyReportConfig,
) {
  const { rows } = await db.execute<DigestRecipient>(sql`
    select m.id, m.email, coalesce(nullif(u.name, ''), m.email) as name,
      role.permission_level, role.permission_overrides
    from workspace_members m
    join workspace_roles role on role.id = m.workspace_role_id and role.workspace_id = m.workspace_id
    left join users u on u.id = m.user_id
    where m.workspace_id = ${workspaceId} and m.status = 'ACTIVE' and m.user_id is not null
    order by m.id
  `)
  const recipients: Array<{
    key: string
    email: string
    name: string
    memberId: string | null
  }> = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (
      !hasPermission(
        row.permission_level,
        row.permission_overrides,
        'reports.daily_digest',
      )
    )
      continue
    const email = row.email.toLowerCase()
    if (seen.has(email)) continue
    seen.add(email)
    recipients.push({
      key: row.id,
      email: row.email,
      name: row.name,
      memberId: row.id,
    })
  }
  for (const email of config.hrEmails) {
    if (seen.has(email)) continue
    seen.add(email)
    recipients.push({
      key: `mailbox:${email}`,
      email,
      name: 'HR',
      memberId: null,
    })
  }
  return recipients
}

function toLine(row: EvaluatedMember, timeZone: string): DailyMemberLine {
  return {
    name: row.name,
    department: row.department_name ?? NO_DEPARTMENT,
    timeIn: timeLabel(row.time_in, timeZone),
    timeOut: timeLabel(row.time_out, timeZone),
    worked: formatHoursMinutes(row.worked_seconds),
    billable: formatHoursMinutes(row.billable_seconds),
    entries: row.entry_count,
    status: row.status,
    running: row.running_count > 0,
  }
}

async function buildReportJobs(
  workspace: DailyWorkspace,
  date: string,
  config: DailyReportConfig,
  appUrl: string,
): Promise<Job[]> {
  const { kind, minimumSeconds } = minimumFor(workspace, date, config)
  const [rows, entries, workspaceRecipients] = await Promise.all([
    loadMemberDays(workspace, date),
    loadEntries(workspace, date),
    loadWorkspaceRecipients(workspace.id, config),
  ])
  const members = evaluateMembers(rows, date, minimumSeconds, config.holidays)
  const label = dateLabel(date)
  const tz = workspace.timezone
  const jobs: Job[] = []

  const reportRef = (
    scope: DailyReportScope,
    targetId: string,
    title: string,
  ): ReportRef => ({
    scope,
    targetId,
    date,
    dataset: () =>
      toDataset({
        workspace,
        date,
        scope,
        title,
        minimumSeconds,
        members: membersInScope(members, scope, targetId),
        entries,
      }),
  })

  for (const member of members) {
    const remind = member.remindable && isFlagged(member.status)
    if (member.entry_count === 0 && member.running_count === 0 && !remind)
      continue
    const memberEntries = entries.get(member.id) ?? []
    jobs.push({
      key: dailyEmailKey({ kind: 'member_report', date, recipient: member.id }),
      email: member.email,
      targetType: 'member',
      targetId: member.id,
      report: reportRef('member', member.id, member.name),
      render: (download) =>
        renderDailyMemberReportEmail({
          memberName: member.name,
          workspaceName: workspace.name,
          dateLabel: label,
          dayKind: kind,
          status: member.status,
          remind,
          worked: formatHoursMinutes(member.worked_seconds),
          billable: formatHoursMinutes(member.billable_seconds),
          minimum: formatHoursMinutes(member.minimum_seconds),
          missing: formatHoursMinutes(
            member.minimum_seconds - member.worked_seconds,
          ),
          timeIn: timeLabel(member.time_in, tz),
          timeOut: timeLabel(member.time_out, tz),
          entries: memberEntries.slice(0, MAX_ENTRY_LINES).map((entry) => ({
            timeRange: `${timeLabel(entry.clip_start, tz)}–${timeLabel(entry.clip_end, tz)}`,
            description: entry.description,
            project: entryProject(entry),
            duration: formatHoursMinutes(entry.seconds),
            billable: entry.billable,
          })),
          hiddenEntries: Math.max(0, memberEntries.length - MAX_ENTRY_LINES),
          runningCount: member.running_count,
          timesheetUrl: timesheetUrl(appUrl, date),
          download: download ?? {
            url: timesheetUrl(appUrl, date),
            attached: false,
          },
        }),
    })
  }

  const departments = new Map<string, string>()
  for (const member of members) {
    if (member.department_id && member.department_name)
      departments.set(member.department_id, member.department_name)
  }
  for (const [departmentId, departmentName] of departments) {
    const lines = membersInScope(members, 'department', departmentId).map(
      (member) => toLine(member, tz),
    )
    if (lines.length === 0) continue
    const admins = members.filter(
      (member) =>
        member.department_id === departmentId &&
        member.permission_level === 'ADMIN',
    )
    const report = reportRef('department', departmentId, departmentName)
    for (const admin of admins) {
      jobs.push({
        key: dailyEmailKey({
          kind: 'department_digest',
          date,
          recipient: `${departmentId}.${admin.id}`,
        }),
        email: admin.email,
        targetType: 'department',
        targetId: departmentId,
        report,
        render: (download) =>
          renderDepartmentDigestEmail({
            recipientName: admin.name,
            workspaceName: workspace.name,
            departmentName,
            dateLabel: label,
            lines,
            timesheetUrl: timesheetUrl(appUrl, date, departmentId),
            download: download ?? {
              url: timesheetUrl(appUrl, date, departmentId),
              attached: false,
            },
          }),
      })
    }
  }

  const listed = membersInScope(members, 'workspace', workspace.id)
  if (listed.length > 0) {
    const lines = listed.map((member) => toLine(member, tz))
    const report = reportRef('workspace', workspace.id, 'All departments')
    for (const recipient of workspaceRecipients) {
      jobs.push({
        key: dailyEmailKey({
          kind: 'workspace_digest',
          date,
          recipient: recipient.key,
        }),
        email: recipient.email,
        targetType: recipient.memberId ? 'member' : 'mailbox',
        targetId: recipient.memberId,
        report,
        render: (download) =>
          renderAttendanceDigestEmail({
            recipientName: recipient.name,
            workspaceName: workspace.name,
            dateLabel: label,
            lines,
            timesheetUrl: timesheetUrl(appUrl, date),
            download: download ?? {
              url: timesheetUrl(appUrl, date),
              attached: false,
            },
          }),
      })
    }
  }

  return jobs
}

async function buildNudgeJobs(
  workspace: DailyWorkspace,
  date: string,
  config: DailyReportConfig,
  appUrl: string,
): Promise<Job[]> {
  const { kind, minimumSeconds } = minimumFor(workspace, date, config)
  if (kind !== 'weekday') return []
  const members = evaluateMembers(
    await loadMemberDays(workspace, date),
    date,
    minimumSeconds,
    config.holidays,
  )
  const label = dateLabel(date)
  return members
    .filter(
      (member) =>
        member.remindable &&
        member.running_count === 0 &&
        isFlagged(member.status),
    )
    .map((member) => ({
      key: dailyEmailKey({ kind: 'shift_nudge', date, recipient: member.id }),
      email: member.email,
      targetType: 'member' as const,
      targetId: member.id,
      render: () =>
        renderShiftNudgeEmail({
          memberName: member.name,
          workspaceName: workspace.name,
          dateLabel: label,
          worked: formatHoursMinutes(member.worked_seconds),
          minimum: formatHoursMinutes(member.minimum_seconds),
          missing: formatHoursMinutes(
            member.minimum_seconds - member.worked_seconds,
          ),
          timesheetUrl: timesheetUrl(appUrl, date),
        }),
    }))
}

function buildJobs(
  workspace: DailyWorkspace,
  phase: DailyPhase,
  config: DailyReportConfig,
  appUrl: string,
) {
  return phase.kind === 'report'
    ? buildReportJobs(workspace, phase.date, config, appUrl)
    : buildNudgeJobs(workspace, phase.date, config, appUrl)
}

/** Keys already sent (or permanently failed) for this workspace, from the audit log. */
async function deliveredKeys(workspaceId: string) {
  const { rows } = await db.execute<{ details: string }>(sql`
    select details from audit_logs
    where workspace_id = ${workspaceId}
      and action in ('DAILY_REPORT_EMAIL', 'DAILY_REPORT_EMAIL_FAILED')
      and created_at > now() - interval '3 days'
      and details like 'daily:%'
  `)
  return new Set(rows.map((row) => row.details.split(' ')[0]))
}

function cached<T>(
  map: Map<string, Promise<T>>,
  key: string,
  make: () => Promise<T>,
) {
  let value = map.get(key)
  if (!value) {
    value = make()
    map.set(key, value)
  }
  return value
}

/**
 * Link to the signed-in download page, plus the PDF when it fits the
 * attachment budget. When the PDF is too big, could not be built, or the run
 * is short on time, the email carries only the link.
 */
async function prepareDownload(
  workspaceId: string,
  report: ReportRef,
  ctx: RunContext,
) {
  const reportKey = `${report.scope}:${report.targetId}:${report.date}`
  const token = await cached(ctx.links, reportKey, () =>
    signDailyReportLink({
      workspaceId,
      scope: report.scope,
      targetId: report.targetId,
      date: report.date,
    }),
  )
  const download: DailyDownload = {
    url: `${ctx.appUrl}${dailyReportPagePath(token)}`,
    attached: false,
  }
  let attachments: SendEmailInput['attachments']
  if (
    ctx.config.attachmentMaxBytes > 0 &&
    Date.now() < ctx.deadline - ATTACHMENT_HEADROOM_MS
  ) {
    const dataset = report.dataset()
    const pdf = await cached(ctx.pdfs, reportKey, () =>
      buildDailyReportPdf(dataset).catch((error: unknown) => {
        console.error(`[daily-reports] PDF failed for ${reportKey}`, error)
        return null
      }),
    )
    if (pdf && pdf.byteLength <= ctx.config.attachmentMaxBytes) {
      attachments = [
        {
          filename: dailyReportFilename(dataset, 'pdf'),
          content: Buffer.from(pdf).toString('base64'),
          contentType: 'application/pdf',
        },
      ]
      download.attached = true
    }
  }
  return { download, attachments }
}

type DeliveryOutcome =
  | 'sent'
  | 'sent_with_pdf'
  | 'failed'
  | 'uncertain'
  | 'rate_limited'

async function deliver(
  workspaceId: string,
  job: Job,
  ctx: RunContext,
): Promise<DeliveryOutcome> {
  const record = (
    action: 'DAILY_REPORT_EMAIL' | 'DAILY_REPORT_EMAIL_FAILED',
    note?: string,
  ) =>
    createAuditLog({
      workspaceId,
      actorEmail: 'system',
      action,
      targetType: job.targetType,
      targetId: job.targetId,
      details: note ? `${job.key} ${note}` : job.key,
    })

  let payload: SendEmailInput
  try {
    const prepared = job.report
      ? await prepareDownload(workspaceId, job.report, ctx)
      : null
    payload = {
      from: getResendFromAddress(),
      to: job.email,
      ...job.render(prepared?.download ?? null),
      ...(prepared?.attachments ? { attachments: prepared.attachments } : {}),
    }
  } catch (error) {
    console.error(`[daily-reports] Could not prepare ${job.key}`, error)
    await record('DAILY_REPORT_EMAIL_FAILED', 'render_failed')
    return 'failed'
  }
  const withPdf = Boolean(payload.attachments?.length)

  try {
    // The idempotency key makes a retry after an uncertain attempt safe.
    await sendWeeklyReportEmail(payload, `${workspaceId}/${job.key}`)
    await record('DAILY_REPORT_EMAIL', withPdf ? 'pdf_attached' : 'link_only')
    return withPdf ? 'sent_with_pdf' : 'sent'
  } catch (error) {
    if (!(error instanceof WeeklyEmailError)) {
      console.error(`[daily-reports] Unexpected failure for ${job.key}`, error)
      return 'uncertain'
    }
    if (error.status === 409) {
      // Resend already accepted this key (an earlier attempt, or one in flight).
      await record('DAILY_REPORT_EMAIL', 'already_accepted')
      return 'sent'
    }
    if (error.outcome === 'retryable') {
      await deferResendUntil(
        new Date(Date.now() + Math.max(1, error.retryAfterSeconds) * 1000),
      )
      return 'rate_limited'
    }
    if (error.outcome === 'uncertain') return 'uncertain'
    await record(
      'DAILY_REPORT_EMAIL_FAILED',
      `provider_${error.status ?? 'error'}`,
    )
    return 'failed'
  }
}

/**
 * Nightly daily reports and the end-of-shift nudge. Safe to call on every
 * cron tick: it only acts inside each workspace's local delivery windows and
 * skips anything the audit-log ledger already records.
 */
export async function runDailyReports(
  now = new Date(),
): Promise<DailyReportRunResult> {
  const startedAt = Date.now()
  const config = readDailyReportConfig(process.env)
  if (!config.enabled) return { enabled: false }
  if (!process.env.RESEND_API_KEY)
    throw new Error('Daily reports require RESEND_API_KEY')
  if (!process.env.BETTER_AUTH_SECRET)
    throw new Error('Daily reports require BETTER_AUTH_SECRET for report links')
  const ctx: RunContext = {
    appUrl: getAppUrl(),
    config,
    deadline: startedAt + RUN_BUDGET_MS,
    links: new Map(),
    pdfs: new Map(),
  }

  const result = {
    enabled: true as const,
    workspaces: 0,
    due: 0,
    sent: 0,
    attached: 0,
    alreadySent: 0,
    failed: 0,
    deferred: 0,
    errors: [] as string[],
    durationMs: 0,
  }
  let throttleReady = false
  let stopped = false

  for (const workspace of await loadWorkspaces(config.workspaceIds)) {
    if (stopped) break
    let phases: DailyPhase[]
    try {
      phases = duePhases(now, workspace.timezone, config)
    } catch {
      result.errors.push(`${workspace.id}: invalid timezone`)
      continue
    }
    if (phases.length === 0) continue
    result.workspaces++

    let pending: Job[]
    try {
      const delivered = await deliveredKeys(workspace.id)
      const jobs = (
        await Promise.all(
          phases.map((phase) =>
            buildJobs(workspace, phase, config, ctx.appUrl),
          ),
        )
      ).flat()
      pending = jobs.filter((job) => !delivered.has(job.key))
      result.alreadySent += jobs.length - pending.length
      result.due += pending.length
    } catch (error) {
      console.error(`[daily-reports] Could not prepare ${workspace.id}`, error)
      result.errors.push(`${workspace.id}: preparation failed`)
      continue
    }

    for (const [index, job] of pending.entries()) {
      if (stopped || Date.now() > ctx.deadline) {
        result.deferred += pending.length - index
        stopped = true
        break
      }
      if (!throttleReady) {
        await ensureResendThrottle()
        throttleReady = true
      }
      const waitMs = await reserveSend()
      if (waitMs === null) {
        result.deferred += pending.length - index
        stopped = true
        break
      }
      if (waitMs > 0)
        await new Promise((resolve) => setTimeout(resolve, waitMs))
      const outcome = await deliver(workspace.id, job, ctx)
      if (outcome === 'sent' || outcome === 'sent_with_pdf') {
        result.sent++
        if (outcome === 'sent_with_pdf') result.attached++
      } else if (outcome === 'failed') result.failed++
      else {
        result.deferred++
        if (outcome === 'rate_limited') {
          result.deferred += pending.length - index - 1
          stopped = true
          break
        }
      }
    }
  }

  result.durationMs = Date.now() - startedAt
  return result
}

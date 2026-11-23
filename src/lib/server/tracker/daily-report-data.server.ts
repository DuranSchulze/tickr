import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import type { SQLWrapper } from 'drizzle-orm'
import { db } from '#/db'
import type { RolePermission } from '#/db/schema'
import {
  ACTIVE_TRACKER_LOOKBACK_DAYS,
  classifyDay,
  formatHoursMinutes,
  getDayKind,
  memberMinimumSeconds,
  minimumSecondsFor,
} from '#/lib/time-tracker/daily-report'
import type {
  DailyReportConfig,
  DailyStatus,
} from '#/lib/time-tracker/daily-report'
import type { DailyReportDataset } from '#/lib/time-tracker/daily-report-export'
import type { DailyReportScope } from '#/lib/time-tracker/daily-report-link'
import { addDateKeyDays } from '#/lib/time-tracker/timesheet'
import { getWorkspaceDateRange } from './shared/dates'

export const NO_DEPARTMENT = 'No department'

export type DailyWorkspace = {
  id: string
  name: string
  timezone: string
  expected_daily_hours: string
}

type MemberDay = {
  id: string
  name: string
  email: string
  department_id: string | null
  department_name: string | null
  permission_level: RolePermission | null
  tracks_time: boolean
  confirmed: boolean
  on_leave: boolean
  saturday_worker: boolean
  worked_seconds: number
  billable_seconds: number
  entry_count: number
  time_in: string | null
  time_out: string | null
  running_count: number
}

export type EntryRow = {
  member_id: string
  description: string
  billable: boolean
  clip_start: string
  clip_end: string
  seconds: number
  project_name: string | null
  client_name: string | null
  task_name: string | null
}

export type EvaluatedMember = MemberDay & {
  status: DailyStatus
  /** This member's minimum for the day; 0 on a Saturday they do not work. */
  minimum_seconds: number
  /** Tracks time and is not an Owner: eligible for short-hours reminders. */
  remindable: boolean
  /** Shown in department and workspace reports: expected to work, or did. */
  listed: boolean
}

export function dateLabel(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00.000Z`))
}

export function timeLabel(value: string | null, timeZone: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function dayBounds(date: string, timeZone: string) {
  const { start, endExclusive } = getWorkspaceDateRange(
    { startDate: date, endDate: date },
    timeZone,
  )
  return { start: start.toISOString(), end: endExclusive.toISOString() }
}

export function minimumFor(
  workspace: DailyWorkspace,
  date: string,
  config: Pick<
    DailyReportConfig,
    'breakAllowanceHours' | 'saturdayMinimumHours' | 'holidays'
  >,
) {
  const kind = getDayKind(date, config.holidays)
  return {
    kind,
    minimumSeconds: minimumSecondsFor(
      kind,
      config,
      Number(workspace.expected_daily_hours) || 8,
    ),
  }
}

export async function loadWorkspaces(ids: string[]) {
  const { rows } = await db.execute<DailyWorkspace>(sql`
    select id, name, timezone, expected_daily_hours::text
    from workspaces
    where ${
      ids.length
        ? sql`id in (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `,
          )})`
        : sql`true`
    }
    order by id
  `)
  return rows
}

/** Audit actions that record a member's own answer to "were you on leave?". */
export const LEAVE_DECLARED = 'DAY_LEAVE_DECLARED'
export const LEAVE_WITHDRAWN = 'DAY_LEAVE_WITHDRAWN'

export function leaveDetails(date: string) {
  return `leave:${date}`
}

/** Latest leave answer for a member and date; withdrawing reverses it. */
function onLeaveSql(
  memberId: SQLWrapper,
  workspaceId: SQLWrapper,
  date: string,
) {
  return sql`coalesce((
    select a.action = ${LEAVE_DECLARED} from audit_logs a
    where a.workspace_id = ${workspaceId} and a.target_type = 'member'
      and a.target_id = ${memberId}
      and a.action in (${LEAVE_DECLARED}, ${LEAVE_WITHDRAWN})
      and a.details = ${leaveDetails(date)}
    order by a.created_at desc, a.id desc limit 1
  ), false)`
}

function isSaturday(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay() === 6
}

/** Any time entry, finished or running, overlapping the given local day. */
function workedOnDaySql(
  memberId: SQLWrapper,
  workspaceId: SQLWrapper,
  bounds: { start: string; end: string },
) {
  return sql`exists (
    select 1 from time_entries s
    where s.workspace_id = ${workspaceId} and s.workspace_member_id = ${memberId}
      and s.started_at < ${bounds.end}::timestamptz
      and (s.ended_at is null or s.ended_at > ${bounds.start}::timestamptz)
  )`
}

/** Whether the member logged time on the Saturday before `saturday`. */
export async function workedPreviousSaturday(
  workspace: DailyWorkspace,
  memberId: string,
  saturday: string,
) {
  const { rows } = await db.execute<{ worked: boolean }>(sql`
    select ${workedOnDaySql(sql`${memberId}`, sql`${workspace.id}`, dayBounds(addDateKeyDays(saturday, -7), workspace.timezone))} as worked
  `)
  return rows.at(0)?.worked ?? false
}

/** Completed work clipped to the local day; running timers are counted, not summed. */
export async function loadMemberDays(
  workspace: DailyWorkspace,
  date: string,
  memberId?: string,
) {
  const { start, end } = dayBounds(date, workspace.timezone)
  const lookback = new Date(
    new Date(start).getTime() - ACTIVE_TRACKER_LOOKBACK_DAYS * 86_400_000,
  ).toISOString()
  const saturdayWorker = isSaturday(date)
    ? workedOnDaySql(
        sql`m.id`,
        sql`m.workspace_id`,
        dayBounds(addDateKeyDays(date, -7), workspace.timezone),
      )
    : sql`true`
  const clipped = sql`extract(epoch from least(t.ended_at, ${end}::timestamptz) - greatest(t.started_at, ${start}::timestamptz))`
  const { rows } = await db.execute<MemberDay>(sql`
    select m.id, coalesce(nullif(u.name, ''), m.email) as name, m.email,
      m.department_id, d.name as department_name, role.permission_level,
      exists (
        select 1 from time_entries r
        where r.workspace_id = m.workspace_id and r.workspace_member_id = m.id
          and r.started_at >= ${lookback}::timestamptz and r.started_at < ${end}::timestamptz
      ) as tracks_time,
      exists (
        select 1 from weekday_confirmations c
        where c.workspace_id = m.workspace_id and c.member_id = m.id and c.local_date = ${date}::date
      ) as confirmed,
      ${onLeaveSql(sql`m.id`, sql`m.workspace_id`, date)} as on_leave,
      ${saturdayWorker} as saturday_worker,
      a.worked_seconds, a.billable_seconds, a.entry_count,
      a.time_in::text as time_in, a.time_out::text as time_out, a.running_count
    from workspace_members m
    left join users u on u.id = m.user_id
    left join departments d on d.id = m.department_id and d.workspace_id = m.workspace_id
    left join workspace_roles role on role.id = m.workspace_role_id and role.workspace_id = m.workspace_id
    cross join lateral (
      select
        coalesce(floor(sum(${clipped}) filter (where t.ended_at is not null)), 0)::int as worked_seconds,
        coalesce(floor(sum(${clipped}) filter (where t.ended_at is not null and t.billable)), 0)::int as billable_seconds,
        (count(*) filter (where t.ended_at is not null))::int as entry_count,
        min(greatest(t.started_at, ${start}::timestamptz)) filter (where t.ended_at is not null) as time_in,
        max(least(t.ended_at, ${end}::timestamptz)) filter (where t.ended_at is not null) as time_out,
        (count(*) filter (where t.ended_at is null))::int as running_count
      from time_entries t
      where t.workspace_id = m.workspace_id and t.workspace_member_id = m.id
        and t.started_at < ${end}::timestamptz
        and (t.ended_at is null or t.ended_at > ${start}::timestamptz)
    ) a
    where m.workspace_id = ${workspace.id} and m.status = 'ACTIVE'
      and m.user_id is not null and m.created_at < ${end}::timestamptz
      ${memberId ? sql`and m.id = ${memberId}` : sql``}
    order by d.name nulls last, coalesce(nullif(u.name, ''), m.email), m.id
  `)
  return rows
}

export async function loadEntries(
  workspace: DailyWorkspace,
  date: string,
  memberId?: string,
) {
  const { start, end } = dayBounds(date, workspace.timezone)
  const { rows } = await db.execute<EntryRow>(sql`
    select t.workspace_member_id as member_id, t.description, t.billable,
      greatest(t.started_at, ${start}::timestamptz)::text as clip_start,
      least(t.ended_at, ${end}::timestamptz)::text as clip_end,
      floor(extract(epoch from least(t.ended_at, ${end}::timestamptz) - greatest(t.started_at, ${start}::timestamptz)))::int as seconds,
      p.name as project_name, c.name as client_name, k.name as task_name
    from time_entries t
    left join projects p on p.id = t.project_id and p.workspace_id = t.workspace_id
    left join clients c on c.id = p.client_id
    left join project_tasks k on k.id = t.task_id
    where t.workspace_id = ${workspace.id} and t.ended_at is not null
      and t.started_at < ${end}::timestamptz and t.ended_at > ${start}::timestamptz
      ${memberId ? sql`and t.workspace_member_id = ${memberId}` : sql``}
    order by t.workspace_member_id, t.started_at, t.id
  `)
  const byMember = new Map<string, EntryRow[]>()
  for (const row of rows) {
    const list = byMember.get(row.member_id) ?? []
    list.push(row)
    byMember.set(row.member_id, list)
  }
  return byMember
}

export function evaluateMembers(
  rows: MemberDay[],
  date: string,
  dayMinimumSeconds: number,
  holidays: Set<string>,
): EvaluatedMember[] {
  const kind = getDayKind(date, holidays)
  return rows.map((row) => {
    const minimumSeconds = memberMinimumSeconds(
      kind,
      dayMinimumSeconds,
      row.saturday_worker,
    )
    return {
      ...row,
      minimum_seconds: minimumSeconds,
      status: classifyDay({
        workedSeconds: row.worked_seconds,
        minimumSeconds,
        confirmedNotWorking: row.confirmed,
        onLeave: row.on_leave,
      }),
      remindable: row.tracks_time && row.permission_level !== 'OWNER',
      listed:
        (row.tracks_time && minimumSeconds > 0) ||
        row.entry_count > 0 ||
        row.running_count > 0,
    }
  })
}

export function entryProject(entry: EntryRow) {
  return [entry.client_name, entry.project_name, entry.task_name]
    .filter(Boolean)
    .join(' / ')
}

/** Members a scope covers. Member scope always includes that member. */
export function membersInScope(
  members: EvaluatedMember[],
  scope: DailyReportScope,
  targetId: string,
) {
  if (scope === 'member') return members.filter((m) => m.id === targetId)
  const listed = members.filter((m) => m.listed)
  return scope === 'department'
    ? listed.filter((m) => m.department_id === targetId)
    : listed
}

export function toDataset(input: {
  workspace: DailyWorkspace
  date: string
  scope: DailyReportScope
  title: string
  minimumSeconds: number
  members: EvaluatedMember[]
  entries: Map<string, EntryRow[]>
}): DailyReportDataset {
  const tz = input.workspace.timezone
  return {
    scope: input.scope,
    workspaceName: input.workspace.name,
    title: input.title,
    date: input.date,
    dateLabel: dateLabel(input.date),
    timezone: tz,
    minimum: formatHoursMinutes(input.minimumSeconds),
    members: input.members.map((member) => ({
      name: member.name,
      department: member.department_name ?? NO_DEPARTMENT,
      timeIn: timeLabel(member.time_in, tz),
      timeOut: timeLabel(member.time_out, tz),
      workedSeconds: member.worked_seconds,
      billableSeconds: member.billable_seconds,
      entries: member.entry_count,
      status: member.status,
      running: member.running_count > 0,
    })),
    entries: input.members.flatMap((member) =>
      (input.entries.get(member.id) ?? []).map((entry) => ({
        member: member.name,
        department: member.department_name ?? NO_DEPARTMENT,
        start: timeLabel(entry.clip_start, tz),
        end: timeLabel(entry.clip_end, tz),
        description: entry.description,
        project: entryProject(entry),
        seconds: entry.seconds,
        billable: entry.billable,
      })),
    ),
  }
}

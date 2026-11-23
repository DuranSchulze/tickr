import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { db } from '#/db'
import { auditLogs } from '#/db/schema'
import {
  formatHoursMinutes,
  getDayKind,
  isFlagged,
  isWorkingDay,
  latestSaturdayBefore,
  localClock,
  previousWorkingDay,
  readDailyReportConfig,
} from '#/lib/time-tracker/daily-report'
import type { DailyStatus, DayKind } from '#/lib/time-tracker/daily-report'
import {
  addDateKeyDays,
  dateKeyInTimeZone,
  normalizeWeekStart,
} from '#/lib/time-tracker/timesheet'
import { assertTrustedOrigin } from '../csrf.server'
import { assertWorkspaceWriteAccess } from '../subscription-gate.server'
import {
  getAuthSession,
  WorkspaceAccessError,
} from '../workspace-access.server'
import {
  dateLabel,
  entryProject,
  evaluateMembers,
  LEAVE_DECLARED,
  LEAVE_WITHDRAWN,
  leaveDetails,
  loadEntries,
  loadMemberDays,
  minimumFor,
  timeLabel,
  workedPreviousSaturday,
} from './daily-report-data.server'
import type { DailyWorkspace } from './daily-report-data.server'
import { getWorkspaceDateRange } from './shared/dates'
import { overlapsLocalDay } from './missing-weekday.server'

/** Members can answer the leave question for this many days back. */
const LEAVE_ANSWER_WINDOW_DAYS = 14

type Viewer = DailyWorkspace & {
  member_id: string
  user_id: string
  user_name: string
  user_email: string
  member_created_at: string
}

type DailyRecap = {
  date: string
  dateLabel: string
  dayKind: DayKind
  firstName: string
  workspaceName: string
  timezone: string
  status: DailyStatus
  /** Short or no time on a working day, and not answered as leave. */
  needsAnswer: boolean
  worked: string
  workedSeconds: number
  minimum: string
  minimumSeconds: number
  missing: string
  billable: string
  timeIn: string
  timeOut: string
  entryCount: number
  runningCount: number
  topEntries: Array<{ description: string; project: string; duration: string }>
  /** Monday of the recap date's week, for the Timesheet link. */
  timesheetWeekStart: string
}

async function getViewer(workspaceId: string) {
  const session = await getAuthSession()
  if (!session?.user) return null
  const { rows } = await db.execute<Viewer>(sql`
    select w.id, w.name, w.timezone, w.expected_daily_hours::text,
      m.id as member_id, m.user_id, m.created_at::text as member_created_at,
      coalesce(nullif(u.name, ''), m.email) as user_name, u.email as user_email
    from workspace_members m
    join workspaces w on w.id = m.workspace_id
    join users u on u.id = m.user_id
    where m.workspace_id = ${workspaceId} and m.user_id = ${session.user.id}
      and m.status = 'ACTIVE'
    order by m.id limit 1
  `)
  return rows.at(0) ?? null
}

/**
 * The member's previous working day (Sunday and holidays skipped), for the
 * check-in shown when they open the app. Null for people who do not track
 * time, or when there is no working day since they joined.
 */
export async function getDailyRecap(
  workspaceId: string,
): Promise<DailyRecap | null> {
  const viewer = await getViewer(workspaceId)
  if (!viewer) return null
  const config = readDailyReportConfig(process.env)
  const today = localClock(new Date(), viewer.timezone).date
  const saturdayWorker =
    config.saturdayMinimumHours > 0 &&
    (await workedPreviousSaturday(
      viewer,
      viewer.member_id,
      latestSaturdayBefore(today),
    ))
  const date = previousWorkingDay(today, config, saturdayWorker)
  if (
    !date ||
    date <
      dateKeyInTimeZone(new Date(viewer.member_created_at), viewer.timezone)
  )
    return null

  const [rows, entries] = await Promise.all([
    loadMemberDays(viewer, date, viewer.member_id),
    loadEntries(viewer, date, viewer.member_id),
  ])
  const { minimumSeconds: dayMinimumSeconds } = minimumFor(viewer, date, config)
  const member = evaluateMembers(
    rows,
    date,
    dayMinimumSeconds,
    config.holidays,
  ).at(0)
  if (!member?.tracks_time) return null
  const minimumSeconds = member.minimum_seconds

  const tz = viewer.timezone
  return {
    date,
    dateLabel: dateLabel(date),
    dayKind: getDayKind(date, config.holidays),
    firstName: viewer.user_name.split(/\s+/)[0] ?? viewer.user_name,
    workspaceName: viewer.name,
    timezone: tz,
    status: member.status,
    needsAnswer: isFlagged(member.status),
    worked: formatHoursMinutes(member.worked_seconds),
    workedSeconds: member.worked_seconds,
    minimum: formatHoursMinutes(minimumSeconds),
    minimumSeconds,
    missing: formatHoursMinutes(
      Math.max(0, minimumSeconds - member.worked_seconds),
    ),
    billable: formatHoursMinutes(member.billable_seconds),
    timeIn: timeLabel(member.time_in, tz),
    timeOut: timeLabel(member.time_out, tz),
    entryCount: member.entry_count,
    runningCount: member.running_count,
    topEntries: [...(entries.get(member.id) ?? [])]
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 4)
      .map((entry) => ({
        description: entry.description,
        project: entryProject(entry),
        duration: formatHoursMinutes(entry.seconds),
      })),
    timesheetWeekStart: normalizeWeekStart(date),
  }
}

/**
 * Records the member's own answer to "were you on leave?". The answer is an
 * audit event, so it is attributable and reversible. For a Monday–Friday
 * with no entries it also stores the existing N/A confirmation, so the weekly
 * department export shows the day as accounted for.
 */
export async function setDailyLeave(input: {
  workspaceId: string
  userId: string
  date: string
  onLeave: boolean
}) {
  assertTrustedOrigin()
  const viewer = await getViewer(input.workspaceId)
  if (!viewer || viewer.user_id !== input.userId)
    throw new WorkspaceAccessError()
  await assertWorkspaceWriteAccess(input.workspaceId)

  const config = readDailyReportConfig(process.env)
  const today = localClock(new Date(), viewer.timezone).date
  if (
    input.date >= today ||
    input.date < addDateKeyDays(today, -LEAVE_ANSWER_WINDOW_DAYS) ||
    input.date <
      dateKeyInTimeZone(new Date(viewer.member_created_at), viewer.timezone) ||
    !isWorkingDay(input.date, config)
  )
    return 'ineligible' as const

  await db.insert(auditLogs).values({
    workspaceId: input.workspaceId,
    actorId: viewer.user_id,
    actorEmail: viewer.user_email,
    action: input.onLeave ? LEAVE_DECLARED : LEAVE_WITHDRAWN,
    targetType: 'member',
    targetId: viewer.member_id,
    details: leaveDetails(input.date),
  })

  if (getDayKind(input.date, config.holidays) === 'weekday') {
    if (input.onLeave) {
      const { start, endExclusive } = getWorkspaceDateRange(
        { startDate: input.date, endDate: input.date },
        viewer.timezone,
      )
      await db.execute(sql`
        insert into weekday_confirmations (workspace_id, member_id, local_date)
        select ${input.workspaceId}, ${viewer.member_id}, ${input.date}::date
        where not exists (
          select 1 from time_entries t
          where t.workspace_id = ${input.workspaceId}
            and t.workspace_member_id = ${viewer.member_id}
            and ${overlapsLocalDay(sql`${start.toISOString()}::timestamptz`, sql`${endExclusive.toISOString()}::timestamptz`)}
        )
        on conflict (workspace_id, member_id, local_date) do nothing
      `)
    } else {
      await db.execute(sql`
        delete from weekday_confirmations
        where workspace_id = ${input.workspaceId}
          and member_id = ${viewer.member_id} and local_date = ${input.date}::date
      `)
    }
  }
  return 'saved' as const
}

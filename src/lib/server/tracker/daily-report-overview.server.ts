import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { db } from '#/db'
import type { RolePermission } from '#/db/schema'
import { hasPermission } from '#/lib/rbac/permissions'
import {
  formatHoursMinutes,
  localClock,
  minimumSecondsFor,
  readDailyReportConfig,
} from '#/lib/time-tracker/daily-report'
import { dailyReportPagePath } from '#/lib/time-tracker/daily-report-link'
import type { DailyReportScope } from '#/lib/time-tracker/daily-report-link'
import { addDateKeyDays } from '#/lib/time-tracker/timesheet'
import { signDailyReportLink } from '../daily-report-link.server'
import { requireWorkspaceAccess } from '../workspace-access.server'

type Me = {
  id: string
  department_id: string | null
  department_name: string | null
  permission_level: RolePermission
  permission_overrides: unknown
  expected_daily_hours: string
}

type DailyEmailKind =
  | 'member_report'
  | 'department_digest'
  | 'workspace_digest'
  | 'shift_nudge'

type DailyReportOverview = {
  active: boolean
  timezone: string
  receives: {
    memberReport: boolean
    reminders: boolean
    /** Department name when the viewer is an Admin assigned to one. */
    departmentReport: string | null
    /** Admin without a department: explains why no department report arrives. */
    adminWithoutDepartment: boolean
    workspaceReport: boolean
  }
  rules: {
    weekdayMinimum: string
    saturdayMinimum: string
    /** e.g. "5:00 PM", or null when the reminder is turned off. */
    reminderTime: string | null
    attachmentMaxMb: number
    upcomingHolidays: string[]
  }
  /** Yesterday's reports this viewer can open, as download-page paths. */
  latest: {
    date: string
    links: Array<{ scope: DailyReportScope; label: string; path: string }>
  }
  recent: Array<{
    kind: DailyEmailKind
    date: string
    sentAt: string
    outcome: 'pdf_attached' | 'link_only' | 'sent' | 'failed'
  }>
}

const DAILY_EMAIL_KINDS: readonly string[] = [
  'member_report',
  'department_digest',
  'workspace_digest',
  'shift_nudge',
] satisfies DailyEmailKind[]

function isDailyEmailKind(value: string | undefined): value is DailyEmailKind {
  return value !== undefined && DAILY_EMAIL_KINDS.includes(value)
}

function hourLabel(hour: number) {
  return `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`
}

export async function getDailyReportOverview(): Promise<DailyReportOverview> {
  const access = await requireWorkspaceAccess()
  const workspaceId = access.workspace.id
  const timezone = access.workspace.timezone
  const { rows } = await db.execute<Me>(sql`
    select m.id, m.department_id, d.name as department_name,
      role.permission_level, role.permission_overrides,
      w.expected_daily_hours::text as expected_daily_hours
    from workspace_members m
    join workspaces w on w.id = m.workspace_id
    join workspace_roles role on role.id = m.workspace_role_id and role.workspace_id = m.workspace_id
    left join departments d on d.id = m.department_id and d.workspace_id = m.workspace_id
    where m.id = ${access.member.id} and m.workspace_id = ${workspaceId}
      and m.status = 'ACTIVE'
  `)
  const me = rows.at(0)
  if (!me) throw new Error('Active membership required.')

  const config = readDailyReportConfig(process.env)
  const level = me.permission_level
  const isAdmin = level === 'ADMIN'
  const departmentReport =
    isAdmin && me.department_id ? me.department_name : null
  const workspaceReport = hasPermission(
    level,
    me.permission_overrides,
    'reports.daily_digest',
  )
  const expected = Number(me.expected_daily_hours) || 8
  const today = localClock(new Date(), timezone).date
  const yesterday = addDateKeyDays(today, -1)

  const scopes: Array<{
    scope: DailyReportScope
    targetId: string
    label: string
  }> = [{ scope: 'member', targetId: me.id, label: 'My report' }]
  if (departmentReport && me.department_id)
    scopes.push({
      scope: 'department',
      targetId: me.department_id,
      label: `${departmentReport} report`,
    })
  if (workspaceReport)
    scopes.push({
      scope: 'workspace',
      targetId: workspaceId,
      label: 'Workspace report',
    })
  const links = process.env.BETTER_AUTH_SECRET
    ? await Promise.all(
        scopes.map(async ({ scope, targetId, label }) => ({
          scope,
          label,
          path: dailyReportPagePath(
            await signDailyReportLink({
              workspaceId,
              scope,
              targetId,
              date: yesterday,
            }),
          ),
        })),
      )
    : []

  const { rows: history } = await db.execute<{
    action: string
    details: string
    created_at: string
  }>(sql`
    select action, details, created_at::text
    from audit_logs
    where workspace_id = ${workspaceId}
      and action in ('DAILY_REPORT_EMAIL', 'DAILY_REPORT_EMAIL_FAILED')
      and details like ${`daily:%${me.id}%`}
    order by created_at desc
    limit 6
  `)

  return {
    active:
      config.enabled &&
      (config.workspaceIds.length === 0 ||
        config.workspaceIds.includes(workspaceId)),
    timezone,
    receives: {
      memberReport: true,
      reminders: level !== 'OWNER',
      departmentReport,
      adminWithoutDepartment: isAdmin && !me.department_id,
      workspaceReport,
    },
    rules: {
      weekdayMinimum: formatHoursMinutes(
        minimumSecondsFor('weekday', config, expected),
      ),
      saturdayMinimum: formatHoursMinutes(
        minimumSecondsFor('saturday', config, expected),
      ),
      reminderTime:
        config.nudgeHour === null ? null : hourLabel(config.nudgeHour),
      attachmentMaxMb:
        Math.round((config.attachmentMaxBytes / 1024 / 1024) * 10) / 10,
      upcomingHolidays: [...config.holidays]
        .filter((date) => date >= today)
        .sort()
        .slice(0, 3),
    },
    latest: { date: yesterday, links },
    recent: history.flatMap((row) => {
      const [key, note] = row.details.split(' ')
      const [, kind, date] = key.split(':')
      if (!isDailyEmailKind(kind)) return []
      return {
        kind,
        date,
        sentAt: row.created_at,
        outcome:
          row.action === 'DAILY_REPORT_EMAIL_FAILED'
            ? 'failed'
            : note === 'pdf_attached' || note === 'link_only'
              ? note
              : 'sent',
      }
    }),
  }
}

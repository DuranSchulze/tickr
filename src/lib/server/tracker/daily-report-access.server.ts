import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { db } from '#/db'
import type { RolePermission } from '#/db/schema'
import { hasPermission } from '#/lib/rbac/permissions'
import { readDailyReportConfig } from '#/lib/time-tracker/daily-report'
import {
  buildDailyReportExcel,
  buildDailyReportPdf,
  dailyReportFilename,
} from '#/lib/time-tracker/daily-report-export'
import type {
  DailyReportFormat,
  DailyReportScope,
} from '#/lib/time-tracker/daily-report-link'
import { verifyDailyReportLink } from '../daily-report-link.server'
import type { DailyReportLink } from '../daily-report-link.server'
import { getAuthSession } from '../workspace-access.server'
import {
  dateLabel,
  evaluateMembers,
  loadEntries,
  loadMemberDays,
  membersInScope,
  minimumFor,
  toDataset,
} from './daily-report-data.server'
import type { DailyWorkspace } from './daily-report-data.server'

type DailyReportSummary = {
  workspaceName: string
  scope: DailyReportScope
  title: string
  date: string
  dateLabel: string
  timezone: string
}

type Viewer = {
  id: string
  department_id: string | null
  permission_level: RolePermission
  permission_overrides: unknown
}

type Target = DailyWorkspace & {
  title: string | null
  target_department_id: string | null
}

const privateHeaders = { 'Cache-Control': 'private, no-store' }

/**
 * Who may open a daily report, checked against current membership on every
 * view and download:
 * - workspace: roles with "Receive daily attendance digest" (Owner by default)
 * - department: Owners, those roles, and Admins assigned to that department
 * - member: the member, plus anyone who may open that member's department
 */
function canView(viewer: Viewer, link: DailyReportLink, target: Target) {
  const level = viewer.permission_level
  const workspaceWide =
    level === 'OWNER' ||
    hasPermission(level, viewer.permission_overrides, 'reports.daily_digest')
  if (link.scope === 'workspace') return workspaceWide
  if (workspaceWide) return true
  const adminOf = (departmentId: string | null) =>
    level === 'ADMIN' &&
    departmentId !== null &&
    viewer.department_id === departmentId
  if (link.scope === 'department') return adminOf(link.targetId)
  return viewer.id === link.targetId || adminOf(target.target_department_id)
}

async function resolve(token: string) {
  const link = await verifyDailyReportLink(token)
  if (!link) return { status: 'unavailable' as const }
  const session = await getAuthSession()
  if (!session?.user) return { status: 'signed_out' as const }

  const { rows: viewers } = await db.execute<Viewer>(sql`
    select m.id, m.department_id, role.permission_level, role.permission_overrides
    from workspace_members m
    join workspace_roles role on role.id = m.workspace_role_id and role.workspace_id = m.workspace_id
    where m.workspace_id = ${link.workspaceId} and m.user_id = ${session.user.id}
      and m.status = 'ACTIVE'
    order by m.id limit 1
  `)
  const viewer = viewers.at(0)
  if (!viewer) return { status: 'unavailable' as const }

  const { rows: targets } = await db.execute<Target>(sql`
    select w.id, w.name, w.timezone, w.expected_daily_hours::text,
      ${
        link.scope === 'department'
          ? sql`(select d.name from departments d where d.id = ${link.targetId} and d.workspace_id = w.id)`
          : link.scope === 'member'
            ? sql`(select coalesce(nullif(u.name, ''), m.email) from workspace_members m
                left join users u on u.id = m.user_id
                where m.id = ${link.targetId} and m.workspace_id = w.id)`
            : sql`'All departments'`
      } as title,
      ${
        link.scope === 'member'
          ? sql`(select m.department_id from workspace_members m where m.id = ${link.targetId} and m.workspace_id = w.id)`
          : sql`null`
      } as target_department_id
    from workspaces w where w.id = ${link.workspaceId}
  `)
  const target = targets.at(0)
  if (!target?.title || !canView(viewer, link, target))
    return { status: 'unavailable' as const }
  return { status: 'available' as const, link, target }
}

export async function getAccessibleDailyReport(token: string) {
  const result = await resolve(token)
  if (result.status !== 'available') return { status: result.status }
  const { link, target } = result
  const report: DailyReportSummary = {
    workspaceName: target.name,
    scope: link.scope,
    title: target.title ?? '',
    date: link.date,
    dateLabel: dateLabel(link.date),
    timezone: target.timezone,
  }
  return { status: 'available' as const, report }
}

/** Builds the file from current data, so late corrections are included. */
export async function prepareDailyReportDownload(
  token: string,
  format: DailyReportFormat,
) {
  const result = await resolve(token)
  if (result.status !== 'available') {
    return new Response('Report unavailable.', {
      status: result.status === 'signed_out' ? 401 : 404,
      headers: privateHeaders,
    })
  }
  const { link, target } = result
  const config = readDailyReportConfig(process.env)
  const { minimumSeconds } = minimumFor(target, link.date, config)
  const [rows, entries] = await Promise.all([
    loadMemberDays(target, link.date),
    loadEntries(target, link.date),
  ])
  const dataset = toDataset({
    workspace: target,
    date: link.date,
    scope: link.scope,
    title: target.title ?? '',
    minimumSeconds,
    members: membersInScope(
      evaluateMembers(rows, link.date, minimumSeconds, config.holidays),
      link.scope,
      link.targetId,
    ),
    entries,
  })
  const content =
    format === 'pdf'
      ? await buildDailyReportPdf(dataset)
      : await buildDailyReportExcel(dataset)
  return new Response(new Uint8Array(content), {
    headers: {
      ...privateHeaders,
      'Content-Type':
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${dailyReportFilename(dataset, format)}"`,
    },
  })
}

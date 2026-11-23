import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { db } from '#/db'
import { requireWorkspaceAccess } from './workspace-access.server'
import { assertOwnerOrAdmin } from './tracker/shared/role-gates.server'
import { nextWeeklyReport } from '#/lib/time-tracker/weekly-report-schedule'
import { weeklyReportsEnabled } from './tracker/weekly-reports.server'

export async function getWeeklyReportPreferences() {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)
  const current = await db.execute<{
    enabled: boolean
    email: string
    departmentName: string | null
    reportId: string | null
  }>(sql`
    select m.weekly_report_email_enabled as enabled, u.email, d.name as "departmentName",
      (select r.id from weekly_department_reports r
       where r.workspace_id = m.workspace_id and r.department_id = d.id and r.expires_at > now()
       order by r.week_start desc, r.id limit 1) as "reportId"
    from workspace_members m
    join users u on u.id = m.user_id
    join workspace_roles role on role.id = m.workspace_role_id and role.workspace_id = m.workspace_id
    left join departments d on d.id = m.department_id and d.workspace_id = m.workspace_id
    where m.id = ${access.member.id} and m.workspace_id = ${access.workspace.id}
      and m.user_id = ${access.session.user.id} and m.status = 'ACTIVE'
      and role.permission_level in ('OWNER', 'ADMIN')`)
  if (!current.rows[0]) throw new Error('Active membership required.')
  const last = await db.execute<{
    status: string
    week_start: string
    week_end: string
    error: string | null
    updated_at: string
  }>(sql`
    select j.status, j.week_start::text, j.week_end::text, j.error, j.updated_at
    from weekly_report_jobs j join weekly_department_reports r on r.id = j.report_id
    join workspace_members m on m.id = j.member_id and m.workspace_id = j.workspace_id
      and m.department_id = r.department_id
    where j.member_id = ${access.member.id} and j.workspace_id = ${access.workspace.id}
      and j.report_type = 'department' and r.workspace_id = j.workspace_id
    order by j.due_at desc, j.id limit 1`)
  return {
    ...current.rows[0],
    workspaceName: access.workspace.name,
    timezone: access.workspace.timezone,
    rolloutActive:
      weeklyReportsEnabled() &&
      (!(process.env.WEEKLY_REPORT_WORKSPACE_IDS ?? '').trim() ||
        (process.env.WEEKLY_REPORT_WORKSPACE_IDS ?? '')
          .split(',')
          .map((id) => id.trim())
          .includes(access.workspace.id)),
    next: nextWeeklyReport(new Date(), access.workspace.timezone),
    last: last.rows.at(0) ?? null,
  }
}
export async function updateWeeklyReportPreferences(enabled: boolean) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)
  // One atomic update cancels unsent work and establishes a no-backfill boundary.
  const { rows } = await db.execute(sql`
    with changed as (
      update workspace_members set weekly_report_email_enabled = ${enabled},
        weekly_report_enabled_at = case when ${enabled} and not weekly_report_email_enabled then now() else weekly_report_enabled_at end,
        updated_at = now()
      where id = ${access.member.id} and workspace_id = ${access.workspace.id}
        and user_id = ${access.session.user.id} and status = 'ACTIVE'
        and exists (select 1 from workspace_roles role where role.id = workspace_role_id
          and role.workspace_id = workspace_members.workspace_id and role.permission_level in ('OWNER', 'ADMIN'))
        and exists (select 1 from departments d where d.id = department_id and d.workspace_id = workspace_members.workspace_id)
        returning id
    ), cancelled as (
      update weekly_report_jobs set status = 'skipped', error = 'preference_disabled', payload = null,
        attachment_roster = null, attempt_started_in_lease = false,
        lease_token = null, lease_until = null, updated_at = now()
      where member_id in (select id from changed) and workspace_id = ${access.workspace.id}
        and report_type = 'department' and not ${enabled} and (status in ('pending', 'retryable_failure')
          or (status = 'processing' and not attempt_started_in_lease))
      returning id
    ) select id from changed`)
  if (!rows.length)
    throw new Error(
      'Weekly email settings require an active department assignment.',
    )
  return getWeeklyReportPreferences()
}

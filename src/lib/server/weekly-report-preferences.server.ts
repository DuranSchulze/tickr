import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { db } from '#/db'
import { requireWorkspaceAccess } from './workspace-access.server'
import { nextWeeklyReport } from '#/lib/time-tracker/weekly-report-schedule'
import { weeklyReportsEnabled } from './tracker/weekly-reports.server'

export async function getWeeklyReportPreferences() {
  const access = await requireWorkspaceAccess()
  const current = await db.execute<{ enabled: boolean; email: string }>(sql`
    select m.weekly_report_email_enabled as enabled, u.email from workspace_members m
    join users u on u.id = m.user_id
    where m.id = ${access.member.id} and m.workspace_id = ${access.workspace.id}
      and m.user_id = ${access.session.user.id} and m.status = 'ACTIVE'`)
  if (!current.rows[0]) throw new Error('Active membership required.')
  const last = await db.execute<{
    status: string
    week_start: string
    week_end: string
    error: string | null
    updated_at: string
  }>(sql`
    select status, week_start, week_end, error, updated_at from weekly_report_jobs
    where member_id = ${access.member.id} and workspace_id = ${access.workspace.id}
    order by due_at desc limit 1`)
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
  // One atomic update cancels unsent work and establishes a no-backfill boundary.
  await db.execute(sql`
    with changed as (
      update workspace_members set weekly_report_email_enabled = ${enabled},
        weekly_report_enabled_at = case when ${enabled} and not weekly_report_email_enabled then now() else weekly_report_enabled_at end,
        updated_at = now()
      where id = ${access.member.id} and workspace_id = ${access.workspace.id}
        and user_id = ${access.session.user.id} and status = 'ACTIVE' returning id
    ) update weekly_report_jobs set status = 'skipped', error = 'preference_disabled', payload = null,
      lease_token = null, lease_until = null, updated_at = now()
      where member_id in (select id from changed) and workspace_id = ${access.workspace.id}
        and not ${enabled} and (status in ('pending', 'retryable_failure') or (status = 'processing' and attempts = 0))`)
  return getWeeklyReportPreferences()
}

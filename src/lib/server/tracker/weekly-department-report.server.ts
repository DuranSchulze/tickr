import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import type { SQLWrapper } from 'drizzle-orm'
import { db } from '#/db'
import { buildTimesheetDateKeys } from '#/lib/time-tracker/timesheet'
import type {
  DepartmentReportRow,
  DepartmentReportScope,
} from '#/lib/time-tracker/weekly-department-report'
import { getAuthSession } from '../workspace-access.server'
import { getWorkspaceDateRange } from './shared/dates'
import { overlapsLocalDay } from './missing-weekday.server'

export async function getAccessibleDepartmentReport(
  reportId: string,
  roster?: Record<string, string>,
) {
  const session = await getAuthSession()
  if (!session?.user) return { status: 'signed_out' as const }
  const { rows } = await db.execute<DepartmentReportScope>(sql`
    select r.id, r.workspace_id, w.name as workspace_name, r.department_id,
      d.name as department_name, r.week_start::text, r.week_end::text, r.timezone
    from weekly_department_reports r
    join workspaces w on w.id = r.workspace_id
    join departments d on d.id = r.department_id and d.workspace_id = r.workspace_id
    where r.id = ${reportId}::uuid and r.expires_at > now() and exists (
      select 1 from workspace_members m
      join workspace_roles role on role.id = m.workspace_role_id and role.workspace_id = m.workspace_id
      where m.user_id = ${session.user.id} and m.status = 'ACTIVE'
        and m.workspace_id = r.workspace_id and m.department_id = r.department_id
        and role.permission_level in ('OWNER', 'ADMIN')
    ) and ${roster ? departmentReportRosterIsCurrent(sql`r.workspace_id`, sql`r.department_id`, roster) : sql`true`}
  `)
  const report = rows.at(0)
  return report
    ? { status: 'available' as const, report }
    : { status: 'unavailable' as const }
}

export async function buildDepartmentReport(
  scope: DepartmentReportScope,
  maxMembers?: number,
) {
  const dates = buildTimesheetDateKeys(scope.week_start)
  if (dates.at(-1) !== scope.week_end) throw new Error('Invalid report period')
  const bounds = dates.map((date) => {
    const { start, endExclusive } = getWorkspaceDateRange(
      { startDate: date, endDate: date },
      scope.timezone,
    )
    return sql`(${date}::date, ${start.toISOString()}::timestamptz, ${endExclusive.toISOString()}::timestamptz)`
  })
  const { endExclusive } = getWorkspaceDateRange(
    { startDate: scope.week_end, endDate: scope.week_end },
    scope.timezone,
  )
  const { rows } = await db.execute<DepartmentReportRow>(sql`
    with dates(local_date, starts, ends) as (values ${sql.join(bounds, sql`, `)}),
    roster as materialized (
      select m.id, coalesce(u.name, m.email) as name,
        greatest(m.created_at, m.department_assigned_at) as assignment_start
      from workspace_members m
      left join users u on u.id = m.user_id
      where m.workspace_id = ${scope.workspace_id} and m.department_id = ${scope.department_id}
        and m.status = 'ACTIVE'
        and greatest(m.created_at, m.department_assigned_at) < ${endExclusive.toISOString()}::timestamptz
      order by coalesce(u.name, m.email), m.id
      ${maxMembers === undefined ? sql`` : sql`limit ${maxMembers + 1}`}
    )
    select m.id as member_id, m.assignment_start::text, m.name as member,
      d.local_date::text, a.time_in::text, a.time_out::text,
      coalesce(a.worked_seconds, 0)::int as worked_seconds,
      coalesce(a.billable_seconds, 0)::int as billable_seconds,
      case
        when d.ends <= m.assignment_start then 'OUT_OF_SCOPE'
        when a.time_in is not null then 'WORK'
        when d.starts >= m.assignment_start and a.overlap_count = 0 and c.local_date is not null then 'N/A'
        else 'NO_TIME'
      end as status
    from roster m cross join dates d
    left join weekday_confirmations c on c.workspace_id = ${scope.workspace_id}
      and c.member_id = m.id and c.local_date = d.local_date
    cross join lateral (
      select count(*) as overlap_count,
        min(greatest(t.started_at, d.starts, m.assignment_start)) filter (where t.ended_at is not null) as time_in,
        max(least(t.ended_at, d.ends)) filter (where t.ended_at is not null) as time_out,
        floor(sum(s.seconds)) as worked_seconds,
        floor(sum(s.seconds) filter (where t.billable)) as billable_seconds
      from time_entries t
      cross join lateral (
        select case when t.ended_at is not null then extract(epoch from
          least(t.ended_at, d.ends) - greatest(t.started_at, d.starts, m.assignment_start)) end as seconds
      ) s
      where t.workspace_id = ${scope.workspace_id} and t.workspace_member_id = m.id
        and m.assignment_start < d.ends
        and ${overlapsLocalDay(sql`greatest(d.starts, m.assignment_start, t.started_at)`, sql`d.ends`)}
    ) a
    order by m.name, m.id, d.local_date
  `)
  return maxMembers !== undefined && rows.length > maxMembers * 7 ? null : rows
}

export function departmentReportRoster(rows: DepartmentReportRow[]) {
  return Object.fromEntries(
    rows.map((row) => [row.member_id, row.assignment_start]),
  )
}

// Run immediately before handing bytes to a client or starting a provider attempt.
export function departmentReportRosterIsCurrent(
  workspaceId: string | SQLWrapper,
  departmentId: string | SQLWrapper,
  roster: Record<string, string>,
) {
  return sql`not exists (
    select 1 from jsonb_each_text(${JSON.stringify(roster)}::jsonb) entry
    where not exists (select 1 from workspace_members person
      where person.id = entry.key and person.workspace_id = ${workspaceId}
        and person.department_id = ${departmentId} and person.status = 'ACTIVE'
        and greatest(person.created_at, person.department_assigned_at) = entry.value::timestamptz)
  )`
}

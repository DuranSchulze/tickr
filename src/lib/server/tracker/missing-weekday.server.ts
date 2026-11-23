import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { db } from '#/db'
import { addDateKeyDays, dateKeyInTimeZone } from '#/lib/time-tracker/timesheet'
import { assertTrustedOrigin } from '../csrf.server'
import { assertWorkspaceWriteAccess } from '../subscription-gate.server'
import {
  getAuthSession,
  WorkspaceAccessError,
} from '../workspace-access.server'
import { getWorkspaceDateRange } from './shared/dates'
import type { SQLWrapper } from 'drizzle-orm'

export function latestCompletedWeekday(now: Date, timezone: string) {
  let date = addDateKeyDays(dateKeyInTimeZone(now, timezone), -1)
  const weekday = new Date(date).getUTCDay()
  if (weekday === 0 || weekday === 6)
    date = addDateKeyDays(date, weekday === 0 ? -2 : -1)
  return date
}

// All callers use half-open local dates. Running entries have no end yet.
export function overlapsLocalDay(start: SQLWrapper, end: SQLWrapper) {
  return sql`t.started_at < ${end} and (t.ended_at is null or t.ended_at > ${start})`
}

type Viewer = {
  id: string
  user_id: string
  timezone: string
  created_at: string
}

async function getViewer(workspaceId: string) {
  const session = await getAuthSession()
  if (!session?.user) return null
  const { rows } = await db.execute<Viewer>(sql`
    select m.id, m.user_id, w.timezone, m.created_at::text
    from workspace_members m join workspaces w on w.id = m.workspace_id
    where m.workspace_id = ${workspaceId} and m.user_id = ${session.user.id} and m.status = 'ACTIVE'
    order by m.id limit 1
  `)
  return rows[0]
}

async function requireWriteViewer(workspaceId: string, userId: string) {
  assertTrustedOrigin()
  const viewer = await getViewer(workspaceId)
  if (!viewer || viewer.user_id !== userId) throw new WorkspaceAccessError()
  await assertWorkspaceWriteAccess(workspaceId)
  return viewer
}

function eligibility(workspaceId: string, viewer: Viewer, date: string) {
  const { start, endExclusive } = getWorkspaceDateRange(
    { startDate: date, endDate: date },
    viewer.timezone,
  )
  return sql`
    m.workspace_id = ${workspaceId} and m.id = ${viewer.id}
    and m.user_id = ${viewer.user_id} and m.status = 'ACTIVE'
    and not exists (
      select 1 from time_entries t where t.workspace_id = m.workspace_id
        and t.workspace_member_id = m.id
        and ${overlapsLocalDay(sql`${start.toISOString()}::timestamptz`, sql`${endExclusive.toISOString()}::timestamptz`)}
    )`
}

export async function getMissingWeekday(workspaceId: string) {
  const viewer = await getViewer(workspaceId)
  if (!viewer) return null
  const date = latestCompletedWeekday(new Date(), viewer.timezone)
  if (date < dateKeyInTimeZone(new Date(viewer.created_at), viewer.timezone))
    return null
  const { rows } = await db.execute(sql`
    select 1 from workspace_members m where ${eligibility(workspaceId, viewer, date)}
      and not exists (select 1 from weekday_confirmations c where c.workspace_id = m.workspace_id
        and c.member_id = m.id and c.local_date = ${date}::date)
  `)
  return rows.length ? { date, timezone: viewer.timezone } : null
}

export async function confirmMissingWeekday(
  workspaceId: string,
  date: string,
  userId: string,
) {
  const viewer = await requireWriteViewer(workspaceId, userId)
  if (
    date !== latestCompletedWeekday(new Date(), viewer.timezone) ||
    date < dateKeyInTimeZone(new Date(viewer.created_at), viewer.timezone)
  )
    return 'ineligible' as const

  const { rows } = await db.execute(sql`
    insert into weekday_confirmations (workspace_id, member_id, local_date)
    select m.workspace_id, m.id, ${date}::date
    from workspace_members m where ${eligibility(workspaceId, viewer, date)}
    on conflict (workspace_id, member_id, local_date) do update
      set confirmed_at = weekday_confirmations.confirmed_at
    returning local_date
  `)
  return rows.length ? ('confirmed' as const) : ('ineligible' as const)
}

export async function undoMissingWeekday(
  workspaceId: string,
  date: string,
  userId: string,
) {
  const viewer = await requireWriteViewer(workspaceId, userId)
  await db.execute(sql`
    delete from weekday_confirmations c using workspace_members m
    where c.workspace_id = ${workspaceId} and c.member_id = ${viewer.id}
      and c.local_date = ${date}::date and m.id = c.member_id and m.workspace_id = c.workspace_id
      and m.user_id = ${viewer.user_id} and m.status = 'ACTIVE'
  `)
}

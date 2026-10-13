import { sql } from 'drizzle-orm'
import type { PersonalTimeEntriesQuery } from './external-api.shared'

const SORT_COLUMNS = {
  startedAt: 'started_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  durationSeconds: 'duration_seconds',
} as const

/** A single statement gives entries, counts and all daily summaries the same snapshot. */
export function buildPersonalTimeEntriesSql(
  userId: string,
  query: PersonalTimeEntriesQuery,
  generatedAt: Date,
) {
  const memberFilter = query.memberId
    ? sql`and m.id = ${query.memberId}`
    : sql``
  const workspaceFilter = query.workspaceId
    ? sql`and w.id = ${query.workspaceId}`
    : sql``
  const day = query.date
    ? sql`${query.date}::date`
    : sql`(${generatedAt.toISOString()}::timestamptz at time zone w.timezone)::date`
  const rangeStart = query.startDate
    ? sql`${query.startDate}::timestamptz`
    : sql`(${day}::timestamp at time zone w.timezone)`
  const rangeEnd = query.endDate
    ? sql`${query.endDate}::timestamptz`
    : sql`((${day} + 1)::timestamp at time zone w.timezone)`
  const filters = sql.join(
    [
      query.updatedSince
        ? sql`and e.updated_at >= ${query.updatedSince}::timestamptz`
        : sql``,
      query.search
        ? sql`and e.description ilike ${`%${query.search}%`}`
        : sql``,
      query.projectId ? sql`and e.project_id = ${query.projectId}` : sql``,
      query.taskId ? sql`and e.task_id = ${query.taskId}` : sql``,
      query.billable !== undefined
        ? sql`and e.billable = ${query.billable}`
        : sql``,
      query.running !== undefined
        ? query.running
          ? sql`and e.ended_at is null`
          : sql`and e.ended_at is not null`
        : sql``,
    ],
    sql` `,
  )
  const sort = sql.identifier(SORT_COLUMNS[query.sortBy])
  const direction = query.sortDir === 'desc' ? sql`desc` : sql`asc`
  const now = generatedAt.toISOString()
  return sql`
    with scope as (
      select w.id, w.name, w.slug, w.timezone, ${rangeStart} as range_start, ${rangeEnd} as range_end
      from workspaces w
      where exists (select 1 from workspace_members m where m.workspace_id = w.id
        and m.user_id = ${userId} and m.status = 'ACTIVE' ${memberFilter}) ${workspaceFilter}
    ), matched as materialized (
      select e.id, e.workspace_id, e.workspace_member_id, e.description, e.project_id, e.task_id,
        e.billable, e.started_at, e.ended_at, e.duration_seconds, e.notes, e.created_at, e.updated_at,
        m.email as member_email, u.name as member_name
      from scope s
      join time_entries e on e.workspace_id = s.id
      join workspace_members m on m.id = e.workspace_member_id and m.workspace_id = e.workspace_id
        and m.user_id = ${userId} and m.status = 'ACTIVE' ${memberFilter}
      join users u on u.id = m.user_id
      where e.started_at < s.range_end
        and (e.ended_at > s.range_start or (e.ended_at is null and ${now}::timestamptz > s.range_start))
        ${filters}
    ), paged as (
      select * from matched order by ${sort} ${direction}, id asc
      limit ${query.limit} offset ${(query.page - 1) * query.limit}
    ), page_tags as (
      select et.time_entry_id, jsonb_agg(et.tag_id order by et.tag_id) as tag_ids
      from time_entry_tags et join paged p on p.id = et.time_entry_id
      join tags tg on tg.id = et.tag_id and tg.workspace_id = p.workspace_id
      group by et.time_entry_id
    ), days as (
      select s.*, d.local_day::date::text as date,
        greatest(s.range_start, d.local_day at time zone s.timezone) as day_start,
        least(s.range_end, (d.local_day + interval '1 day') at time zone s.timezone) as day_end
      from scope s cross join lateral generate_series(
        (s.range_start at time zone s.timezone)::date::timestamp,
        ((s.range_end - interval '1 microsecond') at time zone s.timezone)::date::timestamp,
        interval '1 day') d(local_day)
    ), daily as (
      select d.id, d.name, d.slug, d.timezone, d.date,
        min(greatest(e.started_at, d.day_start)) filter (where e.id is not null) as time_in,
        case when coalesce(bool_or(e.ended_at is null) filter (where e.id is not null), false) then null
          else max(least(e.ended_at, d.day_end)) filter (where e.id is not null) end as time_out,
        coalesce(sum(greatest(0, floor(extract(epoch from (
          least(coalesce(e.ended_at, ${now}::timestamptz), d.day_end) - greatest(e.started_at, d.day_start)
        ))))) filter (where e.id is not null), 0)::bigint as duration_seconds,
        count(e.id)::int as entry_count,
        coalesce(bool_or(e.ended_at is null) filter (where e.id is not null), false) as running
      from days d left join matched e on e.workspace_id = d.id
        and e.started_at < d.day_end and coalesce(e.ended_at, ${now}::timestamptz) > d.day_start
      group by d.id, d.name, d.slug, d.timezone, d.date
    )
    select (select count(*)::int from matched) as total,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'workspaceMemberId', p.workspace_member_id,
        'memberName', coalesce(p.member_name, p.member_email), 'memberEmail', p.member_email,
        'description', p.description, 'projectId', p.project_id, 'projectName', pr.name,
        'clientName', c.name, 'taskId', p.task_id, 'taskName', t.name,
        'tagIds', coalesce(pt.tag_ids, '[]'::jsonb),
        'billable', p.billable, 'startedAt', p.started_at, 'endedAt', p.ended_at,
        'durationSeconds', p.duration_seconds, 'notes', p.notes, 'createdAt', p.created_at,
        'updatedAt', p.updated_at, 'workspace', jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'timezone', s.timezone)
      ) order by p.${sort} ${direction}, p.id asc)
      from paged p join scope s on s.id = p.workspace_id
        left join page_tags pt on pt.time_entry_id = p.id
        left join projects pr on pr.id = p.project_id and pr.workspace_id = p.workspace_id
        left join clients c on c.id = pr.client_id and c.workspace_id = p.workspace_id
        left join project_tasks t on t.id = p.task_id and t.workspace_id = p.workspace_id and t.project_id = p.project_id), '[]'::jsonb) as data,
      coalesce((select jsonb_agg(jsonb_build_object(
        'workspace', jsonb_build_object('id', id, 'name', name, 'slug', slug, 'timezone', timezone),
        'date', date, 'timeIn', time_in, 'timeOut', time_out,
        'durationSeconds', duration_seconds, 'entryCount', entry_count, 'running', running
      ) order by name, id, date) from daily), '[]'::jsonb) as summaries
  `
}

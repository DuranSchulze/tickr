import type { z } from 'zod'
import { db } from '#/db'
import {
  timeEntries,
  projects,
  clients,
  tags,
  timeEntryTags,
  workspaceMembers,
  departments,
  users,
} from '#/db/schema'
import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { buildDateKeys, getAnalyticsDateRange, toDateKey } from './shared/dates'
import type { analyticsRangeSchema } from './shared/schemas'

export type AnalyticsScope = 'workspace' | 'department' | 'personal'
export type AnalyticsSelectedScope = 'personal' | 'organization' | 'department'

export type AnalyticsTimeEntryRow = {
  id: string
  date: string
  memberName: string
  projectName: string | null
  clientName: string | null
  tagNames: string[]
  description: string
  durationSeconds: number
  billable: boolean
}

export type AnalyticsPayload = {
  scope: AnalyticsScope
  selectedScope: AnalyticsSelectedScope
  availableScopes: AnalyticsSelectedScope[]
  scopeLabel: string
  notice: string | null
  startDate: string
  endDate: string
  summary: {
    totalSeconds: number
    billableSeconds: number
    nonBillableSeconds: number
    entryCount: number
    activeMembers: number | null
  }
  dailyTotals: Array<{ date: string; seconds: number }>
  projectTotals: Array<{
    projectId: string
    name: string
    color: string
    seconds: number
  }>
  billableSplit: Array<{ label: 'Billable' | 'Non-billable'; seconds: number }>
  heatmap: Array<{ date: string; seconds: number; intensity: number }>
  topTasks: Array<{ description: string; seconds: number; entryCount: number }>
  topTags: Array<{
    tagId: string
    name: string
    color: string
    seconds: number
    entryCount: number
  }>
  topDepartments: Array<{
    departmentId: string
    name: string
    color: string
    seconds: number
    memberCount: number
  }>
  entries: AnalyticsTimeEntryRow[]
  entriesTotal: number
  permissionLevel: string
}

export async function getAnalytics(
  data: z.infer<typeof analyticsRangeSchema>,
): Promise<AnalyticsPayload> {
  const access = await requireWorkspaceAccess()
  const range = getAnalyticsDateRange(data)
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  const departmentId = access.member.departmentId
  const defaultScope: AnalyticsSelectedScope =
    level === 'OWNER' || level === 'ADMIN'
      ? 'organization'
      : level === 'MANAGER'
        ? 'department'
        : 'personal'
  const requestedScope = data.scope ?? defaultScope
  const availableScopes: AnalyticsSelectedScope[] =
    level === 'OWNER' || level === 'ADMIN'
      ? ['personal', 'organization']
      : level === 'MANAGER'
        ? ['personal', 'department']
        : ['personal']

  let scope: AnalyticsScope = 'personal'
  let selectedScope: AnalyticsSelectedScope = 'personal'
  let scopeLabel = 'Your time'
  let notice: string | null = null
  const tagIdList = data.tagIds ? data.tagIds.split(',').filter(Boolean) : []
  const memberIdList = data.memberIds
    ? data.memberIds.split(',').filter(Boolean)
    : []

  const entryConditions: SQL[] = [
    eq(timeEntries.workspaceId, access.workspace.id),
    isNotNull(timeEntries.endedAt),
    gte(timeEntries.startedAt, range.start),
    lt(timeEntries.startedAt, range.endExclusive),
  ]

  const memberConditions: SQL[] = [
    eq(workspaceMembers.workspaceId, access.workspace.id),
    eq(workspaceMembers.status, 'ACTIVE'),
  ]
  let includeActiveMemberCount = false

  if (
    (level === 'OWNER' || level === 'ADMIN') &&
    requestedScope === 'organization'
  ) {
    scope = 'workspace'
    selectedScope = 'organization'
    scopeLabel = `${access.workspace.name} workspace`
    includeActiveMemberCount = true
    if (memberIdList.length > 0) {
      entryConditions.push(inArray(timeEntries.workspaceMemberId, memberIdList))
    }
  } else if (
    level === 'MANAGER' &&
    requestedScope === 'department' &&
    departmentId
  ) {
    const [deptRow] = await db
      .select({ name: departments.name })
      .from(departments)
      .where(
        and(
          eq(departments.id, departmentId),
          eq(departments.workspaceId, access.workspace.id),
        ),
      )
      .limit(1)
    scope = 'department'
    selectedScope = 'department'
    scopeLabel = deptRow?.name
      ? `${deptRow.name} department`
      : 'Your department'
    entryConditions.push(
      inArray(
        timeEntries.workspaceMemberId,
        db
          .select({ id: workspaceMembers.id })
          .from(workspaceMembers)
          .where(eq(workspaceMembers.departmentId, departmentId)),
      ),
    )
    memberConditions.push(eq(workspaceMembers.departmentId, departmentId))
    includeActiveMemberCount = true
  } else {
    entryConditions.push(eq(timeEntries.workspaceMemberId, access.member.id))
    if (level === 'MANAGER' && requestedScope === 'department') {
      notice =
        'Managers need a department assignment to see department analytics. Showing your own time for now.'
    }
  }

  if (data.projectId)
    entryConditions.push(eq(timeEntries.projectId, data.projectId))
  if (data.clientId) {
    entryConditions.push(
      inArray(
        timeEntries.projectId,
        db
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.clientId, data.clientId)),
      ),
    )
  }
  if (tagIdList.length > 0) {
    entryConditions.push(
      inArray(
        timeEntries.id,
        db
          .select({ timeEntryId: timeEntryTags.timeEntryId })
          .from(timeEntryTags)
          .where(inArray(timeEntryTags.tagId, tagIdList)),
      ),
    )
  }
  if (data.billable === 'true')
    entryConditions.push(eq(timeEntries.billable, true))
  if (data.billable === 'false')
    entryConditions.push(eq(timeEntries.billable, false))

  const PAGE_SIZE = 50
  const page = Math.max(1, data.page ?? 1)
  const whereClause = and(...entryConditions)

  // ── Run all queries in parallel ───────────────────────────────────────────────
  const [
    summaryResult,
    dailySqlRows,
    projectSqlRows,
    tagSqlRows,
    deptSqlRows,
    taskSqlRows,
    rawRows,
    countResult,
    memberCountResult,
  ] = await Promise.all([
    // 1. Summary totals — single aggregate row, no row scan
    db
      .select({
        totalSeconds: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)::int`,
        billableSeconds: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.billable} THEN ${timeEntries.durationSeconds} ELSE 0 END), 0)::int`,
      })
      .from(timeEntries)
      .where(whereClause),

    // 2. Daily totals — one row per active date
    db
      .select({
        date: sql<string>`DATE(${timeEntries.startedAt})::text`,
        seconds: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)::int`,
      })
      .from(timeEntries)
      .where(whereClause)
      .groupBy(sql`DATE(${timeEntries.startedAt})`),

    // 3. Project totals — one row per project
    db
      .select({
        projectId: sql<string>`COALESCE(${timeEntries.projectId}, 'none')`,
        name: sql<string>`COALESCE(${projects.name}, 'No project')`,
        color: sql<string>`COALESCE(${projects.color}, '#94a3b8')`,
        seconds: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)::int`,
      })
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .where(whereClause)
      .groupBy(
        sql`COALESCE(${timeEntries.projectId}, 'none')`,
        sql`COALESCE(${projects.name}, 'No project')`,
        sql`COALESCE(${projects.color}, '#94a3b8')`,
      )
      .orderBy(sql`COALESCE(SUM(${timeEntries.durationSeconds}), 0) DESC`),

    // 4. Top tags — at most 5 rows via SQL LIMIT
    db
      .select({
        tagId: tags.id,
        name: tags.name,
        color: tags.color,
        seconds: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)::int`,
        entryCount: sql<number>`COUNT(DISTINCT ${timeEntries.id})::int`,
      })
      .from(timeEntries)
      .innerJoin(timeEntryTags, eq(timeEntries.id, timeEntryTags.timeEntryId))
      .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
      .where(whereClause)
      .groupBy(tags.id, tags.name, tags.color)
      .orderBy(sql`SUM(${timeEntries.durationSeconds}) DESC`)
      .limit(5),

    // 5. Department totals — skipped for personal scope
    scope !== 'personal'
      ? db
          .select({
            departmentId: sql<string>`COALESCE(${workspaceMembers.departmentId}, 'unassigned')`,
            name: sql<string>`COALESCE(${departments.name}, 'Unassigned')`,
            color: sql<string>`COALESCE(${departments.color}, '#94a3b8')`,
            seconds: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)::int`,
            memberCount: sql<number>`COUNT(DISTINCT ${workspaceMembers.id})::int`,
          })
          .from(timeEntries)
          .leftJoin(
            workspaceMembers,
            eq(timeEntries.workspaceMemberId, workspaceMembers.id),
          )
          .leftJoin(
            departments,
            eq(workspaceMembers.departmentId, departments.id),
          )
          .where(whereClause)
          .groupBy(
            sql`COALESCE(${workspaceMembers.departmentId}, 'unassigned')`,
            sql`COALESCE(${departments.name}, 'Unassigned')`,
            sql`COALESCE(${departments.color}, '#94a3b8')`,
          )
          .orderBy(sql`SUM(${timeEntries.durationSeconds}) DESC`)
          .limit(5)
      : Promise.resolve(
          [] as {
            departmentId: string
            name: string
            color: string
            seconds: number
            memberCount: number
          }[],
        ),

    // 6. Top tasks (descriptions) — only for personal scope, at most 8 rows
    selectedScope === 'personal'
      ? db
          .select({
            description: sql<string>`CASE WHEN TRIM(${timeEntries.description}) = '' THEN 'Untitled task' ELSE TRIM(${timeEntries.description}) END`,
            seconds: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)::int`,
            entryCount: sql<number>`COUNT(*)::int`,
          })
          .from(timeEntries)
          .where(whereClause)
          .groupBy(
            sql`CASE WHEN TRIM(${timeEntries.description}) = '' THEN 'Untitled task' ELSE TRIM(${timeEntries.description}) END`,
          )
          .orderBy(sql`SUM(${timeEntries.durationSeconds}) DESC`)
          .limit(8)
      : Promise.resolve(
          [] as {
            description: string
            seconds: number
            entryCount: number
          }[],
        ),

    // 7. Paginated entries for the table — unchanged
    db
      .select({
        id: timeEntries.id,
        description: timeEntries.description,
        startedAt: timeEntries.startedAt,
        durationSeconds: timeEntries.durationSeconds,
        billable: timeEntries.billable,
        projectName: projects.name,
        clientName: clients.name,
        memberEmail: workspaceMembers.email,
        memberUserName: users.name,
      })
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(
        workspaceMembers,
        eq(timeEntries.workspaceMemberId, workspaceMembers.id),
      )
      .leftJoin(users, eq(workspaceMembers.userId, users.id))
      .where(whereClause)
      .orderBy(desc(timeEntries.startedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    // 8. Total entry count for pagination
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(timeEntries)
      .where(whereClause),

    // 9. Active member count (admin/manager scopes only)
    includeActiveMemberCount
      ? db
          .select({ c: sql<number>`count(*)::int` })
          .from(workspaceMembers)
          .where(and(...memberConditions))
      : Promise.resolve(null),
  ])

  // ── Fetch tags for the paginated entries (at most PAGE_SIZE IDs — safe) ───────
  const rawEntryIds = rawRows.map((e) => e.id)
  const rawTagRows =
    rawEntryIds.length > 0
      ? await db
          .select({
            timeEntryId: timeEntryTags.timeEntryId,
            tagName: tags.name,
          })
          .from(timeEntryTags)
          .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
          .where(inArray(timeEntryTags.timeEntryId, rawEntryIds))
      : []

  // ── Build outputs ─────────────────────────────────────────────────────────────
  const totalSeconds = summaryResult[0]?.totalSeconds ?? 0
  const billableSeconds = summaryResult[0]?.billableSeconds ?? 0
  const entriesTotal = countResult[0]?.c ?? 0
  const activeMembers = memberCountResult
    ? (memberCountResult[0]?.c ?? 0)
    : null

  // Daily totals: backfill zeros for dates with no entries
  const dateKeys = buildDateKeys(range.start, range.end)
  const dailySecondsMap = new Map(dateKeys.map((d) => [d, 0]))
  for (const row of dailySqlRows) {
    dailySecondsMap.set(row.date, row.seconds)
  }
  const dailyTotals = dateKeys.map((date) => ({
    date,
    seconds: dailySecondsMap.get(date) ?? 0,
  }))
  const maxDailySeconds = Math.max(0, ...dailyTotals.map((d) => d.seconds))

  // Tags for paginated entries
  const tagNamesByRawEntry = new Map<string, string[]>()
  for (const row of rawTagRows) {
    const list = tagNamesByRawEntry.get(row.timeEntryId) ?? []
    list.push(row.tagName)
    tagNamesByRawEntry.set(row.timeEntryId, list)
  }

  const entryRows: AnalyticsTimeEntryRow[] = rawRows.map((e) => ({
    id: e.id,
    date: toDateKey(e.startedAt),
    memberName: e.memberUserName ?? e.memberEmail ?? '',
    projectName: e.projectName ?? null,
    clientName: e.clientName ?? null,
    tagNames: tagNamesByRawEntry.get(e.id) ?? [],
    description: e.description,
    durationSeconds: e.durationSeconds,
    billable: e.billable,
  }))

  return {
    scope,
    selectedScope,
    availableScopes,
    scopeLabel,
    notice,
    startDate: range.startDate,
    endDate: range.endDate,
    summary: {
      totalSeconds,
      billableSeconds,
      nonBillableSeconds: totalSeconds - billableSeconds,
      entryCount: entriesTotal,
      activeMembers,
    },
    dailyTotals,
    projectTotals: projectSqlRows,
    billableSplit: [
      { label: 'Billable', seconds: billableSeconds },
      { label: 'Non-billable', seconds: totalSeconds - billableSeconds },
    ],
    heatmap: dailyTotals.map((day) => ({
      ...day,
      intensity:
        maxDailySeconds === 0
          ? 0
          : Math.max(1, Math.ceil((day.seconds / maxDailySeconds) * 4)),
    })),
    topTasks: taskSqlRows,
    topTags: tagSqlRows,
    topDepartments: deptSqlRows,
    entries: entryRows,
    entriesTotal,
    permissionLevel: level,
  }
}

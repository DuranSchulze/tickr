import type { z } from 'zod'
import { db } from '#/db'
import {
  timeEntries,
  projects,
  clients,
  tags,
  timeEntryTags,
  workspaceMembers,
  users,
  memberClientBillableRates,
} from '#/db/schema'
import {
  clipWorkInterval,
  splitWorkIntervalByDay,
  summarizeWorkIntervals,
} from '#/lib/time-tracker/work-intervals'
import {
  and,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import {
  buildDateKeys,
  formatDateInTimeZone,
  getWorkspaceDateRange,
  parseDateOnly,
} from './shared/dates'
import type { reportsRangeSchema } from './shared/schemas'
import { resolveEntryRateMap } from './rates.server'
import type { AnalyticsTimeEntryRow } from './analytics.server'

export type ReportsMemberBreakdown = {
  memberId: string
  name: string
  email: string
  totalSeconds: number
  billableSeconds: number
  entryCount: number
  billableAmount: number
  effectiveRate: number
}

export type ReportsPayload = {
  startDate: string
  endDate: string
  summary: {
    totalSeconds: number
    actualSeconds: number
    overlapSeconds: number
    billableSeconds: number
    nonBillableSeconds: number
    entryCount: number
    activeMembers: number
    projectsTouched: number
    billableAmount: number | null
  }
  dailyTotals: Array<{
    date: string
    seconds: number
    billableSeconds: number
    nonBillableSeconds: number
  }>
  memberBreakdown: ReportsMemberBreakdown[]
  entries: AnalyticsTimeEntryRow[]
  entriesTotal: number
  permissionLevel: string
  currency: string
  timezone: string
}

export async function getReports(
  data: z.infer<typeof reportsRangeSchema>,
): Promise<ReportsPayload> {
  const access = await requireWorkspaceAccess()
  const timezone = access.workspace.timezone || 'UTC'
  const range = getWorkspaceDateRange(data, timezone)
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  const departmentId = access.member.departmentId

  const tagIdList = data.tagIds ? data.tagIds.split(',').filter(Boolean) : []
  const memberIdList = data.memberIds
    ? data.memberIds.split(',').filter(Boolean)
    : []

  const entryConditions: SQL[] = [
    eq(timeEntries.workspaceId, access.workspace.id),
    lt(timeEntries.startedAt, range.endExclusive),
    gt(timeEntries.endedAt, range.start),
  ]

  const memberConditions: SQL[] = [
    eq(workspaceMembers.workspaceId, access.workspace.id),
    eq(workspaceMembers.status, 'ACTIVE'),
  ]
  let includeActiveMemberCount = false
  let activeMembers = 0

  // ── Permission scope gating (same as analytics) ──────────────────────────
  if (level === 'OWNER' || level === 'ADMIN') {
    includeActiveMemberCount = true
    // OWNER/ADMIN see workspace-wide data by default
    if (memberIdList.length > 0) {
      entryConditions.push(inArray(timeEntries.workspaceMemberId, memberIdList))
    }
  } else if (level === 'MANAGER' && departmentId) {
    includeActiveMemberCount = true
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
  } else {
    // EMPLOYEE — personal scope
    entryConditions.push(eq(timeEntries.workspaceMemberId, access.member.id))
  }

  // ── Filters ──────────────────────────────────────────────────────────────

  // Status filter
  if (data.status === 'completed') {
    entryConditions.push(isNotNull(timeEntries.endedAt))
  } else if (data.status === 'running') {
    entryConditions.push(isNull(timeEntries.endedAt))
  }
  // 'all' — no filter on endedAt

  // Department filter (additional to scope gating)
  if (data.departmentId) {
    entryConditions.push(
      inArray(
        timeEntries.workspaceMemberId,
        db
          .select({ id: workspaceMembers.id })
          .from(workspaceMembers)
          .where(eq(workspaceMembers.departmentId, data.departmentId)),
      ),
    )
  }

  // Client filter
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

  // Project filter
  if (data.projectId) {
    entryConditions.push(eq(timeEntries.projectId, data.projectId))
  }

  // Task filter
  if (data.taskId) {
    entryConditions.push(eq(timeEntries.taskId, data.taskId))
  }

  // Tag filter
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

  // Description text search (ILIKE)
  if (data.description && data.description.trim().length > 0) {
    entryConditions.push(
      ilike(timeEntries.description, `%${data.description.trim()}%`),
    )
  }

  // Billable filter
  if (data.billable === 'true')
    entryConditions.push(eq(timeEntries.billable, true))
  if (data.billable === 'false')
    entryConditions.push(eq(timeEntries.billable, false))

  const page = Math.max(1, data.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, data.pageSize ?? 50))
  const whereClause = and(...entryConditions)

  const defaultRate = Number(access.workspace.defaultBillableRate ?? 0)

  // Seconds clipped to the requested range so range-edge entries contribute
  // the same amounts here as in the entries table.
  const rangeStartIso = range.start.toISOString()
  const rangeEndExclusiveIso = range.endExclusive.toISOString()
  const clippedSecondsSql = sql`GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (LEAST(${timeEntries.endedAt}, ${rangeEndExclusiveIso}::timestamptz) - GREATEST(${timeEntries.startedAt}, ${rangeStartIso}::timestamptz)))))`

  // Effective-rate resolution matching resolveEntryRateMap:
  // member-client rate → client default → member rate → workspace default.
  const memberClientRateJoin = and(
    eq(memberClientBillableRates.workspaceId, timeEntries.workspaceId),
    eq(
      memberClientBillableRates.workspaceMemberId,
      timeEntries.workspaceMemberId,
    ),
    eq(memberClientBillableRates.clientId, projects.clientId),
    sql`${memberClientBillableRates.effectiveFrom} <= date(${timeEntries.startedAt})`,
    sql`(${memberClientBillableRates.effectiveTo} is null or ${memberClientBillableRates.effectiveTo} >= date(${timeEntries.startedAt}))`,
  )
  const effectiveRateSql = sql`coalesce(${memberClientBillableRates.billableRate}::numeric, ${clients.defaultBillableRate}::numeric, ${workspaceMembers.billableRate}::numeric, ${defaultRate})`
  const clippedTotalSecondsSql = sql<number>`coalesce(sum(case when ${timeEntries.endedAt} is not null then ${clippedSecondsSql} else 0 end), 0)::int`
  const clippedBillableSecondsSql = sql<number>`coalesce(sum(case when ${timeEntries.billable} = true and ${timeEntries.endedAt} is not null then ${clippedSecondsSql} else 0 end), 0)::int`
  const billableAmountSql = sql<number>`coalesce(sum(case when ${timeEntries.billable} = true and ${timeEntries.endedAt} is not null then ${clippedSecondsSql}::numeric / 3600.0 * ${effectiveRateSql} else 0 end), 0)::float8`

  // ── Run all queries in parallel ──────────────────────────────────────────
  const [
    summaryRows,
    rawRows,
    countResult,
    memberCountResult,
    memberBreakdownRows,
    summaryAmountResult,
  ] = await Promise.all([
    // 1. Complete intervals for tracked vs actual time
    db
      .select({
        memberId: timeEntries.workspaceMemberId,
        startedAt: timeEntries.startedAt,
        endedAt: timeEntries.endedAt,
        billable: timeEntries.billable,
      })
      .from(timeEntries)
      .where(whereClause),

    // 2. Paginated entries for the table
    db
      .select({
        id: timeEntries.id,
        workspaceMemberId: timeEntries.workspaceMemberId,
        description: timeEntries.description,
        projectId: timeEntries.projectId,
        taskId: timeEntries.taskId,
        startedAt: timeEntries.startedAt,
        endedAt: timeEntries.endedAt,
        durationSeconds: timeEntries.durationSeconds,
        billable: timeEntries.billable,
        notes: timeEntries.notes,
        projectName: projects.name,
        clientId: projects.clientId,
        clientName: clients.name,
        memberEmail: workspaceMembers.email,
        memberUserName: users.name,
        memberImage: users.image,
        memberBillableRate: workspaceMembers.billableRate,
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
      .limit(pageSize)
      .offset((page - 1) * pageSize),

    // 3. Total entry count for pagination
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(timeEntries)
      .where(whereClause),

    // 4. Active member count
    includeActiveMemberCount
      ? db
          .select({ c: sql<number>`count(*)::int` })
          .from(workspaceMembers)
          .where(and(...memberConditions))
      : Promise.resolve(null),

    // 5. Member breakdown — per-member stats grouped by workspaceMemberId,
    //    with the effective-rate cascade for billable amounts.
    db
      .select({
        workspaceMemberId: timeEntries.workspaceMemberId,
        totalSeconds: clippedTotalSecondsSql,
        billableSeconds: clippedBillableSecondsSql,
        billableAmount: billableAmountSql,
        entryCount: sql<number>`COUNT(*)::int`,
        memberName: users.name,
        memberEmail: workspaceMembers.email,
      })
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(
        workspaceMembers,
        eq(timeEntries.workspaceMemberId, workspaceMembers.id),
      )
      .leftJoin(users, eq(workspaceMembers.userId, users.id))
      .leftJoin(memberClientBillableRates, memberClientRateJoin)
      .where(whereClause)
      .groupBy(
        timeEntries.workspaceMemberId,
        users.name,
        workspaceMembers.email,
      )
      .orderBy(sql`SUM(${timeEntries.durationSeconds}) DESC`),

    // 6. Full-range billable amount (the entries table only shows one page).
    db
      .select({ billableAmount: billableAmountSql })
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(
        workspaceMembers,
        eq(timeEntries.workspaceMemberId, workspaceMembers.id),
      )
      .leftJoin(memberClientBillableRates, memberClientRateJoin)
      .where(whereClause),
  ])

  // Distinct projects touched
  const projectsTouched = await db
    .select({
      c: sql<number>`COUNT(DISTINCT ${timeEntries.projectId})::int`,
    })
    .from(timeEntries)
    .where(whereClause)
    .then((rows) => rows[0]?.c ?? 0)

  // ── Fetch tags for the paginated entries ─────────────────────────────────
  const rawEntryIds = rawRows.map((e) => e.id)
  const rawTagRows =
    rawEntryIds.length > 0
      ? await db
          .select({
            timeEntryId: timeEntryTags.timeEntryId,
            tagId: tags.id,
            tagName: tags.name,
          })
          .from(timeEntryTags)
          .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
          .where(inArray(timeEntryTags.timeEntryId, rawEntryIds))
      : []

  // ── Build outputs ────────────────────────────────────────────────────────
  const workSummary = summarizeWorkIntervals(
    summaryRows.map((entry) => ({
      memberId: entry.memberId,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
    })),
    range.start,
    range.endExclusive,
  )
  const totalSeconds = workSummary.totalSeconds
  const billableSeconds = summaryRows.reduce((sum, entry) => {
    if (!entry.billable) return sum
    return (
      sum +
      (clipWorkInterval(
        {
          memberId: entry.memberId,
          startedAt: entry.startedAt,
          endedAt: entry.endedAt,
        },
        range.start,
        range.endExclusive,
      )?.seconds ?? 0)
    )
  }, 0)
  const entriesTotal = countResult[0]?.c ?? 0
  activeMembers = memberCountResult ? (memberCountResult[0]?.c ?? 0) : 0

  // Daily totals: backfill zeros for dates with no entries
  const dateKeys = buildDateKeys(
    parseDateOnly(range.startDate),
    parseDateOnly(range.endDate),
  )
  const dailySecondsMap = new Map(dateKeys.map((d) => [d, 0]))
  const dailyBillableMap = new Map(dateKeys.map((d) => [d, 0]))
  for (const row of summaryRows) {
    const slices = splitWorkIntervalByDay(
      {
        memberId: row.memberId,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
      },
      range.start,
      range.endExclusive,
      timezone,
    )
    for (const slice of slices) {
      dailySecondsMap.set(
        slice.date,
        (dailySecondsMap.get(slice.date) ?? 0) + slice.seconds,
      )
      if (row.billable) {
        dailyBillableMap.set(
          slice.date,
          (dailyBillableMap.get(slice.date) ?? 0) + slice.seconds,
        )
      }
    }
  }
  const dailyTotals = dateKeys.map((date) => {
    const seconds = dailySecondsMap.get(date) ?? 0
    const billable = dailyBillableMap.get(date) ?? 0
    return {
      date,
      seconds,
      billableSeconds: billable,
      nonBillableSeconds: seconds - billable,
    }
  })

  // Tags for paginated entries
  const tagNamesByRawEntry = new Map<string, string[]>()
  const tagIdsByRawEntry = new Map<string, string[]>()
  for (const row of rawTagRows) {
    const names = tagNamesByRawEntry.get(row.timeEntryId) ?? []
    names.push(row.tagName)
    tagNamesByRawEntry.set(row.timeEntryId, names)
    const ids = tagIdsByRawEntry.get(row.timeEntryId) ?? []
    ids.push(row.tagId)
    tagIdsByRawEntry.set(row.timeEntryId, ids)
  }

  const currency = access.workspace.billableCurrency ?? 'PHP'
  const memberRateById = new Map(
    rawRows.map((entry) => [
      entry.workspaceMemberId,
      entry.memberBillableRate ? Number(entry.memberBillableRate) : null,
    ]),
  )
  const entryRateMap = await resolveEntryRateMap({
    workspaceId: access.workspace.id,
    defaultRate,
    memberRateById,
    entries: rawRows.map((entry) => ({
      id: entry.id,
      workspaceMemberId: entry.workspaceMemberId,
      clientId: entry.clientId ?? null,
      date: entry.startedAt,
    })),
  })

  const entryRows: AnalyticsTimeEntryRow[] = rawRows.map((e) => {
    const effectiveRate = entryRateMap.get(e.id)?.effectiveRate ?? defaultRate
    const clipped = clipWorkInterval(
      {
        memberId: e.workspaceMemberId,
        startedAt: e.startedAt,
        endedAt: e.endedAt,
      },
      range.start,
      range.endExclusive,
    )
    const displaySeconds = clipped?.seconds ?? 0
    const displayStartedAt = clipped?.startedAt ?? e.startedAt
    const displayEndedAt = clipped?.endedAt ?? e.endedAt
    const billableAmount = e.billable
      ? (displaySeconds / 3600) * effectiveRate
      : null
    return {
      id: e.id,
      workspaceMemberId: e.workspaceMemberId,
      date: formatDateInTimeZone(displayStartedAt, timezone),
      memberName: e.memberUserName ?? e.memberEmail ?? '',
      memberImage: e.memberImage ?? null,
      projectId: e.projectId ?? '',
      taskId: e.taskId ?? null,
      projectName: e.projectName ?? null,
      clientName: e.clientName ?? null,
      tagIds: tagIdsByRawEntry.get(e.id) ?? [],
      tagNames: tagNamesByRawEntry.get(e.id) ?? [],
      description: e.description,
      startedAt: displayStartedAt.toISOString(),
      endedAt: displayEndedAt?.toISOString() ?? null,
      durationSeconds: displaySeconds,
      billable: e.billable,
      notes: e.notes ?? '',
      billableAmount,
      effectiveRate: e.billable ? effectiveRate : null,
    }
  })

  // Full-range billable amount from the rate-cascade aggregate (the entry
  // rows above only cover the current page).
  const summaryBillableAmount = summaryAmountResult[0]?.billableAmount ?? 0

  // Build member breakdown — amounts come from the SQL rate cascade, so the
  // effective rate shown is the blended rate actually earned in the range.
  const memberBreakdown: ReportsMemberBreakdown[] = memberBreakdownRows.map(
    (row) => {
      const billableHours = row.billableSeconds / 3600
      return {
        memberId: row.workspaceMemberId,
        name: row.memberName ?? row.memberEmail ?? '',
        email: row.memberEmail ?? '',
        totalSeconds: row.totalSeconds,
        billableSeconds: row.billableSeconds,
        entryCount: row.entryCount,
        billableAmount: row.billableAmount,
        effectiveRate:
          billableHours > 0 ? row.billableAmount / billableHours : 0,
      }
    },
  )

  return {
    startDate: range.startDate,
    endDate: range.endDate,
    summary: {
      totalSeconds,
      actualSeconds: workSummary.actualSeconds,
      overlapSeconds: workSummary.overlapSeconds,
      billableSeconds,
      nonBillableSeconds: totalSeconds - billableSeconds,
      entryCount: entriesTotal,
      activeMembers,
      projectsTouched,
      billableAmount: summaryBillableAmount > 0 ? summaryBillableAmount : null,
    },
    dailyTotals,
    memberBreakdown,
    entries: entryRows,
    entriesTotal,
    permissionLevel: level,
    currency,
    timezone,
  }
}

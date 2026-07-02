import '@tanstack/react-start/server-only'
import { db } from '#/db'
import {
  timeEntries,
  timeEntryTags,
  tags,
  projects,
  projectTasks,
  clients,
  workspaceMembers,
  users,
  workspaces,
} from '#/db/schema'
import {
  and,
  asc,
  eq,
  gt,
  lt,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import {
  clipWorkInterval,
  summarizeWorkIntervals,
} from '#/lib/time-tracker/work-intervals'
import { formatDateInTimeZone, getWorkspaceDateRange } from './shared/dates'
import { resolveEntryRateMap } from './rates.server'
import { sortReportEntries } from './report-sort.server'
import type {
  ExportSortBy,
  ExportSortOrder,
} from '#/lib/time-tracker/export-sort'
import type { ExportOngoingTaskSummary } from '#/lib/time-tracker/export-ongoing-tasks'

export type MemberMonthlyReportEntry = {
  id: string
  date: string
  startedAt: string
  endedAt: string
  projectName: string | null
  clientName: string | null
  taskName: string | null
  tagNames: string[]
  description: string
  durationSeconds: number
  billable: boolean
  effectiveRate: number
  billableAmount: number | null
}

export type MemberMonthlyReport = {
  memberId: string
  memberName: string
  memberEmail: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  currency: string
  timezone: string
  entries: MemberMonthlyReportEntry[]
  summary: {
    totalSeconds: number
    actualSeconds: number
    overlapSeconds: number
    billableSeconds: number
    nonBillableSeconds: number
    entryCount: number
    totalBillableAmount: number
  }
}

type MemberMonthlyReportInput = {
  memberId: string
  startDate: string
  endDate: string
  sortBy?: ExportSortBy
  sortOrder?: ExportSortOrder
}

async function assertMemberReportAccess(data: MemberMonthlyReportInput) {
  const access = await requireWorkspaceAccess()
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  const currentMemberId = access.member.id

  if (level === 'EMPLOYEE' && data.memberId !== currentMemberId) {
    throw new Error('You can only export your own time entries.')
  }

  if (level === 'MANAGER' && data.memberId !== currentMemberId) {
    const [targetMember] = await db
      .select({ departmentId: workspaceMembers.departmentId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.id, data.memberId),
          eq(workspaceMembers.workspaceId, access.workspace.id),
        ),
      )
      .limit(1)

    if (!targetMember) {
      throw new Error('Member not found in this workspace.')
    }

    if (targetMember.departmentId !== access.member.departmentId) {
      throw new Error(
        'You can only export time entries for members in your department.',
      )
    }
  }

  return access
}

export async function getMemberReportOngoingTaskSummary(
  data: MemberMonthlyReportInput,
): Promise<ExportOngoingTaskSummary> {
  const access = await assertMemberReportAccess(data)
  const timezone = access.workspace.timezone || 'UTC'
  const range = getWorkspaceDateRange(data, timezone)

  const entryConditions = [
    eq(timeEntries.workspaceId, access.workspace.id),
    eq(timeEntries.workspaceMemberId, data.memberId),
    isNull(timeEntries.endedAt),
    lt(timeEntries.startedAt, range.endExclusive),
  ]

  const [summary] = await db
    .select({
      count: sql<number>`count(${timeEntries.id})::int`,
      memberCount: sql<number>`count(distinct ${timeEntries.workspaceMemberId})::int`,
    })
    .from(timeEntries)
    .where(and(...entryConditions))

  const examples = await db
    .select({
      id: timeEntries.id,
      memberName: users.name,
      memberEmail: workspaceMembers.email,
      startedAt: timeEntries.startedAt,
      projectName: projects.name,
      clientName: clients.name,
      taskName: projectTasks.name,
      description: timeEntries.description,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(projectTasks, eq(timeEntries.taskId, projectTasks.id))
    .leftJoin(
      workspaceMembers,
      eq(timeEntries.workspaceMemberId, workspaceMembers.id),
    )
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .where(and(...entryConditions))
    .orderBy(asc(timeEntries.startedAt), asc(timeEntries.id))
    .limit(5)

  return {
    count: summary?.count ?? 0,
    memberCount: summary?.memberCount ?? 0,
    examples: examples.map((entry) => ({
      id: entry.id,
      memberName: entry.memberName ?? entry.memberEmail ?? 'Unknown',
      startedAt: entry.startedAt.toISOString(),
      projectName: entry.projectName ?? null,
      clientName: entry.clientName ?? null,
      taskName: entry.taskName ?? null,
      description: entry.description,
    })),
  }
}

/**
 * Returns a monthly time-entry report for a specific member.
 * - OWNER/ADMIN: can target any member in the workspace
 * - MANAGER: can only target members in their own department (or themselves)
 * - EMPLOYEE: can only target themselves
 */
export async function getMemberMonthlyReport(
  data: MemberMonthlyReportInput,
): Promise<MemberMonthlyReport> {
  const access = await assertMemberReportAccess(data)

  const timezone = access.workspace.timezone || 'UTC'
  const range = getWorkspaceDateRange(data, timezone)

  // Get workspace defaults
  const [workspaceRow] = await db
    .select({
      defaultBillableRate: workspaces.defaultBillableRate,
      billableCurrency: workspaces.billableCurrency,
    })
    .from(workspaces)
    .where(eq(workspaces.id, access.workspace.id))
    .limit(1)

  const defaultRate = workspaceRow
    ? Number(workspaceRow.defaultBillableRate)
    : 0
  const currency = workspaceRow?.billableCurrency ?? 'PHP'

  const [memberRow] = await db
    .select({
      name: users.name,
      email: workspaceMembers.email,
      billableRate: workspaceMembers.billableRate,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .where(
      and(
        eq(workspaceMembers.id, data.memberId),
        eq(workspaceMembers.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)

  if (!memberRow) {
    throw new Error('Member not found.')
  }

  // Fetch completed time entries for the month
  const rawEntries = await db
    .select({
      id: timeEntries.id,
      description: timeEntries.description,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
      durationSeconds: timeEntries.durationSeconds,
      billable: timeEntries.billable,
      projectName: projects.name,
      clientId: projects.clientId,
      clientName: clients.name,
      taskName: projectTasks.name,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(projectTasks, eq(timeEntries.taskId, projectTasks.id))
    .where(
      and(
        eq(timeEntries.workspaceId, access.workspace.id),
        eq(timeEntries.workspaceMemberId, data.memberId),
        isNotNull(timeEntries.endedAt),
        lt(timeEntries.startedAt, range.endExclusive),
        gt(timeEntries.endedAt, range.start),
      ),
    )
    .orderBy(asc(timeEntries.startedAt), asc(timeEntries.id))

  // Fetch tags for all returned entries
  const entryIds = rawEntries.map((e) => e.id)
  const tagRows =
    entryIds.length > 0
      ? await db
          .select({
            timeEntryId: timeEntryTags.timeEntryId,
            tagName: tags.name,
          })
          .from(timeEntryTags)
          .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
          .where(inArray(timeEntryTags.timeEntryId, entryIds))
      : []

  const tagsByEntry = new Map<string, string[]>()
  for (const row of tagRows) {
    const list = tagsByEntry.get(row.timeEntryId) ?? []
    list.push(row.tagName)
    tagsByEntry.set(row.timeEntryId, list)
  }

  const entryRateMap = await resolveEntryRateMap({
    workspaceId: access.workspace.id,
    defaultRate,
    memberRateById: new Map([
      [
        data.memberId,
        memberRow.billableRate ? Number(memberRow.billableRate) : null,
      ],
    ]),
    entries: rawEntries.map((entry) => ({
      id: entry.id,
      workspaceMemberId: data.memberId,
      clientId: entry.clientId ?? null,
      date: entry.startedAt,
    })),
  })

  let totalSeconds = 0
  let billableSeconds = 0
  let totalBillableAmount = 0

  const entries: MemberMonthlyReportEntry[] = rawEntries.flatMap((e) => {
    const clipped = clipWorkInterval(
      {
        memberId: data.memberId,
        startedAt: e.startedAt,
        endedAt: e.endedAt,
      },
      range.start,
      range.endExclusive,
    )
    if (!clipped) return []
    const hours = clipped.seconds / 3600
    const effectiveRate = entryRateMap.get(e.id)?.effectiveRate ?? defaultRate
    const billableAmount = e.billable ? hours * effectiveRate : null

    totalSeconds += clipped.seconds
    if (e.billable) {
      billableSeconds += clipped.seconds
      if (billableAmount) totalBillableAmount += billableAmount
    }

    return [
      {
        id: e.id,
        date: formatDateInTimeZone(clipped.startedAt, timezone),
        startedAt: clipped.startedAt.toISOString(),
        endedAt: clipped.endedAt.toISOString(),
        projectName: e.projectName ?? null,
        clientName: e.clientName ?? null,
        taskName: e.taskName ?? null,
        tagNames: tagsByEntry.get(e.id) ?? [],
        description: e.description,
        durationSeconds: clipped.seconds,
        billable: e.billable,
        effectiveRate,
        billableAmount,
      },
    ]
  })

  sortReportEntries(entries, data.sortBy, data.sortOrder)

  const workSummary = summarizeWorkIntervals(
    entries.map((entry) => ({
      memberId: data.memberId,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
    })),
    range.start,
    range.endExclusive,
  )

  return {
    memberId: data.memberId,
    memberName: memberRow.name ?? memberRow.email,
    memberEmail: memberRow.email,
    startDate: data.startDate,
    endDate: data.endDate,
    currency,
    timezone,
    entries,
    summary: {
      totalSeconds,
      actualSeconds: workSummary.actualSeconds,
      overlapSeconds: workSummary.overlapSeconds,
      billableSeconds,
      nonBillableSeconds: totalSeconds - billableSeconds,
      entryCount: entries.length,
      totalBillableAmount,
    },
  }
}

import '@tanstack/react-start/server-only'
import { db } from '#/db'
import {
  workspaces,
  workspaceMembers,
  users,
  departments,
  timeEntries,
  projectTasks,
  projects,
  clients,
  tags,
  timeEntryTags,
} from '#/db/schema'
import { and, asc, eq, gt, inArray, isNotNull, lt } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { createAuditLog } from './audit/audit-logger.server'
import { formatDateInTimeZone, getWorkspaceDateRange } from './shared/dates'
import {
  clipWorkInterval,
  summarizeWorkIntervals,
} from '#/lib/time-tracker/work-intervals'
import { resolveEntryRateMap } from './rates.server'
import { sortReportEntries } from './report-sort.server'
import type {
  ExportSortBy,
  ExportSortOrder,
} from '#/lib/time-tracker/export-sort'

export type BulkReportScopeType = 'all' | 'client' | 'department' | 'tag'

export type BulkReportEntry = {
  id: string
  date: string // YYYY-MM-DD
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

export type BulkReportGroup = {
  key: string
  label: string // member name
  email: string
  entries: BulkReportEntry[]
  subtotal: {
    totalSeconds: number
    actualSeconds: number
    overlapSeconds: number
    billableSeconds: number
    billableAmount: number
    entryCount: number
  }
}

export type BulkReport = {
  scopeType: BulkReportScopeType
  scopeLabel: string
  startDate: string
  endDate: string
  currency: string
  timezone: string
  groups: BulkReportGroup[]
  summary: {
    totalSeconds: number
    actualSeconds: number
    overlapSeconds: number
    billableSeconds: number
    nonBillableSeconds: number
    billableAmount: number
    entryCount: number
  }
}

/**
 * Builds a bulk time report across many members/entries, grouped by member,
 * for a single scope (everything, one client, one department, or one tag).
 *
 * Role-scoped, mirroring the analytics export:
 * - OWNER/ADMIN: the whole workspace
 * - MANAGER: their department only (scope filter is applied on top)
 * - EMPLOYEE: their own entries only
 */
export async function getBulkReport(data: {
  startDate: string
  endDate: string
  scopeType: BulkReportScopeType
  scopeId?: string
  memberId?: string
  clientId?: string
  sortBy?: ExportSortBy
  sortOrder?: ExportSortOrder
}): Promise<BulkReport> {
  const access = await requireWorkspaceAccess()
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  const timezone = access.workspace.timezone || 'UTC'
  const range = getWorkspaceDateRange(data, timezone)

  const entryConditions: SQL[] = [
    eq(timeEntries.workspaceId, access.workspace.id),
    isNotNull(timeEntries.endedAt),
    lt(timeEntries.startedAt, range.endExclusive),
    gt(timeEntries.endedAt, range.start),
  ]

  // Role-based member restriction.
  if (level === 'OWNER' || level === 'ADMIN') {
    // no restriction
  } else if (level === 'MANAGER' && access.member.departmentId) {
    const deptMemberIds = db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.departmentId, access.member.departmentId))
    entryConditions.push(inArray(timeEntries.workspaceMemberId, deptMemberIds))
  } else {
    entryConditions.push(eq(timeEntries.workspaceMemberId, access.member.id))
  }

  // Scope filter + label.
  let scopeLabel = 'All workspace activity'
  if (data.scopeType === 'client' && data.scopeId) {
    const projectIdsWithClient = db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.clientId, data.scopeId))
    entryConditions.push(inArray(timeEntries.projectId, projectIdsWithClient))
    const [client] = await db
      .select({ name: clients.name })
      .from(clients)
      .where(eq(clients.id, data.scopeId))
      .limit(1)
    scopeLabel = `Client: ${client?.name ?? 'Unknown'}`
  } else if (data.scopeType === 'department' && data.scopeId) {
    const deptMemberIds = db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.departmentId, data.scopeId))
    entryConditions.push(inArray(timeEntries.workspaceMemberId, deptMemberIds))
    const [dept] = await db
      .select({ name: departments.name })
      .from(departments)
      .where(eq(departments.id, data.scopeId))
      .limit(1)
    scopeLabel = `Department: ${dept?.name ?? 'Unknown'}`
  } else if (data.scopeType === 'tag' && data.scopeId) {
    const entryIdsWithTag = db
      .select({ timeEntryId: timeEntryTags.timeEntryId })
      .from(timeEntryTags)
      .where(eq(timeEntryTags.tagId, data.scopeId))
    entryConditions.push(inArray(timeEntries.id, entryIdsWithTag))
    const [tag] = await db
      .select({ name: tags.name })
      .from(tags)
      .where(eq(tags.id, data.scopeId))
      .limit(1)
    scopeLabel = `Tag: ${tag?.name ?? 'Unknown'}`
  }

  const filterLabels: string[] = []
  if (data.memberId) {
    entryConditions.push(eq(timeEntries.workspaceMemberId, data.memberId))
    const [member] = await db
      .select({
        name: users.name,
        email: workspaceMembers.email,
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
    filterLabels.push(`Member: ${member?.name ?? member?.email ?? 'Unknown'}`)
  }

  if (data.clientId && data.scopeType !== 'client') {
    const projectIdsWithClient = db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.clientId, data.clientId))
    entryConditions.push(inArray(timeEntries.projectId, projectIdsWithClient))
    const [client] = await db
      .select({ name: clients.name })
      .from(clients)
      .where(eq(clients.id, data.clientId))
      .limit(1)
    filterLabels.push(`Client: ${client?.name ?? 'Unknown'}`)
  }

  if (filterLabels.length > 0) {
    scopeLabel = `${scopeLabel} · ${filterLabels.join(' · ')}`
  }

  // Workspace billing defaults.
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
      memberId: timeEntries.workspaceMemberId,
      memberEmail: workspaceMembers.email,
      memberUserName: users.name,
      memberRate: workspaceMembers.billableRate,
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

  // Tags for all returned entries.
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

  // Group by member.
  const groupMap = new Map<string, BulkReportGroup>()
  let totalSeconds = 0
  let billableSeconds = 0
  let billableAmount = 0
  const memberRateById = new Map(
    rawEntries.map((entry) => [
      entry.memberId,
      entry.memberRate ? Number(entry.memberRate) : null,
    ]),
  )
  const entryRateMap = await resolveEntryRateMap({
    workspaceId: access.workspace.id,
    defaultRate,
    memberRateById,
    entries: rawEntries.map((entry) => ({
      id: entry.id,
      workspaceMemberId: entry.memberId,
      clientId: entry.clientId ?? null,
      date: entry.startedAt,
    })),
  })

  for (const e of rawEntries) {
    const key = e.memberId
    let group = groupMap.get(key)
    if (!group) {
      group = {
        key,
        label: e.memberUserName ?? e.memberEmail ?? 'Unknown',
        email: e.memberEmail ?? '',
        entries: [],
        subtotal: {
          totalSeconds: 0,
          actualSeconds: 0,
          overlapSeconds: 0,
          billableSeconds: 0,
          billableAmount: 0,
          entryCount: 0,
        },
      }
      groupMap.set(key, group)
    }

    const effectiveRate = entryRateMap.get(e.id)?.effectiveRate ?? defaultRate
    const clipped = clipWorkInterval(
      {
        memberId: e.memberId,
        startedAt: e.startedAt,
        endedAt: e.endedAt,
      },
      range.start,
      range.endExclusive,
    )
    if (!clipped) continue
    const hours = clipped.seconds / 3600
    const amount = e.billable ? hours * effectiveRate : null

    group.entries.push({
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
      billableAmount: amount,
    })

    group.subtotal.totalSeconds += clipped.seconds
    group.subtotal.entryCount++
    totalSeconds += clipped.seconds
    if (e.billable) {
      group.subtotal.billableSeconds += clipped.seconds
      billableSeconds += clipped.seconds
      if (amount) {
        group.subtotal.billableAmount += amount
        billableAmount += amount
      }
    }
  }

  const groups = Array.from(groupMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  )
  for (const group of groups) {
    sortReportEntries(group.entries, data.sortBy, data.sortOrder)
    const groupSummary = summarizeWorkIntervals(
      group.entries.map((entry) => ({
        memberId: group.key,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
      })),
      range.start,
      range.endExclusive,
    )
    group.subtotal.actualSeconds = groupSummary.actualSeconds
    group.subtotal.overlapSeconds = groupSummary.overlapSeconds
  }
  const workSummary = summarizeWorkIntervals(
    groups.flatMap((group) =>
      group.entries.map((entry) => ({
        memberId: group.key,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
      })),
    ),
    range.start,
    range.endExclusive,
  )

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'EXPORT_BULK_REPORT',
    targetType: 'workspace',
    targetId: access.workspace.id,
    details: `${scopeLabel} · ${range.startDate} → ${range.endDate}`,
  })

  return {
    scopeType: data.scopeType,
    scopeLabel,
    startDate: range.startDate,
    endDate: range.endDate,
    currency,
    timezone,
    groups,
    summary: {
      totalSeconds,
      actualSeconds: workSummary.actualSeconds,
      overlapSeconds: workSummary.overlapSeconds,
      billableSeconds,
      nonBillableSeconds: totalSeconds - billableSeconds,
      billableAmount,
      entryCount: groups.reduce(
        (count, group) => count + group.subtotal.entryCount,
        0,
      ),
    },
  }
}

import '@tanstack/react-start/server-only'
import { db } from '#/db'
import {
  workspaces,
  workspaceMembers,
  users,
  departments,
  timeEntries,
  projects,
  clients,
  tags,
  timeEntryTags,
} from '#/db/schema'
import { and, asc, eq, inArray, isNotNull, gte, lt } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { createAuditLog } from './audit/audit-logger.server'
import { getAnalyticsDateRange } from './shared/dates'
import { computeEffectiveRate } from '#/lib/time-tracker/billing'

export type BulkReportScopeType = 'all' | 'client' | 'department' | 'tag'

export type BulkReportEntry = {
  id: string
  date: string // YYYY-MM-DD
  projectName: string | null
  clientName: string | null
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
  groups: BulkReportGroup[]
  summary: {
    totalSeconds: number
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
}): Promise<BulkReport> {
  const access = await requireWorkspaceAccess()
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  const range = getAnalyticsDateRange(data)

  const entryConditions: SQL[] = [
    eq(timeEntries.workspaceId, access.workspace.id),
    isNotNull(timeEntries.endedAt),
    gte(timeEntries.startedAt, range.start),
    lt(timeEntries.startedAt, range.endExclusive),
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
      durationSeconds: timeEntries.durationSeconds,
      billable: timeEntries.billable,
      projectName: projects.name,
      clientName: clients.name,
      memberId: timeEntries.workspaceMemberId,
      memberEmail: workspaceMembers.email,
      memberUserName: users.name,
      memberRate: workspaceMembers.billableRate,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(
      workspaceMembers,
      eq(timeEntries.workspaceMemberId, workspaceMembers.id),
    )
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .where(and(...entryConditions))
    .orderBy(asc(timeEntries.startedAt))

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

  const pad = (n: number) => String(n).padStart(2, '0')
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  // Group by member.
  const groupMap = new Map<string, BulkReportGroup>()
  let totalSeconds = 0
  let billableSeconds = 0
  let billableAmount = 0

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
          billableSeconds: 0,
          billableAmount: 0,
          entryCount: 0,
        },
      }
      groupMap.set(key, group)
    }

    const effectiveRate = computeEffectiveRate(
      e.memberRate ? Number(e.memberRate) : null,
      defaultRate,
    )
    const hours = e.durationSeconds / 3600
    const amount = e.billable ? hours * effectiveRate : null

    group.entries.push({
      id: e.id,
      date: fmtDate(e.startedAt),
      projectName: e.projectName ?? null,
      clientName: e.clientName ?? null,
      tagNames: tagsByEntry.get(e.id) ?? [],
      description: e.description,
      durationSeconds: e.durationSeconds,
      billable: e.billable,
      effectiveRate,
      billableAmount: amount,
    })

    group.subtotal.totalSeconds += e.durationSeconds
    group.subtotal.entryCount++
    totalSeconds += e.durationSeconds
    if (e.billable) {
      group.subtotal.billableSeconds += e.durationSeconds
      billableSeconds += e.durationSeconds
      if (amount) {
        group.subtotal.billableAmount += amount
        billableAmount += amount
      }
    }
  }

  const groups = Array.from(groupMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
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
    groups,
    summary: {
      totalSeconds,
      billableSeconds,
      nonBillableSeconds: totalSeconds - billableSeconds,
      billableAmount,
      entryCount: rawEntries.length,
    },
  }
}

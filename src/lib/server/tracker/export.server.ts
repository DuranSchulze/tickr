import '@tanstack/react-start/server-only'
import type { z } from 'zod'
import { db } from '#/db'
import {
  workspaces,
  workspaceMembers,
  users,
  timeEntries,
  projects,
  clients,
  tags,
  timeEntryTags,
} from '#/db/schema'
import { and, desc, eq, gt, inArray, isNotNull, lt } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { createAuditLog } from './audit/audit-logger.server'
import { formatDateTimeInTimeZone, getWorkspaceDateRange } from './shared/dates'
import type { analyticsRangeSchema } from './shared/schemas'
import {
  splitWorkIntervalByDay,
  summarizeWorkIntervals,
} from '#/lib/time-tracker/work-intervals'
import {
  buildCsv,
  formatDecimalRate,
  formatHms,
} from '#/lib/time-tracker/export-utils'
import { resolveEntryRateMap } from './rates.server'

export async function exportAnalyticsCsv(
  data: z.infer<typeof analyticsRangeSchema>,
): Promise<string> {
  const access = await requireWorkspaceAccess()
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  const timezone = access.workspace.timezone || 'UTC'
  const range = getWorkspaceDateRange(data, timezone)

  const tagIdList = data.tagIds ? data.tagIds.split(',').filter(Boolean) : []
  const memberIdList = data.memberIds
    ? data.memberIds.split(',').filter(Boolean)
    : []

  const departmentId = access.member.departmentId
  const defaultScope =
    level === 'OWNER' || level === 'ADMIN'
      ? 'organization'
      : level === 'MANAGER'
        ? 'department'
        : 'personal'
  const requestedScope = data.scope ?? defaultScope

  // Build entry where conditions
  const entryConditions: SQL[] = [
    eq(timeEntries.workspaceId, access.workspace.id),
    isNotNull(timeEntries.endedAt),
    lt(timeEntries.startedAt, range.endExclusive),
    gt(timeEntries.endedAt, range.start),
  ]

  // Scope filtering
  if (
    (level === 'OWNER' || level === 'ADMIN') &&
    requestedScope === 'organization'
  ) {
    if (memberIdList.length > 0) {
      entryConditions.push(inArray(timeEntries.workspaceMemberId, memberIdList))
    }
    // no restriction — all org entries
  } else if (
    level === 'MANAGER' &&
    requestedScope === 'department' &&
    departmentId
  ) {
    // Filter by members in the same department via subquery
    const deptMemberIds = db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.departmentId, departmentId))
    entryConditions.push(inArray(timeEntries.workspaceMemberId, deptMemberIds))
  } else {
    // Personal or fallback
    entryConditions.push(eq(timeEntries.workspaceMemberId, access.member.id))
  }

  if (data.projectId) {
    entryConditions.push(eq(timeEntries.projectId, data.projectId))
  }

  if (data.clientId) {
    // Filter via project join — need to include clientId condition on projects
    // Done via subquery
    const projectIdsWithClient = db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.clientId, data.clientId))
    entryConditions.push(inArray(timeEntries.projectId, projectIdsWithClient))
  }

  if (tagIdList.length > 0) {
    const entryIdsWithTags = db
      .select({ timeEntryId: timeEntryTags.timeEntryId })
      .from(timeEntryTags)
      .where(inArray(timeEntryTags.tagId, tagIdList))
    entryConditions.push(inArray(timeEntries.id, entryIdsWithTags))
  }

  if (data.billable === 'true') {
    entryConditions.push(eq(timeEntries.billable, true))
  } else if (data.billable === 'false') {
    entryConditions.push(eq(timeEntries.billable, false))
  }

  // Fetch workspace defaults for billing
  const workspaceRow = await db
    .select({
      defaultBillableRate: workspaces.defaultBillableRate,
      billableCurrency: workspaces.billableCurrency,
    })
    .from(workspaces)
    .where(eq(workspaces.id, access.workspace.id))
    .then((r) => r[0])

  const defaultRate = workspaceRow
    ? Number(workspaceRow.defaultBillableRate)
    : 0
  const currency = workspaceRow?.billableCurrency ?? 'PHP'

  // Main query — join projects, clients, workspace members, users
  const rawEntries = await db
    .select({
      id: timeEntries.id,
      workspaceMemberId: timeEntries.workspaceMemberId,
      description: timeEntries.description,
      notes: timeEntries.notes,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
      durationSeconds: timeEntries.durationSeconds,
      billable: timeEntries.billable,
      projectName: projects.name,
      clientId: projects.clientId,
      clientName: clients.name,
      memberEmail: workspaceMembers.email,
      memberUserName: users.name,
      billableRate: workspaceMembers.billableRate,
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
    .orderBy(desc(timeEntries.startedAt))

  // Fetch tags for all returned entries in a single query
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

  const fh = (s: number) => (s / 3600).toFixed(2)
  const daySlices = rawEntries.flatMap((entry) => {
    const slices = splitWorkIntervalByDay(
      {
        memberId: entry.workspaceMemberId,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
      },
      range.start,
      range.endExclusive,
      timezone,
    )
    return slices.map((slice) => ({ entry, slice }))
  })
  const workSummary = summarizeWorkIntervals(
    daySlices.map(({ entry, slice }) => ({
      memberId: entry.workspaceMemberId,
      startedAt: slice.startedAt,
      endedAt: slice.endedAt,
    })),
    range.start,
    range.endExclusive,
  )
  const memberRateById = new Map(
    rawEntries.map((entry) => [
      entry.workspaceMemberId,
      entry.billableRate ? Number(entry.billableRate) : null,
    ]),
  )
  const entryRateMap = await resolveEntryRateMap({
    workspaceId: access.workspace.id,
    defaultRate,
    memberRateById,
    entries: rawEntries.map((entry) => ({
      id: entry.id,
      workspaceMemberId: entry.workspaceMemberId,
      clientId: entry.clientId ?? null,
      date: entry.startedAt,
    })),
  })

  const rows: (string | number | null | undefined)[][] = [
    ['Analytics Export'],
    ['Workspace', access.workspace.name],
    ['Period', `${data.startDate} to ${data.endDate}`],
    ['Timezone', timezone],
    ['Currency', currency],
    ['Tracked hours', formatHms(workSummary.totalSeconds)],
    ['Actual hours', formatHms(workSummary.actualSeconds)],
    ['Overlap', formatHms(workSummary.overlapSeconds)],
    ['Generated', new Date().toISOString().slice(0, 10)],
    [],
    [
      'Member',
      'Email',
      'Date',
      'Start',
      'End',
      'Project',
      'Client',
      'Tags',
      'Description',
      'Duration',
      'Billable',
      'Rate/hr',
      'Amount',
      'Notes',
    ],
  ]

  for (const { entry: e, slice } of daySlices) {
    const effectiveRate = entryRateMap.get(e.id)?.effectiveRate ?? defaultRate
    const hours = fh(slice.seconds)
    const amount = e.billable ? Number(hours) * effectiveRate : null

    rows.push([
      e.memberUserName ?? e.memberEmail ?? '',
      e.memberEmail ?? '',
      slice.date,
      formatDateTimeInTimeZone(slice.startedAt, timezone),
      formatDateTimeInTimeZone(slice.endedAt, timezone),
      e.projectName ?? '',
      e.clientName ?? '',
      (tagsByEntry.get(e.id) ?? []).join('; '),
      e.description,
      formatHms(slice.seconds),
      e.billable ? 'Yes' : 'No',
      e.billable ? formatDecimalRate(effectiveRate) : '',
      amount === null ? '' : amount.toFixed(2),
      e.notes ?? '',
    ])
  }

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'EXPORT_ANALYTICS',
    targetType: 'workspace',
    targetId: access.workspace.id,
    details: `${data.startDate} → ${data.endDate}`,
  })

  return buildCsv(rows)
}

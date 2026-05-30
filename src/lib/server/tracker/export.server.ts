import '@tanstack/react-start/server-only'
import type { z } from 'zod'
import { db } from '#/db'
import {
  workspaces,
  workspaceMembers,
  users,
  workspaceRoles,
  departments,
  timeEntries,
  projects,
  clients,
  tags,
  timeEntryTags,
} from '#/db/schema'
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  gte,
} from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { createAuditLog } from './audit/audit-logger.server'
import { getAnalyticsDateRange } from './shared/dates'
import { assertOwnerOrAdmin } from './shared/role-gates.server'
import type { analyticsRangeSchema } from './shared/schemas'
import {
  computeEffectiveRate,
  formatCurrency,
} from '#/lib/time-tracker/billing'

function escapeCsv(value: string | number | null | undefined): string {
  const s = String(value ?? '')
  if (
    s.includes(',') ||
    s.includes('"') ||
    s.includes('\n') ||
    s.includes('\r')
  ) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function buildCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')
}

export async function exportMembersCsv(): Promise<string> {
  const access = await requireWorkspaceAccess()
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  const isAdmin = level === 'OWNER' || level === 'ADMIN'

  // Build member conditions
  const memberConditions: SQL[] = [
    eq(workspaceMembers.workspaceId, access.workspace.id),
  ]

  if (level === 'EMPLOYEE') {
    memberConditions.push(eq(workspaceMembers.id, access.member.id))
  } else if (level === 'MANAGER' && access.member.departmentId) {
    memberConditions.push(
      eq(workspaceMembers.departmentId, access.member.departmentId),
    )
  }

  const [memberRows, allEntries] = await Promise.all([
    db
      .select({
        id: workspaceMembers.id,
        email: workspaceMembers.email,
        status: workspaceMembers.status,
        userName: users.name,
        roleName: workspaceRoles.name,
        departmentName: departments.name,
      })
      .from(workspaceMembers)
      .leftJoin(users, eq(workspaceMembers.userId, users.id))
      .leftJoin(
        workspaceRoles,
        eq(workspaceMembers.workspaceRoleId, workspaceRoles.id),
      )
      .leftJoin(departments, eq(workspaceMembers.departmentId, departments.id))
      .where(and(...memberConditions))
      .orderBy(asc(workspaceMembers.email)),
    isAdmin
      ? db
          .select({
            workspaceMemberId: timeEntries.workspaceMemberId,
            durationSeconds: timeEntries.durationSeconds,
            billable: timeEntries.billable,
            startedAt: timeEntries.startedAt,
          })
          .from(timeEntries)
          .where(
            and(
              eq(timeEntries.workspaceId, access.workspace.id),
              isNotNull(timeEntries.endedAt),
            ),
          )
      : Promise.resolve([]),
  ])

  // Compute per-member stats for admin exports
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  const dayOfWeek = weekStart.getDay()
  weekStart.setDate(
    weekStart.getDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek),
  )
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  type Stat = {
    totalSeconds: number
    billableSeconds: number
    thisWeekSeconds: number
    thisMonthSeconds: number
    entryCount: number
  }
  const statsMap = new Map<string, Stat>()

  for (const entry of allEntries) {
    const id = entry.workspaceMemberId
    if (!statsMap.has(id)) {
      statsMap.set(id, {
        totalSeconds: 0,
        billableSeconds: 0,
        thisWeekSeconds: 0,
        thisMonthSeconds: 0,
        entryCount: 0,
      })
    }
    const s = statsMap.get(id)!
    s.totalSeconds += entry.durationSeconds
    s.entryCount++
    if (entry.billable) s.billableSeconds += entry.durationSeconds
    const d = new Date(entry.startedAt)
    if (d >= weekStart) s.thisWeekSeconds += entry.durationSeconds
    if (d >= monthStart) s.thisMonthSeconds += entry.durationSeconds
  }

  const headers: (string | number)[] = [
    'Name',
    'Email',
    'Role',
    'Department',
    'Status',
  ]
  if (isAdmin) {
    headers.push(
      'Total Hours',
      'Billable Hours',
      'This Week (h)',
      'This Month (h)',
      'Entries',
    )
  }

  const rows: (string | number | null | undefined)[][] = [
    ['Members Export'],
    ['Workspace', access.workspace.name],
    ['Generated', new Date().toISOString().slice(0, 10)],
    [],
    headers,
  ]

  for (const m of memberRows) {
    const s = statsMap.get(m.id)
    const row: (string | number | null | undefined)[] = [
      m.userName ?? m.email,
      m.email,
      m.roleName ?? '',
      m.departmentName ?? '',
      m.status,
    ]
    if (isAdmin) {
      row.push(
        ((s?.totalSeconds ?? 0) / 3600).toFixed(2),
        ((s?.billableSeconds ?? 0) / 3600).toFixed(2),
        ((s?.thisWeekSeconds ?? 0) / 3600).toFixed(2),
        ((s?.thisMonthSeconds ?? 0) / 3600).toFixed(2),
        s?.entryCount ?? 0,
      )
    }
    rows.push(row)
  }

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'EXPORT_MEMBERS',
    targetType: 'workspace',
    targetId: access.workspace.id,
  })

  return buildCsv(rows)
}

export async function exportAnalyticsCsv(
  data: z.infer<typeof analyticsRangeSchema>,
): Promise<string> {
  const access = await requireWorkspaceAccess()
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  const range = getAnalyticsDateRange(data)

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
    gte(timeEntries.startedAt, range.start),
    lt(timeEntries.startedAt, range.endExclusive),
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
      description: timeEntries.description,
      notes: timeEntries.notes,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
      durationSeconds: timeEntries.durationSeconds,
      billable: timeEntries.billable,
      projectName: projects.name,
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

  const pad = (n: number) => String(n).padStart(2, '0')
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const fmtDT = (d: Date) =>
    `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const fh = (s: number) => (s / 3600).toFixed(2)

  const rows: (string | number | null | undefined)[][] = [
    ['Analytics Export'],
    ['Workspace', access.workspace.name],
    ['Period', `${data.startDate} to ${data.endDate}`],
    ['Generated', new Date().toISOString().slice(0, 10)],
    [],
    [
      'Date',
      'Member',
      'Email',
      'Project',
      'Client',
      'Tags',
      'Description',
      'Started',
      'Ended',
      'Hours',
      'Billable',
      'Rate/hr',
      'Amount',
      'Notes',
    ],
  ]

  for (const e of rawEntries) {
    const effectiveRate = computeEffectiveRate(
      e.billableRate ? Number(e.billableRate) : null,
      defaultRate,
    )
    const hours = fh(e.durationSeconds)
    const amount = e.billable ? Number(hours) * effectiveRate : null

    rows.push([
      fmtDate(e.startedAt),
      e.memberUserName ?? e.memberEmail ?? '',
      e.memberEmail ?? '',
      e.projectName ?? '',
      e.clientName ?? '',
      (tagsByEntry.get(e.id) ?? []).join('; '),
      e.description,
      fmtDT(e.startedAt),
      e.endedAt ? fmtDT(e.endedAt) : '',
      hours,
      e.billable ? 'Yes' : 'No',
      e.billable ? formatCurrency(effectiveRate, currency) : '',
      amount === null ? '' : formatCurrency(amount, currency),
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

export async function exportActivityCsv(): Promise<string> {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const rows = await db
    .select({
      memberId: workspaceMembers.id,
      userId: workspaceMembers.userId,
      name: users.name,
      email: workspaceMembers.email,
      status: workspaceMembers.status,
      entryId: timeEntries.id,
      description: timeEntries.description,
      projectName: projects.name,
      startedAt: timeEntries.startedAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .leftJoin(
      timeEntries,
      and(
        eq(timeEntries.workspaceMemberId, workspaceMembers.id),
        isNull(timeEntries.endedAt),
      ),
    )
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .where(
      and(
        eq(workspaceMembers.workspaceId, access.workspace.id),
        eq(workspaceMembers.status, 'ACTIVE'),
      ),
    )
    .orderBy(asc(users.name))

  const headers: (string | number)[] = [
    'Name',
    'Email',
    'Status',
    'Active Entry',
    'Project',
    'Started At',
  ]

  const csvRows: (string | number | null | undefined)[][] = [
    ['Activity Export'],
    ['Workspace', access.workspace.name],
    ['Generated', new Date().toISOString().slice(0, 10)],
    [],
    headers,
  ]

  for (const row of rows) {
    const isOnline = row.entryId !== null
    csvRows.push([
      row.name ?? row.email,
      row.email,
      isOnline ? 'Online' : 'Offline',
      isOnline ? row.description || 'No description' : '',
      isOnline ? (row.projectName ?? 'No project') : '',
      isOnline && row.startedAt ? row.startedAt.toISOString() : '',
    ])
  }

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'EXPORT_ACTIVITY',
    targetType: 'workspace',
    targetId: access.workspace.id,
  })

  return buildCsv(csvRows)
}

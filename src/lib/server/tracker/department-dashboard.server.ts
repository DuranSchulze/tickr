import '@tanstack/react-start/server-only'
import { db } from '#/db'
import {
  departments,
  workspaceMembers,
  users,
  timeEntries,
  timeEntryTags,
  tags,
  projects,
  projectTasks,
  departments as departmentsTable,
} from '#/db/schema'
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
} from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { assertAtLeastManager } from './shared/role-gates.server'
import { computeEffectiveRate } from '#/lib/time-tracker/billing'

export type DepartmentMemberBreakdown = {
  memberId: string
  name: string
  email: string
  totalSeconds: number
  billableSeconds: number
  entryCount: number
  billableAmount: number
  effectiveRate: number
  thisWeekSeconds: number
  thisMonthSeconds: number
}

export type DepartmentProjectBreakdown = {
  projectId: string
  name: string
  color: string
  seconds: number
  billableSeconds: number
  billableAmount: number
  memberCount: number
}

export type DepartmentDashboard = {
  canFilterDepartments: boolean
  filters: {
    departmentId: string
    q: string
  }
  availableDepartments: Array<{
    id: string
    name: string
    color: string
  }>
  department: {
    id: string
    name: string
    color: string
    memberCount: number
  }
  summary: {
    totalSeconds: number
    billableSeconds: number
    nonBillableSeconds: number
    entryCount: number
    totalBillableAmount: number
    currency: string
  }
  membersBreakdown: DepartmentMemberBreakdown[]
  projectsBreakdown: DepartmentProjectBreakdown[]
  dailyTotals: Array<{ date: string; seconds: number }>
  topTags: Array<{
    tagId: string
    name: string
    color: string
    seconds: number
  }>
}

export type DepartmentMemberActivityEntry = {
  id: string
  description: string
  projectName: string | null
  taskName: string | null
  startedAt: string
  endedAt: string | null
  durationSeconds: number
  billable: boolean
  status: 'active' | 'completed'
}

export type DepartmentMemberActivitySummary = {
  member: {
    id: string
    name: string
    email: string
    departmentName: string | null
    departmentColor: string | null
  }
  today: {
    date: string
    totalSeconds: number
    completedSeconds: number
    activeSeconds: number
    completedCount: number
    activeCount: number
    hourlyTotals: Array<{ hour: string; seconds: number }>
  }
  activeEntry: DepartmentMemberActivityEntry | null
  latestCompletedEntry: DepartmentMemberActivityEntry | null
  entriesToday: DepartmentMemberActivityEntry[]
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function mapActivityEntry(row: {
  id: string
  description: string
  projectName: string | null
  taskName: string | null
  startedAt: Date
  endedAt: Date | null
  durationSeconds: number
  billable: boolean
}): DepartmentMemberActivityEntry {
  return {
    id: row.id,
    description: row.description,
    projectName: row.projectName,
    taskName: row.taskName,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationSeconds: row.endedAt
      ? row.durationSeconds
      : Math.max(0, Math.floor((Date.now() - row.startedAt.getTime()) / 1000)),
    billable: row.billable,
    status: row.endedAt ? 'completed' : 'active',
  }
}

export async function getDepartmentDashboard(data: {
  startDate: string
  endDate: string
  departmentId?: string
  q?: string
}): Promise<DepartmentDashboard> {
  const access = await requireWorkspaceAccess()
  assertAtLeastManager(access)

  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  const canFilterDepartments = level === 'OWNER' || level === 'ADMIN'
  const managerDepartmentId = access.member.departmentId

  if (!canFilterDepartments && !managerDepartmentId) {
    throw new Error(
      'You are not assigned to a department. Ask your admin to assign you to one.',
    )
  }

  const workspaceId = access.workspace.id
  const defaultRate = Number(access.workspace.defaultBillableRate ?? 0)
  const currency = access.workspace.billableCurrency ?? 'PHP'

  const rangeStart = new Date(`${data.startDate}T00:00:00`)
  const rangeEnd = new Date(`${data.endDate}T23:59:59.999`)
  const q = data.q?.trim() ?? ''

  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  const dow = weekStart.getDay()
  weekStart.setDate(weekStart.getDate() + (dow === 0 ? -6 : 1 - dow))
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const availableDepartments = await db
    .select({
      id: departments.id,
      name: departments.name,
      color: departments.color,
    })
    .from(departments)
    .where(
      canFilterDepartments
        ? eq(departments.workspaceId, workspaceId)
        : and(
            eq(departments.workspaceId, workspaceId),
            eq(departments.id, managerDepartmentId!),
          ),
    )
    .orderBy(asc(departments.name))

  const selectedDepartmentId = canFilterDepartments
    ? data.departmentId &&
      availableDepartments.some((dept) => dept.id === data.departmentId)
      ? data.departmentId
      : ''
    : managerDepartmentId!

  const deptRow = selectedDepartmentId
    ? availableDepartments.find((dept) => dept.id === selectedDepartmentId)
    : {
        id: '',
        name: 'All departments',
        color: '#6366f1',
      }

  if (!deptRow) throw new Error('Department not found.')

  const memberConditions = [
    eq(workspaceMembers.workspaceId, workspaceId),
    eq(workspaceMembers.status, 'ACTIVE' as const),
  ]
  if (selectedDepartmentId) {
    memberConditions.push(
      eq(workspaceMembers.departmentId, selectedDepartmentId),
    )
  }

  const searchConditions = q
    ? or(ilike(workspaceMembers.email, `%${q}%`), ilike(users.name, `%${q}%`))
    : undefined

  if (searchConditions) memberConditions.push(searchConditions)

  // Fetch active members first so all analytics queries stay scoped to the
  // allowed member IDs instead of trusting URL filters.
  const memberRows = await db
    .select({
      id: workspaceMembers.id,
      email: workspaceMembers.email,
      userId: workspaceMembers.userId,
      billableRate: workspaceMembers.billableRate,
      name: users.name,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .where(and(...memberConditions))

  const memberIds = memberRows.map((m) => m.id)

  if (memberIds.length === 0) {
    return {
      canFilterDepartments,
      filters: {
        departmentId: selectedDepartmentId,
        q,
      },
      availableDepartments,
      department: {
        id: deptRow.id,
        name: deptRow.name,
        color: deptRow.color,
        memberCount: 0,
      },
      summary: {
        totalSeconds: 0,
        billableSeconds: 0,
        nonBillableSeconds: 0,
        entryCount: 0,
        totalBillableAmount: 0,
        currency,
      },
      membersBreakdown: [],
      projectsBreakdown: [],
      dailyTotals: [],
      topTags: [],
    }
  }

  // Fetch time entries in parallel with entry-tag links.
  const [entryRows, tagEntryRows] = await Promise.all([
    db
      .select({
        id: timeEntries.id,
        workspaceMemberId: timeEntries.workspaceMemberId,
        durationSeconds: timeEntries.durationSeconds,
        billable: timeEntries.billable,
        startedAt: timeEntries.startedAt,
        projectId: timeEntries.projectId,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          inArray(timeEntries.workspaceMemberId, memberIds),
          isNotNull(timeEntries.endedAt),
          gte(timeEntries.startedAt, rangeStart),
          lt(timeEntries.startedAt, rangeEnd),
        ),
      ),
    // Fetch tags for entries in range (we'll join them in memory)
    db
      .select({
        timeEntryId: timeEntryTags.timeEntryId,
        tagId: timeEntryTags.tagId,
      })
      .from(timeEntryTags)
      .innerJoin(timeEntries, eq(timeEntryTags.timeEntryId, timeEntries.id))
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          inArray(timeEntries.workspaceMemberId, memberIds),
          isNotNull(timeEntries.endedAt),
          gte(timeEntries.startedAt, rangeStart),
          lt(timeEntries.startedAt, rangeEnd),
        ),
      ),
  ])

  const memberMap = new Map(
    memberRows
      .map((m) => ({
        ...m,
        name: m.name ?? m.email,
        effectiveRate: computeEffectiveRate(
          m.billableRate ? Number(m.billableRate) : null,
          defaultRate,
        ),
      }))
      .map((m) => [m.id, m]),
  )

  // Build per-member stats
  type MemberStats = {
    totalSeconds: number
    billableSeconds: number
    entryCount: number
    billableAmount: number
    thisWeekSeconds: number
    thisMonthSeconds: number
  }
  const memberStats = new Map<string, MemberStats>()
  for (const id of memberIds) {
    memberStats.set(id, {
      totalSeconds: 0,
      billableSeconds: 0,
      entryCount: 0,
      billableAmount: 0,
      thisWeekSeconds: 0,
      thisMonthSeconds: 0,
    })
  }

  // Build per-project stats
  type ProjectStats = {
    seconds: number
    billableSeconds: number
    billableAmount: number
    members: Set<string>
  }
  const projectStats = new Map<string, ProjectStats>()

  // Build daily totals
  const dailyMap = new Map<string, number>()

  // Build tag seconds
  const tagSeconds = new Map<string, number>()

  for (const entry of entryRows) {
    const member = memberMap.get(entry.workspaceMemberId)
    if (!member) continue
    const s = memberStats.get(entry.workspaceMemberId)!
    const secs = entry.durationSeconds

    s.totalSeconds += secs
    s.entryCount++
    if (entry.billable) {
      s.billableSeconds += secs
      s.billableAmount += (secs / 3600) * member.effectiveRate
    }
    const entryStart = new Date(entry.startedAt)
    if (entryStart >= weekStart) s.thisWeekSeconds += secs
    if (entryStart >= monthStart) s.thisMonthSeconds += secs

    // Daily totals
    const d = entry.startedAt
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + secs)

    // Project stats
    if (entry.projectId) {
      const ps = projectStats.get(entry.projectId) ?? {
        seconds: 0,
        billableSeconds: 0,
        billableAmount: 0,
        members: new Set<string>(),
      }
      ps.seconds += secs
      ps.members.add(entry.workspaceMemberId)
      if (entry.billable) {
        ps.billableSeconds += secs
        ps.billableAmount += (secs / 3600) * member.effectiveRate
      }
      projectStats.set(entry.projectId, ps)
    }
  }

  // Tag seconds from tag rows
  for (const tr of tagEntryRows) {
    const entry = entryRows.find((e) => e.id === tr.timeEntryId)
    if (!entry) continue
    tagSeconds.set(
      tr.tagId,
      (tagSeconds.get(tr.tagId) ?? 0) + entry.durationSeconds,
    )
  }

  // Fetch project and tag info
  const projectIds = [...projectStats.keys()]
  const tagIds = [...tagSeconds.keys()]

  const [projectRows, tagRows] = await Promise.all([
    projectIds.length > 0
      ? db
          .select({
            id: projects.id,
            name: projects.name,
            color: projects.color,
          })
          .from(projects)
          .where(inArray(projects.id, projectIds))
      : Promise.resolve([]),
    tagIds.length > 0
      ? db
          .select({ id: tags.id, name: tags.name, color: tags.color })
          .from(tags)
          .where(inArray(tags.id, tagIds))
      : Promise.resolve([]),
  ])

  const projectInfoMap = new Map(projectRows.map((p) => [p.id, p]))
  const tagInfoMap = new Map(tagRows.map((t) => [t.id, t]))

  // Build outputs
  const membersBreakdown: DepartmentMemberBreakdown[] = memberIds
    .map((id) => {
      const m = memberMap.get(id)!
      const s = memberStats.get(id)!
      return {
        memberId: id,
        name: m.name,
        email: m.email,
        ...s,
        effectiveRate: m.effectiveRate,
      }
    })
    .sort((a, b) => b.totalSeconds - a.totalSeconds)

  const projectsBreakdown: DepartmentProjectBreakdown[] = projectIds
    .map((id) => {
      const ps = projectStats.get(id)!
      const info = projectInfoMap.get(id)
      return {
        projectId: id,
        name: info?.name ?? 'Unknown',
        color: info?.color ?? '#6366f1',
        seconds: ps.seconds,
        billableSeconds: ps.billableSeconds,
        billableAmount: ps.billableAmount,
        memberCount: ps.members.size,
      }
    })
    .sort((a, b) => b.seconds - a.seconds)

  const dailyTotals = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, seconds]) => ({ date, seconds }))

  const topTags = tagIds
    .map((id) => {
      const info = tagInfoMap.get(id)
      return {
        tagId: id,
        name: info?.name ?? 'Unknown',
        color: info?.color ?? '#6366f1',
        seconds: tagSeconds.get(id) ?? 0,
      }
    })
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10)

  const totalSeconds = membersBreakdown.reduce((s, m) => s + m.totalSeconds, 0)
  const billableSeconds = membersBreakdown.reduce(
    (s, m) => s + m.billableSeconds,
    0,
  )
  const totalBillableAmount = membersBreakdown.reduce(
    (s, m) => s + m.billableAmount,
    0,
  )
  const entryCount = membersBreakdown.reduce((s, m) => s + m.entryCount, 0)

  return {
    canFilterDepartments,
    filters: {
      departmentId: selectedDepartmentId,
      q,
    },
    availableDepartments,
    department: {
      id: deptRow.id,
      name: deptRow.name,
      color: deptRow.color,
      memberCount: memberIds.length,
    },
    summary: {
      totalSeconds,
      billableSeconds,
      nonBillableSeconds: totalSeconds - billableSeconds,
      entryCount,
      totalBillableAmount,
      currency,
    },
    membersBreakdown,
    projectsBreakdown,
    dailyTotals,
    topTags,
  }
}

export async function getDepartmentMemberTodayActivity(data: {
  memberId: string
}): Promise<DepartmentMemberActivitySummary> {
  const access = await requireWorkspaceAccess()
  assertAtLeastManager(access)

  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  const canReadAnyDepartment = level === 'OWNER' || level === 'ADMIN'
  const workspaceId = access.workspace.id

  const [member] = await db
    .select({
      id: workspaceMembers.id,
      email: workspaceMembers.email,
      userName: users.name,
      departmentId: workspaceMembers.departmentId,
      departmentName: departmentsTable.name,
      departmentColor: departmentsTable.color,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .leftJoin(
      departmentsTable,
      eq(workspaceMembers.departmentId, departmentsTable.id),
    )
    .where(
      and(
        eq(workspaceMembers.id, data.memberId),
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.status, 'ACTIVE'),
      ),
    )
    .limit(1)

  if (!member) throw new Error('Member not found.')

  if (
    !canReadAnyDepartment &&
    (!access.member.departmentId ||
      member.departmentId !== access.member.departmentId)
  ) {
    throw new Error('Managers can only view their own department.')
  }

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)

  const entryColumns = {
    id: timeEntries.id,
    description: timeEntries.description,
    projectName: projects.name,
    taskName: projectTasks.name,
    startedAt: timeEntries.startedAt,
    endedAt: timeEntries.endedAt,
    durationSeconds: timeEntries.durationSeconds,
    billable: timeEntries.billable,
  }

  const [todayRows, activeRows, latestCompletedRows] = await Promise.all([
    db
      .select(entryColumns)
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(projectTasks, eq(timeEntries.taskId, projectTasks.id))
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.workspaceMemberId, member.id),
          gte(timeEntries.startedAt, todayStart),
          lt(timeEntries.startedAt, tomorrowStart),
        ),
      )
      .orderBy(desc(timeEntries.startedAt)),
    db
      .select(entryColumns)
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(projectTasks, eq(timeEntries.taskId, projectTasks.id))
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.workspaceMemberId, member.id),
          isNull(timeEntries.endedAt),
        ),
      )
      .orderBy(desc(timeEntries.startedAt))
      .limit(1),
    db
      .select(entryColumns)
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(projectTasks, eq(timeEntries.taskId, projectTasks.id))
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.workspaceMemberId, member.id),
          isNotNull(timeEntries.endedAt),
          gte(timeEntries.endedAt, todayStart),
          lt(timeEntries.endedAt, tomorrowStart),
        ),
      )
      .orderBy(desc(timeEntries.endedAt))
      .limit(1),
  ])

  const entriesToday = todayRows.map(mapActivityEntry)
  const activeEntry = activeRows[0] ? mapActivityEntry(activeRows[0]) : null
  const latestCompletedEntry = latestCompletedRows[0]
    ? mapActivityEntry(latestCompletedRows[0])
    : null
  const hourlyTotals = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, '0')}:00`,
    seconds: 0,
  }))

  for (const entry of entriesToday) {
    const start = new Date(entry.startedAt)
    const bucket = hourlyTotals[start.getHours()]
    bucket.seconds += entry.durationSeconds
  }

  const completedEntries = entriesToday.filter(
    (entry) => entry.status === 'completed',
  )
  const activeEntries = entriesToday.filter(
    (entry) => entry.status === 'active',
  )
  const completedSeconds = completedEntries.reduce(
    (sum, entry) => sum + entry.durationSeconds,
    0,
  )
  const activeSeconds = activeEntries.reduce(
    (sum, entry) => sum + entry.durationSeconds,
    0,
  )

  return {
    member: {
      id: member.id,
      name: member.userName ?? member.email,
      email: member.email,
      departmentName: member.departmentName,
      departmentColor: member.departmentColor,
    },
    today: {
      date: formatDateKey(todayStart),
      totalSeconds: completedSeconds + activeSeconds,
      completedSeconds,
      activeSeconds,
      completedCount: completedEntries.length,
      activeCount: activeEntries.length,
      hourlyTotals,
    },
    activeEntry,
    latestCompletedEntry,
    entriesToday,
  }
}

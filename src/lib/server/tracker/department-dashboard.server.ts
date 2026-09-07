import '@tanstack/react-start/server-only'
import { db } from '#/db'
import {
  departments,
  workspaceMembers,
  users,
  timeEntries,
  timeEntryTags,
  tags,
  clients,
  projects,
  projectTasks,
  departments as departmentsTable,
} from '#/db/schema'
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { computeEffectiveRate } from '#/lib/time-tracker/billing'
import {
  clipWorkInterval,
  summarizeWorkIntervals,
} from '#/lib/time-tracker/work-intervals'
import type { AnalyticsTimeEntryRow } from './analytics.server'
import { formatDateInTimeZone, getWorkspaceDateRange } from './shared/dates'
import { resolveEntryRateMap } from './rates.server'

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
  clientId: string
  clientName: string
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
    memberId: string
    q: string
  }
  availableDepartments: Array<{
    id: string
    name: string
    color: string
  }>
  availableMembers: Array<{
    id: string
    name: string
    email: string
    departmentId: string | null
    departmentName: string | null
  }>
  department: {
    id: string
    name: string
    color: string
    memberCount: number
  }
  summary: {
    totalSeconds: number
    actualSeconds: number
    overlapSeconds: number
    billableSeconds: number
    nonBillableSeconds: number
    entryCount: number
    totalBillableAmount: number
    currency: string
  }
  membersBreakdown: DepartmentMemberBreakdown[]
  topProjectsBreakdown: DepartmentProjectBreakdown[]
  projectsBreakdown: DepartmentProjectBreakdown[]
  projectsPagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  dailyTotals: Array<{
    date: string
    seconds: number
    billableSeconds: number
    nonBillableSeconds: number
  }>
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
  timezone: string
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

export type DepartmentMemberDetail = {
  activity: DepartmentMemberActivitySummary
  startDate: string | null
  endDate: string | null
  page: number
  entries: AnalyticsTimeEntryRow[]
  entriesTotal: number
  currency: string
  timezone: string
  summary: {
    totalSeconds: number
    actualSeconds: number
    overlapSeconds: number
  }
}

function getTimeZoneOffsetMs(timeZone: string, date: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
    }).formatToParts(date)
    const value = parts.find((part) => part.type === 'timeZoneName')?.value
    if (!value || value === 'GMT') return 0
    const match = value.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/)
    if (!match) return 0
    const sign = match[1] === '+' ? 1 : -1
    const hours = Number(match[2] ?? 0)
    const minutes = Number(match[3] ?? 0)
    return sign * (hours * 60 + minutes) * 60_000
  } catch {
    return 0
  }
}

function getZonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
  }
}

function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0, 0))
  return new Date(utcGuess.getTime() - getTimeZoneOffsetMs(timeZone, utcGuess))
}

function getTodayRangeForTimeZone(timeZone: string, now = new Date()) {
  const today = getZonedDateParts(now, timeZone)
  const nextDay = new Date(Date.UTC(today.year, today.month - 1, today.day + 1))
  const tomorrow = {
    year: nextDay.getUTCFullYear(),
    month: nextDay.getUTCMonth() + 1,
    day: nextDay.getUTCDate(),
  }

  return {
    date: `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`,
    start: zonedTimeToUtc(timeZone, today.year, today.month, today.day),
    end: zonedTimeToUtc(timeZone, tomorrow.year, tomorrow.month, tomorrow.day),
  }
}

function getHourInTimeZone(date: Date, timeZone: string): number {
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)
    return Number(hour.find((part) => part.type === 'hour')?.value ?? 0)
  } catch {
    return date.getHours()
  }
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
  memberId?: string
  q?: string
  projectPage?: number
}): Promise<DepartmentDashboard> {
  const access = await requireWorkspaceAccess()
  const canFilterDepartments = true

  const workspaceId = access.workspace.id
  const defaultRate = Number(access.workspace.defaultBillableRate ?? 0)
  const currency = access.workspace.billableCurrency ?? 'PHP'

  const timezone = access.workspace.timezone || 'UTC'
  const workspaceRange = getWorkspaceDateRange(data, timezone)
  const rangeStart = workspaceRange.start
  const rangeEnd = workspaceRange.endExclusive
  const q = data.q?.trim() ?? ''
  const projectPageSize = 10
  const requestedProjectPage = Math.max(1, data.projectPage ?? 1)

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
    .where(eq(departments.workspaceId, workspaceId))
    .orderBy(asc(departments.name))

  const selectedDepartmentId =
    data.departmentId &&
    availableDepartments.some((dept) => dept.id === data.departmentId)
      ? data.departmentId
      : ''

  const deptRow = selectedDepartmentId
    ? availableDepartments.find((dept) => dept.id === selectedDepartmentId)
    : {
        id: '',
        name: 'All departments',
        color: '#6366f1',
      }

  if (!deptRow) throw new Error('Department not found.')

  const availableMemberConditions = [
    eq(workspaceMembers.workspaceId, workspaceId),
    eq(workspaceMembers.status, 'ACTIVE' as const),
  ]
  if (selectedDepartmentId) {
    availableMemberConditions.push(
      eq(workspaceMembers.departmentId, selectedDepartmentId),
    )
  }
  const availableMemberRows = await db
    .select({
      id: workspaceMembers.id,
      email: workspaceMembers.email,
      name: users.name,
      departmentId: workspaceMembers.departmentId,
      departmentName: departmentsTable.name,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .leftJoin(
      departmentsTable,
      eq(workspaceMembers.departmentId, departmentsTable.id),
    )
    .where(and(...availableMemberConditions))
    .orderBy(asc(users.name), asc(workspaceMembers.email))
  const selectedMemberId = availableMemberRows.some(
    (member) => member.id === data.memberId,
  )
    ? data.memberId!
    : ''

  const memberConditions = [
    eq(workspaceMembers.workspaceId, workspaceId),
    eq(workspaceMembers.status, 'ACTIVE' as const),
  ]
  if (selectedDepartmentId) {
    memberConditions.push(
      eq(workspaceMembers.departmentId, selectedDepartmentId),
    )
  }
  if (selectedMemberId) {
    memberConditions.push(eq(workspaceMembers.id, selectedMemberId))
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
        memberId: selectedMemberId,
        q,
      },
      availableDepartments,
      availableMembers: availableMemberRows.map((member) => ({
        id: member.id,
        name: member.name ?? member.email,
        email: member.email,
        departmentId: member.departmentId,
        departmentName: member.departmentName,
      })),
      department: {
        id: deptRow.id,
        name: deptRow.name,
        color: deptRow.color,
        memberCount: 0,
      },
      summary: {
        totalSeconds: 0,
        actualSeconds: 0,
        overlapSeconds: 0,
        billableSeconds: 0,
        nonBillableSeconds: 0,
        entryCount: 0,
        totalBillableAmount: 0,
        currency,
      },
      membersBreakdown: [],
      topProjectsBreakdown: [],
      projectsBreakdown: [],
      projectsPagination: {
        page: 1,
        pageSize: projectPageSize,
        total: 0,
        totalPages: 1,
      },
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
        endedAt: timeEntries.endedAt,
        projectId: timeEntries.projectId,
        clientId: projects.clientId,
      })
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          inArray(timeEntries.workspaceMemberId, memberIds),
          isNotNull(timeEntries.endedAt),
          lt(timeEntries.startedAt, rangeEnd),
          gt(timeEntries.endedAt, rangeStart),
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
          lt(timeEntries.startedAt, rangeEnd),
          gt(timeEntries.endedAt, rangeStart),
        ),
      ),
  ])

  const memberMap = new Map(
    memberRows
      .map((m) => ({
        ...m,
        name: m.name ?? m.email,
      }))
      .map((m) => [m.id, m]),
  )
  const memberRateById = new Map(
    memberRows.map((member) => [
      member.id,
      member.billableRate ? Number(member.billableRate) : null,
    ]),
  )
  const entryRateMap = await resolveEntryRateMap({
    workspaceId,
    defaultRate,
    memberRateById,
    entries: entryRows.map((entry) => ({
      id: entry.id,
      workspaceMemberId: entry.workspaceMemberId,
      clientId: entry.clientId ?? null,
      date: entry.startedAt,
    })),
  })

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
  const dailyMap = new Map<
    string,
    { seconds: number; billableSeconds: number; nonBillableSeconds: number }
  >()

  // Build tag seconds
  const tagSeconds = new Map<string, number>()

  for (const entry of entryRows) {
    const member = memberMap.get(entry.workspaceMemberId)
    if (!member) continue
    const s = memberStats.get(entry.workspaceMemberId)!
    const clipped = clipWorkInterval(
      {
        memberId: entry.workspaceMemberId,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
      },
      rangeStart,
      rangeEnd,
    )
    if (!clipped) continue
    const secs = clipped.seconds
    const effectiveRate =
      entryRateMap.get(entry.id)?.effectiveRate ?? defaultRate

    s.totalSeconds += secs
    s.entryCount++
    if (entry.billable) {
      s.billableSeconds += secs
      s.billableAmount += (secs / 3600) * effectiveRate
    }
    const entryStart = clipped.startedAt
    if (entryStart >= weekStart) s.thisWeekSeconds += secs
    if (entryStart >= monthStart) s.thisMonthSeconds += secs

    // Daily totals
    const dateKey = formatDateInTimeZone(clipped.startedAt, timezone)
    const daily = dailyMap.get(dateKey) ?? {
      seconds: 0,
      billableSeconds: 0,
      nonBillableSeconds: 0,
    }
    daily.seconds += secs
    if (entry.billable) daily.billableSeconds += secs
    else daily.nonBillableSeconds += secs
    dailyMap.set(dateKey, daily)

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
        ps.billableAmount += (secs / 3600) * effectiveRate
      }
      projectStats.set(entry.projectId, ps)
    }
  }

  const entryById = new Map(entryRows.map((entry) => [entry.id, entry]))

  // Tag seconds from tag rows
  for (const tr of tagEntryRows) {
    const entry = entryById.get(tr.timeEntryId)
    if (!entry) continue
    tagSeconds.set(
      tr.tagId,
      (tagSeconds.get(tr.tagId) ?? 0) +
        (clipWorkInterval(
          {
            memberId: entry.workspaceMemberId,
            startedAt: entry.startedAt,
            endedAt: entry.endedAt,
          },
          rangeStart,
          rangeEnd,
        )?.seconds ?? 0),
    )
  }

  // Fetch project and tag info. Project detail rows are paginated server-side
  // so large workspaces do not ship every project row to the browser.
  const sortedProjectIds = [...projectStats.keys()].sort((a, b) => {
    const secondsDiff =
      (projectStats.get(b)?.seconds ?? 0) - (projectStats.get(a)?.seconds ?? 0)
    return secondsDiff || a.localeCompare(b)
  })
  const projectsTotal = sortedProjectIds.length
  const projectTotalPages = Math.max(
    1,
    Math.ceil(projectsTotal / projectPageSize),
  )
  const projectPage = Math.min(requestedProjectPage, projectTotalPages)
  const paginatedProjectIds = sortedProjectIds.slice(
    (projectPage - 1) * projectPageSize,
    projectPage * projectPageSize,
  )
  const topProjectIds = sortedProjectIds.slice(0, 10)
  const projectIdsToLoad = [
    ...new Set([...topProjectIds, ...paginatedProjectIds]),
  ]
  const tagIds = [...tagSeconds.keys()]

  const [projectRows, tagRows] = await Promise.all([
    projectIdsToLoad.length > 0
      ? db
          .select({
            id: projects.id,
            clientId: projects.clientId,
            clientName: clients.name,
            name: projects.name,
            color: projects.color,
          })
          .from(projects)
          .leftJoin(clients, eq(projects.clientId, clients.id))
          .where(inArray(projects.id, projectIdsToLoad))
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
        effectiveRate: computeEffectiveRate(
          m.billableRate ? Number(m.billableRate) : null,
          defaultRate,
        ),
      }
    })
    .sort((a, b) => b.totalSeconds - a.totalSeconds)

  const buildProjectBreakdown = (
    projectIds: string[],
  ): DepartmentProjectBreakdown[] =>
    projectIds.map((id) => {
      const ps = projectStats.get(id)!
      const info = projectInfoMap.get(id)
      return {
        projectId: id,
        clientId: info?.clientId ?? '',
        clientName: info?.clientName ?? 'Unknown client',
        name: info?.name ?? 'Unknown',
        color: info?.color ?? '#6366f1',
        seconds: ps.seconds,
        billableSeconds: ps.billableSeconds,
        billableAmount: ps.billableAmount,
        memberCount: ps.members.size,
      }
    })

  const topProjectsBreakdown = buildProjectBreakdown(topProjectIds)
  const projectsBreakdown = buildProjectBreakdown(paginatedProjectIds)

  const dailyTotals = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totals]) => ({ date, ...totals }))

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
  const workSummary = summarizeWorkIntervals(
    entryRows.map((entry) => ({
      memberId: entry.workspaceMemberId,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
    })),
    rangeStart,
    rangeEnd,
  )
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
      memberId: selectedMemberId,
      q,
    },
    availableDepartments,
    availableMembers: availableMemberRows.map((member) => ({
      id: member.id,
      name: member.name ?? member.email,
      email: member.email,
      departmentId: member.departmentId,
      departmentName: member.departmentName,
    })),
    department: {
      id: deptRow.id,
      name: deptRow.name,
      color: deptRow.color,
      memberCount: memberIds.length,
    },
    summary: {
      totalSeconds,
      actualSeconds: workSummary.actualSeconds,
      overlapSeconds: workSummary.overlapSeconds,
      billableSeconds,
      nonBillableSeconds: totalSeconds - billableSeconds,
      entryCount,
      totalBillableAmount,
      currency,
    },
    membersBreakdown,
    topProjectsBreakdown,
    projectsBreakdown,
    projectsPagination: {
      page: projectPage,
      pageSize: projectPageSize,
      total: projectsTotal,
      totalPages: projectTotalPages,
    },
    dailyTotals,
    topTags,
  }
}

export async function getDepartmentMemberTodayActivity(data: {
  memberId: string
}): Promise<DepartmentMemberActivitySummary> {
  const access = await requireWorkspaceAccess()
  const workspaceId = access.workspace.id

  const [member] = await db
    .select({
      id: workspaceMembers.id,
      email: workspaceMembers.email,
      userName: users.name,
      userImage: users.image,
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

  const timeZone = access.workspace.timezone || 'UTC'
  const todayRange = getTodayRangeForTimeZone(timeZone)

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
          lt(timeEntries.startedAt, todayRange.end),
          or(
            isNull(timeEntries.endedAt),
            gte(timeEntries.endedAt, todayRange.start),
          ),
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
          gte(timeEntries.endedAt, todayRange.start),
          lt(timeEntries.endedAt, todayRange.end),
        ),
      )
      .orderBy(desc(timeEntries.endedAt))
      .limit(1),
  ])

  const activeEntry = activeRows[0] ? mapActivityEntry(activeRows[0]) : null
  const latestCompletedEntry = latestCompletedRows[0]
    ? mapActivityEntry(latestCompletedRows[0])
    : null
  const entriesTodayFromRows = todayRows
    .map(mapActivityEntry)
    .sort(
      (a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    )
  const entriesToday = activeEntry
    ? entriesTodayFromRows.some((entry) => entry.id === activeEntry.id)
      ? entriesTodayFromRows
      : [...entriesTodayFromRows, activeEntry].sort(
          (a, b) =>
            new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
        )
    : entriesTodayFromRows
  const hourlyTotals = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, '0')}:00`,
    seconds: 0,
  }))

  for (const entry of entriesToday) {
    const start = new Date(entry.startedAt)
    const bucket = hourlyTotals[getHourInTimeZone(start, timeZone)]
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
    timezone: timeZone,
    today: {
      date: todayRange.date,
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

export async function getDepartmentMemberDetail(data: {
  memberId: string
  startDate?: string
  endDate?: string
  page?: number
  description?: string
}): Promise<DepartmentMemberDetail> {
  const access = await requireWorkspaceAccess()
  const workspaceId = access.workspace.id

  const [member] = await db
    .select({
      id: workspaceMembers.id,
      email: workspaceMembers.email,
      userName: users.name,
      userImage: users.image,
      departmentId: workspaceMembers.departmentId,
      billableRate: workspaceMembers.billableRate,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .where(
      and(
        eq(workspaceMembers.id, data.memberId),
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.status, 'ACTIVE'),
      ),
    )
    .limit(1)

  if (!member) throw new Error('Member not found.')

  const timezone = access.workspace.timezone || 'UTC'
  const PAGE_SIZE = 50
  const page = Math.max(1, data.page ?? 1)
  const defaultRate = Number(access.workspace.defaultBillableRate ?? 0)
  const currency = access.workspace.billableCurrency ?? 'PHP'
  const memberRate = member.billableRate ? Number(member.billableRate) : null

  const hasDateRange = !!(data.startDate && data.endDate)

  // Without an explicit range, default to the trailing 30 days so the
  // summary query never scans the member's entire entry history.
  let rangeStart: Date
  let rangeEnd: Date
  let startDate: string
  let endDate: string

  if (hasDateRange) {
    const range = getWorkspaceDateRange(
      { startDate: data.startDate!, endDate: data.endDate! },
      timezone,
    )
    rangeStart = range.start
    rangeEnd = range.endExclusive
    startDate = range.startDate
    endDate = range.endDate
  } else {
    const defaultEnd = new Date()
    const defaultStart = new Date(defaultEnd)
    defaultStart.setUTCDate(defaultStart.getUTCDate() - 29)
    const range = getWorkspaceDateRange(
      {
        startDate: formatDateInTimeZone(defaultStart, timezone),
        endDate: formatDateInTimeZone(defaultEnd, timezone),
      },
      timezone,
    )
    rangeStart = range.start
    rangeEnd = range.endExclusive
    startDate = range.startDate
    endDate = range.endDate
  }

  // Build the WHERE clause with the (possibly defaulted) date range.
  const baseConditions: SQL[] = [
    eq(timeEntries.workspaceId, workspaceId),
    eq(timeEntries.workspaceMemberId, member.id),
    isNotNull(timeEntries.endedAt),
    gt(timeEntries.endedAt, timeEntries.startedAt),
    lt(timeEntries.startedAt, rangeEnd),
    gt(timeEntries.endedAt, rangeStart),
  ]

  // Description search narrows the entries list + total count, but the summary
  // cards stay scoped to the full range so totals don't jump while searching.
  const searchTerm = data.description?.trim()
  const entryConditions: SQL[] =
    searchTerm && searchTerm.length > 0
      ? [...baseConditions, ilike(timeEntries.description, `%${searchTerm}%`)]
      : baseConditions

  const whereClause = and(...entryConditions)
  const summaryWhereClause = and(...baseConditions)

  // Summary cards must reflect the full result set, while rawRows stays paged.
  const [activity, rawRows, countResult, summaryRows] = await Promise.all([
    getDepartmentMemberTodayActivity({ memberId: member.id }),
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
      })
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(whereClause)
      .orderBy(desc(timeEntries.startedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(timeEntries)
      .where(whereClause),
    db
      .select({
        workspaceMemberId: timeEntries.workspaceMemberId,
        startedAt: timeEntries.startedAt,
        endedAt: timeEntries.endedAt,
      })
      .from(timeEntries)
      .where(summaryWhereClause),
  ])

  const rawEntryIds = rawRows.map((entry) => entry.id)
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

  const tagNamesByEntry = new Map<string, string[]>()
  const tagIdsByEntry = new Map<string, string[]>()
  for (const row of rawTagRows) {
    const names = tagNamesByEntry.get(row.timeEntryId) ?? []
    names.push(row.tagName)
    tagNamesByEntry.set(row.timeEntryId, names)
    const ids = tagIdsByEntry.get(row.timeEntryId) ?? []
    ids.push(row.tagId)
    tagIdsByEntry.set(row.timeEntryId, ids)
  }

  const workSummary = summarizeWorkIntervals(
    summaryRows.map((entry) => ({
      memberId: entry.workspaceMemberId,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
    })),
    rangeStart,
    rangeEnd,
  )
  const entryRateMap = await resolveEntryRateMap({
    workspaceId,
    defaultRate,
    memberRateById: new Map([[member.id, memberRate]]),
    entries: rawRows.map((entry) => ({
      id: entry.id,
      workspaceMemberId: entry.workspaceMemberId,
      clientId: entry.clientId ?? null,
      date: entry.startedAt,
    })),
  })

  return {
    activity,
    startDate,
    endDate,
    page,
    entriesTotal: countResult[0]?.c ?? 0,
    currency,
    timezone,
    summary: workSummary,
    entries: rawRows.flatMap((entry) => {
      const clipped = clipWorkInterval(
        {
          memberId: entry.workspaceMemberId,
          startedAt: entry.startedAt,
          endedAt: entry.endedAt,
        },
        rangeStart,
        rangeEnd,
      )
      if (!clipped) return []
      const effectiveRate =
        entryRateMap.get(entry.id)?.effectiveRate ?? defaultRate
      return [
        {
          id: entry.id,
          workspaceMemberId: entry.workspaceMemberId,
          date: formatDateInTimeZone(clipped.startedAt, timezone),
          memberName: member.userName ?? member.email,
          memberImage: member.userImage ?? null,
          projectId: entry.projectId ?? '',
          taskId: entry.taskId ?? null,
          projectName: entry.projectName ?? null,
          clientName: entry.clientName ?? null,
          tagIds: tagIdsByEntry.get(entry.id) ?? [],
          tagNames: tagNamesByEntry.get(entry.id) ?? [],
          description: entry.description,
          startedAt: clipped.startedAt.toISOString(),
          endedAt: clipped.endedAt.toISOString(),
          durationSeconds: clipped.seconds,
          billable: entry.billable,
          notes: entry.notes ?? '',
          billableAmount: entry.billable
            ? (clipped.seconds / 3600) * effectiveRate
            : null,
          effectiveRate: entry.billable ? effectiveRate : null,
        },
      ]
    }),
  }
}

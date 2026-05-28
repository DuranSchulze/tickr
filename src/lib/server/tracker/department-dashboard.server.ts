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
} from '#/db/schema'
import { and, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm'
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

export async function getDepartmentDashboard(data: {
  startDate: string
  endDate: string
}): Promise<DepartmentDashboard> {
  const access = await requireWorkspaceAccess()
  assertAtLeastManager(access)

  const departmentId = access.member.departmentId
  if (!departmentId) {
    throw new Error(
      'You are not assigned to a department. Ask your admin to assign you to one.',
    )
  }

  const workspaceId = access.workspace.id
  const defaultRate = Number(access.workspace.defaultBillableRate ?? 0)
  const currency = access.workspace.billableCurrency ?? 'PHP'

  const rangeStart = new Date(`${data.startDate}T00:00:00`)
  const rangeEnd = new Date(`${data.endDate}T23:59:59.999`)

  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  const dow = weekStart.getDay()
  weekStart.setDate(weekStart.getDate() + (dow === 0 ? -6 : 1 - dow))
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Fetch department info, active members, and time entries in parallel
  const [deptRow, memberRows] = await Promise.all([
    db
      .select({
        id: departments.id,
        name: departments.name,
        color: departments.color,
      })
      .from(departments)
      .where(
        and(
          eq(departments.id, departmentId),
          eq(departments.workspaceId, workspaceId),
        ),
      )
      .limit(1)
      .then((r) => r[0]),
    db
      .select({
        id: workspaceMembers.id,
        email: workspaceMembers.email,
        userId: workspaceMembers.userId,
        billableRate: workspaceMembers.billableRate,
      })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.departmentId, departmentId),
          eq(workspaceMembers.status, 'ACTIVE'),
        ),
      ),
  ])

  if (!deptRow) throw new Error('Department not found.')

  const memberIds = memberRows.map((m) => m.id)
  const userIds = memberRows
    .map((m) => m.userId)
    .filter((id): id is string => id != null)

  if (memberIds.length === 0) {
    return {
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

  // Fetch user names and time entries in parallel
  const [userRows, entryRows, tagEntryRows] = await Promise.all([
    userIds.length > 0
      ? db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, userIds))
      : Promise.resolve([]),
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

  const userMap = new Map(userRows.map((u) => [u.id, u.name]))
  const memberMap = new Map(
    memberRows
      .map((m) => ({
        ...m,
        name: m.userId ? (userMap.get(m.userId) ?? m.email) : m.email,
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

  const dailyTotals = [...dailyMap.entries()]
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

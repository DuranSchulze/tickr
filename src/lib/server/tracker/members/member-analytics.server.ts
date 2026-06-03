import { db } from '#/db'
import { timeEntries, workspaceMembers } from '#/db/schema'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../../workspace-access.server'

export type MemberStat = {
  memberId: string
  totalSeconds: number
  billableSeconds: number
  entryCount: number
  thisWeekSeconds: number
  thisMonthSeconds: number
  topProjects: Array<{ projectId: string; seconds: number }>
}

export async function getMemberAnalytics(): Promise<MemberStat[]> {
  const access = await requireWorkspaceAccess()
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'

  // Role-scoped visibility, mirroring exportMembersCsv:
  // - OWNER/ADMIN: all members in the workspace
  // - MANAGER (with a department): members in their department
  // - everyone else: only themselves
  const entryConditions: SQL[] = [
    eq(timeEntries.workspaceId, access.workspace.id),
    isNotNull(timeEntries.endedAt),
  ]

  if (level === 'OWNER' || level === 'ADMIN') {
    // no member restriction — all workspace entries
  } else if (level === 'MANAGER' && access.member.departmentId) {
    const deptMemberIds = db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.departmentId, access.member.departmentId))
    entryConditions.push(inArray(timeEntries.workspaceMemberId, deptMemberIds))
  } else {
    entryConditions.push(eq(timeEntries.workspaceMemberId, access.member.id))
  }

  const now = new Date()

  const weekStart = new Date(now)
  weekStart.setHours(0, 0, 0, 0)
  const dayOfWeek = weekStart.getDay()
  weekStart.setDate(
    weekStart.getDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek),
  )

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const entries = await db
    .select({
      workspaceMemberId: timeEntries.workspaceMemberId,
      durationSeconds: timeEntries.durationSeconds,
      billable: timeEntries.billable,
      startedAt: timeEntries.startedAt,
      projectId: timeEntries.projectId,
    })
    .from(timeEntries)
    .where(and(...entryConditions))

  const statsMap: Partial<
    Record<
      string,
      Omit<MemberStat, 'topProjects'> & {
        projectSeconds: Record<string, number>
      }
    >
  > = {}

  for (const entry of entries) {
    const id = entry.workspaceMemberId
    if (!statsMap[id]) {
      statsMap[id] = {
        memberId: id,
        totalSeconds: 0,
        billableSeconds: 0,
        entryCount: 0,
        thisWeekSeconds: 0,
        thisMonthSeconds: 0,
        projectSeconds: {},
      }
    }
    const s = statsMap[id]
    const secs = entry.durationSeconds
    s.totalSeconds += secs
    s.entryCount++
    if (entry.billable) s.billableSeconds += secs
    const entryStart = new Date(entry.startedAt)
    if (entryStart >= weekStart) s.thisWeekSeconds += secs
    if (entryStart >= monthStart) s.thisMonthSeconds += secs
    if (entry.projectId) {
      s.projectSeconds[entry.projectId] =
        (s.projectSeconds[entry.projectId] ?? 0) + secs
    }
  }

  return Object.values(statsMap)
    .filter((stat): stat is NonNullable<typeof stat> => Boolean(stat))
    .map(({ projectSeconds, ...rest }) => ({
      ...rest,
      topProjects: Object.entries(projectSeconds)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([projectId, seconds]) => ({ projectId, seconds })),
    }))
}

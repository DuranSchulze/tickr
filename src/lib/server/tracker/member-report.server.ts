import '@tanstack/react-start/server-only'
import { db } from '#/db'
import {
  timeEntries,
  timeEntryTags,
  tags,
  projects,
  clients,
  workspaceMembers,
  users,
  workspaces,
} from '#/db/schema'
import { and, eq, gte, lt, inArray, isNotNull } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { computeEffectiveRate } from '#/lib/time-tracker/billing'

export type MemberMonthlyReportEntry = {
  id: string
  date: string
  projectName: string | null
  clientName: string | null
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
  entries: MemberMonthlyReportEntry[]
  summary: {
    totalSeconds: number
    billableSeconds: number
    nonBillableSeconds: number
    entryCount: number
    totalBillableAmount: number
  }
}

/**
 * Returns a monthly time-entry report for a specific member.
 * - OWNER/ADMIN: can target any member in the workspace
 * - MANAGER: can only target members in their own department (or themselves)
 * - EMPLOYEE: can only target themselves
 */
export async function getMemberMonthlyReport(data: {
  memberId: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
}): Promise<MemberMonthlyReport> {
  const access = await requireWorkspaceAccess()
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  const currentMemberId = access.member.id

  // Permission gates
  if (level === 'EMPLOYEE' && data.memberId !== currentMemberId) {
    throw new Error('You can only export your own time entries.')
  }

  if (level === 'MANAGER' && data.memberId !== currentMemberId) {
    // Ensure the target member is in the same department
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

  // Build inclusive date boundaries from the selected range.
  // startDate is midnight at the start of the first day;
  // endDate is midnight at the start of the day AFTER the last day so the
  // existing lt(...) condition keeps endDate entries inclusive.
  const startDate = new Date(data.startDate + 'T00:00:00')
  const endDate = new Date(
    new Date(data.endDate + 'T00:00:00').getTime() + 86_400_000,
  )

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
      durationSeconds: timeEntries.durationSeconds,
      billable: timeEntries.billable,
      projectName: projects.name,
      clientName: clients.name,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .where(
      and(
        eq(timeEntries.workspaceId, access.workspace.id),
        eq(timeEntries.workspaceMemberId, data.memberId),
        isNotNull(timeEntries.endedAt),
        gte(timeEntries.startedAt, startDate),
        lt(timeEntries.startedAt, endDate),
      ),
    )
    .orderBy(timeEntries.startedAt)

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

  const pad = (n: number) => String(n).padStart(2, '0')
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  const effectiveRate = computeEffectiveRate(
    memberRow.billableRate ? Number(memberRow.billableRate) : null,
    defaultRate,
  )

  let totalSeconds = 0
  let billableSeconds = 0
  let totalBillableAmount = 0

  const entries: MemberMonthlyReportEntry[] = rawEntries.map((e) => {
    const hours = e.durationSeconds / 3600
    const billableAmount = e.billable ? hours * effectiveRate : null

    totalSeconds += e.durationSeconds
    if (e.billable) {
      billableSeconds += e.durationSeconds
      if (billableAmount) totalBillableAmount += billableAmount
    }

    return {
      id: e.id,
      date: fmtDate(e.startedAt),
      projectName: e.projectName ?? null,
      clientName: e.clientName ?? null,
      tagNames: tagsByEntry.get(e.id) ?? [],
      description: e.description,
      durationSeconds: e.durationSeconds,
      billable: e.billable,
      effectiveRate,
      billableAmount,
    }
  })

  return {
    memberId: data.memberId,
    memberName: memberRow.name ?? memberRow.email,
    memberEmail: memberRow.email,
    startDate: data.startDate,
    endDate: data.endDate,
    currency,
    entries,
    summary: {
      totalSeconds,
      billableSeconds,
      nonBillableSeconds: totalSeconds - billableSeconds,
      entryCount: entries.length,
      totalBillableAmount,
    },
  }
}

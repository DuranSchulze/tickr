import '@tanstack/react-start/server-only'
import { db } from '#/db'
import { workspaceMembers, users, timeEntries, projects } from '#/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { assertOwnerOrAdmin } from './shared/role-gates.server'

export type ActiveEntry = {
  id: string
  description: string
  projectName: string | null
  startedAt: string
}

export type WorkspaceMemberActivity = {
  memberId: string
  userId: string | null
  name: string
  avatarUrl: string | null
  activeEntry: ActiveEntry | null
}

export async function getWorkspaceActivity(): Promise<
  WorkspaceMemberActivity[]
> {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const rows = await db
    .select({
      memberId: workspaceMembers.id,
      userId: workspaceMembers.userId,
      name: users.name,
      avatarUrl: users.image,
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

  return rows.map((row) => ({
    memberId: row.memberId,
    userId: row.userId,
    name: row.name,
    avatarUrl: row.avatarUrl ?? null,
    activeEntry: row.entryId
      ? {
          id: row.entryId,
          description: row.description ?? '',
          projectName: row.projectName ?? null,
          startedAt: row.startedAt!.toISOString(),
        }
      : null,
  }))
}

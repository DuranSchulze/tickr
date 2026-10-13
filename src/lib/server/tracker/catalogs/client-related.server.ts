import '@tanstack/react-start/server-only'
import { and, asc, eq, exists, gt, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { clientRelatedSchema } from './client-related'
import { db } from '#/db'
import {
  clients,
  projects,
  projectTasks,
  tags,
  timeEntries,
  timeEntryTags,
} from '#/db/schema'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import { assertCanReadCatalogs } from '../shared/role-gates.server'

export async function getClientRelated(
  input: z.infer<typeof clientRelatedSchema>,
) {
  const access = await requireWorkspaceAccess()
  assertCanReadCatalogs(access)
  const workspaceId = access.workspace.id
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(eq(clients.workspaceId, workspaceId), eq(clients.id, input.clientId)),
    )
    .limit(1)
  if (!client) throw new Error('Client not found or no longer available.')

  if (input.kind === 'tasks') {
    const cursor = input.cursor
    const rows = await db
      .select({
        id: projectTasks.id,
        name: projectTasks.name,
        color: projects.color,
        archived: projectTasks.archived,
        projectName: projects.name,
      })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(
        and(
          eq(projectTasks.workspaceId, workspaceId),
          eq(projects.workspaceId, workspaceId),
          eq(projects.clientId, input.clientId),
          cursor
            ? or(
                gt(projectTasks.name, cursor.name),
                and(
                  eq(projectTasks.name, cursor.name),
                  gt(projectTasks.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(projectTasks.name), asc(projectTasks.id))
      .limit(21)
    const items = rows.slice(0, 20)
    const last = items.at(-1)
    return {
      items,
      nextCursor:
        rows.length > 20 && last ? { name: last.name, id: last.id } : undefined,
    }
  }

  const table = input.kind === 'projects' ? projects : tags
  const cursor = input.cursor
  const after = cursor
    ? or(
        gt(table.name, cursor.name),
        and(eq(table.name, cursor.name), gt(table.id, cursor.id)),
      )
    : undefined
  // EXISTS avoids grouping or transferring the client's entire time-entry history.
  const relation =
    input.kind === 'projects'
      ? eq(projects.clientId, input.clientId)
      : exists(
          db
            .select({ id: timeEntryTags.tagId })
            .from(timeEntryTags)
            .innerJoin(
              timeEntries,
              eq(timeEntries.id, timeEntryTags.timeEntryId),
            )
            .innerJoin(projects, eq(projects.id, timeEntries.projectId))
            .where(
              and(
                eq(timeEntryTags.tagId, tags.id),
                eq(timeEntries.workspaceId, workspaceId),
                eq(projects.workspaceId, workspaceId),
                eq(projects.clientId, input.clientId),
              ),
            ),
        )
  const rows = await db
    .select({
      id: table.id,
      name: table.name,
      color: table.color,
      archived: table.archived,
      projectName: sql<string | null>`null`,
    })
    .from(table)
    .where(and(eq(table.workspaceId, workspaceId), relation, after))
    .orderBy(asc(table.name), asc(table.id))
    .limit(21)
  const items = rows.slice(0, 20)
  const last = items.at(-1)
  return {
    items,
    nextCursor:
      rows.length > 20 && last ? { name: last.name, id: last.id } : undefined,
  }
}

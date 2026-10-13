import '@tanstack/react-start/server-only'
import { and, asc, eq, gt, or } from 'drizzle-orm'
import type { z } from 'zod'
import type { projectTasksPageSchema } from './project-detail'
import { db } from '#/db'
import { clients, projects, projectTasks } from '#/db/schema'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import {
  assertCanManageCatalogs,
  assertCanReadCatalogs,
} from '../shared/role-gates.server'

async function findProject(workspaceId: string, projectId: string) {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      color: projects.color,
      archived: projects.archived,
      clientId: clients.id,
      clientName: clients.name,
      clientStatus: clients.clientStatus,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(clients.workspaceId, workspaceId),
        eq(projects.id, projectId),
      ),
    )
    .limit(1)
  return rows.at(0) ?? null
}

export async function getProjectDetail({ projectId }: { projectId: string }) {
  const access = await requireWorkspaceAccess()
  assertCanReadCatalogs(access)
  return findProject(access.workspace.id, projectId)
}

export async function getProjectTasksPage({
  projectId,
  cursor,
}: z.infer<typeof projectTasksPageSchema>) {
  const access = await requireWorkspaceAccess()
  assertCanReadCatalogs(access)
  if (!(await findProject(access.workspace.id, projectId)))
    throw new Error('Project not found or no longer available.')
  const rows = await db
    .select({
      id: projectTasks.id,
      name: projectTasks.name,
      archived: projectTasks.archived,
    })
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.workspaceId, access.workspace.id),
        eq(projectTasks.projectId, projectId),
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

export async function createCatalogProjectTask(data: {
  projectId: string
  name: string
}) {
  const access = await requireWorkspaceAccess()
  assertCanManageCatalogs(access)
  const project = await findProject(access.workspace.id, data.projectId)
  if (!project) throw new Error('Project not found or no longer available.')
  if (project.archived || project.clientStatus !== 'ACTIVE')
    throw new Error('New tasks require an active project and client.')
  const { createTask } = await import('./tasks.server')
  return createTask(data)
}

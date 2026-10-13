import '@tanstack/react-start/server-only'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '#/db'
import {
  clients,
  projects,
  projectTasks,
  tags,
  timeEntries,
  timeEntryTags,
} from '#/db/schema'
import { toFiniteRate } from '#/lib/time-tracker/billing'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import { assertCanReadCatalogs } from '../shared/role-gates.server'
import { fetchClientStats, fetchProjectStats } from './paginated.server'

export type ClientDetailProject = {
  id: string
  name: string
  color: string
  archived: boolean
  totalSeconds: number
  billableAmount: number
  activeMembersCount: number
  taskCount: number
}

export type ClientDetailTask = {
  id: string
  name: string
  archived: boolean
  projectId: string
  projectName: string
}

export type ClientDetailTag = {
  id: string
  name: string
  color: string
  totalSeconds: number
  entryCount: number
}

export type ClientDetail = {
  client: {
    id: string
    name: string
    clientStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
    defaultBillableRate: number | null
    totalSeconds: number
    billableAmount: number
    activeMembersCount: number
    projectCount: number
    taskCount: number
    tagCount: number
  }
  projects: ClientDetailProject[]
  tasks: ClientDetailTask[]
  tags: ClientDetailTag[]
}

/**
 * Loads a single client with everything nested under it for the detail page:
 * its projects (with per-project stats and task counts), the tasks across those
 * projects, and the tags applied to time entries logged against the client.
 *
 * Returns null when the client does not exist in the caller's workspace so the
 * route can render a not-found state instead of leaking other workspaces' data.
 */
export async function getClientDetail({
  clientId,
}: {
  clientId: string
}): Promise<ClientDetail | null> {
  const access = await requireWorkspaceAccess()
  assertCanReadCatalogs(access)
  const workspaceId = access.workspace.id
  const defaultRate = toFiniteRate(
    parseFloat(access.workspace.defaultBillableRate ?? '0'),
  )

  const [client] = await db
    .select({
      id: clients.id,
      name: clients.name,
      clientStatus: clients.clientStatus,
      defaultBillableRate: clients.defaultBillableRate,
    })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
    .limit(1)

  if (!client) return null

  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      color: projects.color,
      archived: projects.archived,
    })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.clientId, client.id),
      ),
    )
    .orderBy(asc(projects.name))

  const projectIds = projectRows.map((p) => p.id)

  const [clientStatsRows, projectStatsRows, taskCountRows, taskRows, tagRows] =
    await Promise.all([
      fetchClientStats(workspaceId, [client.id], defaultRate),
      fetchProjectStats(workspaceId, projectIds, defaultRate),
      projectIds.length > 0
        ? db
            .select({
              projectId: projectTasks.projectId,
              taskCount: sql<number>`count(*)::int`,
            })
            .from(projectTasks)
            .where(
              and(
                eq(projectTasks.workspaceId, workspaceId),
                inArray(projectTasks.projectId, projectIds),
                eq(projectTasks.archived, false),
              ),
            )
            .groupBy(projectTasks.projectId)
        : Promise.resolve([] as { projectId: string; taskCount: number }[]),
      projectIds.length > 0
        ? db
            .select({
              id: projectTasks.id,
              name: projectTasks.name,
              archived: projectTasks.archived,
              projectId: projectTasks.projectId,
            })
            .from(projectTasks)
            .where(
              and(
                eq(projectTasks.workspaceId, workspaceId),
                inArray(projectTasks.projectId, projectIds),
              ),
            )
            .orderBy(asc(projectTasks.name))
        : Promise.resolve(
            [] as {
              id: string
              name: string
              archived: boolean
              projectId: string
            }[],
          ),
      projectIds.length > 0
        ? db
            .select({
              id: tags.id,
              name: tags.name,
              color: tags.color,
              totalSeconds:
                sql<number>`coalesce(sum(${timeEntries.durationSeconds}) filter (where ${timeEntries.endedAt} is not null), 0)::int`.as(
                  'total_seconds',
                ),
              entryCount:
                sql<number>`count(distinct ${timeEntries.id}) filter (where ${timeEntries.endedAt} is not null)::int`.as(
                  'entry_count',
                ),
            })
            .from(timeEntryTags)
            .innerJoin(
              timeEntries,
              eq(timeEntries.id, timeEntryTags.timeEntryId),
            )
            .innerJoin(projects, eq(projects.id, timeEntries.projectId))
            .innerJoin(tags, eq(tags.id, timeEntryTags.tagId))
            .where(
              and(
                eq(timeEntries.workspaceId, workspaceId),
                eq(projects.clientId, client.id),
              ),
            )
            .groupBy(tags.id, tags.name, tags.color)
            .orderBy(desc(sql`sum(${timeEntries.durationSeconds})`))
        : Promise.resolve(
            [] as {
              id: string
              name: string
              color: string
              totalSeconds: number
              entryCount: number
            }[],
          ),
    ])

  const projectStatsMap = new Map(projectStatsRows.map((s) => [s.projectId, s]))
  const taskCountMap = new Map(taskCountRows.map((r) => [r.projectId, r]))
  const projectNameMap = new Map(projectRows.map((p) => [p.id, p.name]))
  const clientStats = clientStatsRows[0]

  const detailProjects: ClientDetailProject[] = projectRows.map((p) => {
    const stats = projectStatsMap.get(p.id)
    return {
      ...p,
      totalSeconds: stats?.totalSeconds ?? 0,
      billableAmount: stats?.billableAmount ?? 0,
      activeMembersCount: stats?.activeMembersCount ?? 0,
      taskCount: taskCountMap.get(p.id)?.taskCount ?? 0,
    }
  })

  const tasks: ClientDetailTask[] = taskRows.map((t) => ({
    ...t,
    projectName: projectNameMap.get(t.projectId) ?? '',
  }))

  return {
    client: {
      id: client.id,
      name: client.name,
      clientStatus: client.clientStatus,
      defaultBillableRate:
        client.defaultBillableRate == null
          ? null
          : Number(client.defaultBillableRate),
      totalSeconds: clientStats?.totalSeconds ?? 0,
      billableAmount: clientStats?.billableAmount ?? 0,
      activeMembersCount: clientStats?.activeMembersCount ?? 0,
      projectCount: projectRows.length,
      taskCount: taskRows.filter((t) => !t.archived).length,
      tagCount: tagRows.length,
    },
    projects: detailProjects,
    tasks,
    tags: tagRows,
  }
}

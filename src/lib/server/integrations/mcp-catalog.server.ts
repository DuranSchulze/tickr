import '@tanstack/react-start/server-only'
import { and, asc, count, eq, ilike, inArray, ne, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import {
  clients,
  projectTasks,
  projects,
  tags,
  users,
  workspaceMembers,
  workspaces,
} from '#/db/schema'
import { failure, validationMessage } from './mcp-time-entries.server'
import type { McpToolResult } from './mcp-time-entries.server'

/** Tags are a short list in practice; past this the assistant should search. */
export const MCP_MAX_TAGS = 200

export type McpWorkspaceRef = { id: string; name: string; timezone: string }

export type McpMembership = {
  workspace: McpWorkspaceRef & { locationTrackingEnabled: boolean }
  memberId: string
  email: string
}

/** The caller's ACTIVE memberships, the same rule the read tool uses. */
export async function listMcpMemberships(
  userId: string,
): Promise<McpMembership[]> {
  const rows = await db
    .select({
      memberId: workspaceMembers.id,
      id: workspaces.id,
      name: workspaces.name,
      timezone: workspaces.timezone,
      locationTrackingEnabled: workspaces.locationTrackingEnabled,
      email: users.email,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, 'ACTIVE'),
      ),
    )
    .orderBy(asc(workspaces.name), asc(workspaces.id))
  return rows.map((row) => ({
    workspace: {
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      locationTrackingEnabled: row.locationTrackingEnabled,
    },
    memberId: row.memberId,
    email: row.email,
  }))
}

export function workspaceRef(membership: McpMembership): McpWorkspaceRef {
  const { id, name, timezone } = membership.workspace
  return { id, name, timezone }
}

/**
 * Picks the workspace a call acts on: the named one if the caller is an
 * active member, otherwise their only workspace. With several and none named,
 * the error lists them so the assistant can ask or retry.
 */
export function pickMcpWorkspace(
  memberships: McpMembership[],
  workspaceId: string | undefined,
): McpMembership | McpToolResult<never> {
  if (workspaceId) {
    const match = memberships.find((m) => m.workspace.id === workspaceId)
    return (
      match ??
      failure(
        'workspace_not_accessible',
        'That workspace is not available to you.',
      )
    )
  }
  if (memberships.length === 1) return memberships[0]
  if (memberships.length === 0)
    return failure(
      'workspace_not_accessible',
      'You are not an active member of any workspace.',
    )
  const options = memberships
    .map((m) => `${m.workspace.name} (${m.workspace.id})`)
    .join(', ')
  return failure(
    'workspace_required',
    `You belong to several workspaces. Pass workspaceId, one of: ${options}.`,
  )
}

export function isToolFailure(
  value: McpMembership | McpToolResult<never>,
): value is McpToolResult<never> {
  return 'ok' in value
}

/**
 * Projects the timer picker offers: not archived, and the client is not
 * INACTIVE. SUSPENDED clients stay selectable (the app warns about them), so
 * their status is returned. The server-side catalog check does not look at
 * client status, so MCP writes enforce this separately.
 */
const selectableProject = (workspaceId: string) =>
  and(
    eq(projects.workspaceId, workspaceId),
    eq(projects.archived, false),
    ne(clients.clientStatus, 'INACTIVE'),
  )

/** True when the project is one the picker would offer in this workspace. */
export async function isSelectableProject(
  workspaceId: string,
  projectId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(
      clients,
      and(
        eq(clients.id, projects.clientId),
        eq(clients.workspaceId, projects.workspaceId),
      ),
    )
    .where(and(eq(projects.id, projectId), selectableProject(workspaceId)))
    .limit(1)
  return row !== undefined
}

export const mcpCatalogInputSchema = z.strictObject({
  workspaceId: z.string().trim().min(1).max(30).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
})

export type McpCatalogOutput = {
  workspaces: McpWorkspaceRef[]
  workspace: McpWorkspaceRef
  projects: Array<{
    id: string
    name: string
    client: {
      id: string
      name: string
      status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE'
    }
    tasks: Array<{ id: string; name: string }>
  }>
  tags: Array<{ id: string; name: string }>
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasMore: boolean
  }
}

/**
 * `list_my_catalog`: the projects (with their client and tasks) and tags you
 * can log time against in one workspace. IDs from here are what the write
 * tools accept; nothing is ever matched by name.
 */
export async function listMyCatalog(
  userId: string,
  rawInput: unknown,
): Promise<McpToolResult<McpCatalogOutput>> {
  const input = mcpCatalogInputSchema.safeParse(rawInput ?? {})
  if (!input.success)
    return failure(
      'invalid_arguments',
      validationMessage(input.error, 'workspaceId, search, page, limit'),
    )
  const { workspaceId, search, page, limit } = input.data

  try {
    const memberships = await listMcpMemberships(userId)
    const picked = pickMcpWorkspace(memberships, workspaceId)
    if (isToolFailure(picked)) return picked
    const wsId = picked.workspace.id

    const where = and(
      selectableProject(wsId),
      search
        ? or(
            ilike(projects.name, `%${search}%`),
            ilike(clients.name, `%${search}%`),
          )
        : undefined,
    )
    const projectJoin = and(
      eq(clients.id, projects.clientId),
      eq(clients.workspaceId, projects.workspaceId),
    )

    const [projectRows, [{ total }], tagRows] = await Promise.all([
      db
        .select({
          id: projects.id,
          name: projects.name,
          clientId: clients.id,
          clientName: clients.name,
          clientStatus: clients.clientStatus,
        })
        .from(projects)
        .innerJoin(clients, projectJoin)
        .where(where)
        .orderBy(asc(clients.name), asc(projects.name), asc(projects.id))
        .limit(limit)
        .offset((page - 1) * limit),
      db
        .select({ total: count() })
        .from(projects)
        .innerJoin(clients, projectJoin)
        .where(where),
      db
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(and(eq(tags.workspaceId, wsId), eq(tags.archived, false)))
        .orderBy(asc(tags.name), asc(tags.id))
        .limit(MCP_MAX_TAGS),
    ])

    const taskRows = projectRows.length
      ? await db
          .select({
            id: projectTasks.id,
            name: projectTasks.name,
            projectId: projectTasks.projectId,
          })
          .from(projectTasks)
          .where(
            and(
              eq(projectTasks.workspaceId, wsId),
              eq(projectTasks.archived, false),
              inArray(
                projectTasks.projectId,
                projectRows.map((p) => p.id),
              ),
            ),
          )
          .orderBy(asc(projectTasks.name), asc(projectTasks.id))
      : []

    const totalPages = Math.max(1, Math.ceil(total / limit))
    return {
      ok: true,
      structuredContent: {
        workspaces: memberships.map(workspaceRef),
        workspace: workspaceRef(picked),
        projects: projectRows.map((p) => ({
          id: p.id,
          name: p.name,
          client: {
            id: p.clientId,
            name: p.clientName,
            status: p.clientStatus,
          },
          tasks: taskRows
            .filter((t) => t.projectId === p.id)
            .map((t) => ({ id: t.id, name: t.name })),
        })),
        tags: tagRows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasMore: page < totalPages,
        },
      },
    }
  } catch {
    return failure(
      'temporarily_unavailable',
      'Tickr could not load your projects right now. Please try again shortly.',
      true,
    )
  }
}

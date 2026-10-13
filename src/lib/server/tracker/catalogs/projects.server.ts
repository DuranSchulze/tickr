import { z } from 'zod'
import { db } from '#/db'
import { clients, projects } from '#/db/schema'
import { and, eq, ilike, inArray } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import { assertCanManageCatalogs } from '../shared/role-gates.server'
import { createAuditLog } from '../audit/audit-logger.server'
import type {
  createProjectSchema,
  idSchema,
  updateProjectSchema,
} from '../shared/schemas'

export async function createProject(data: z.infer<typeof createProjectSchema>) {
  const access = await requireWorkspaceAccess()
  assertCanManageCatalogs(access)

  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.id, data.clientId),
        eq(clients.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)
  if (!client)
    throw new Error('Selected client was not found in this workspace.')

  const [existing] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, access.workspace.id),
        eq(projects.clientId, data.clientId),
        ilike(projects.name, data.name),
      ),
    )
    .limit(1)
  if (existing)
    throw new Error(
      `A project named "${data.name}" already exists for this client.`,
    )

  const [created] = await db
    .insert(projects)
    .values({
      workspaceId: access.workspace.id,
      clientId: data.clientId,
      name: data.name,
      color: data.color,
    })
    .returning()

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'PROJECT_CREATE',
    targetType: 'project',
    targetId: created.id,
    details: data.name,
  })
}

export async function updateProject(data: z.infer<typeof updateProjectSchema>) {
  const access = await requireWorkspaceAccess()
  assertCanManageCatalogs(access)

  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.id, data.clientId),
        eq(clients.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)
  if (!client)
    throw new Error('Selected client was not found in this workspace.')

  await db
    .update(projects)
    .set({ name: data.name, color: data.color, clientId: data.clientId })
    .where(
      and(
        eq(projects.id, data.id),
        eq(projects.workspaceId, access.workspace.id),
      ),
    )

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'PROJECT_EDIT',
    targetType: 'project',
    targetId: data.id,
    details: data.name,
  })
}

const bulkIdsSchema = z.object({ ids: z.array(z.string()).min(1) })

export async function bulkArchiveProjects(data: z.infer<typeof bulkIdsSchema>) {
  const access = await requireWorkspaceAccess()
  assertCanManageCatalogs(access)

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      color: projects.color,
      clientId: projects.clientId,
    })
    .from(projects)
    .where(
      and(
        inArray(projects.id, data.ids),
        eq(projects.workspaceId, access.workspace.id),
      ),
    )

  await db
    .update(projects)
    .set({ archived: true })
    .where(
      and(
        inArray(projects.id, data.ids),
        eq(projects.workspaceId, access.workspace.id),
      ),
    )

  await Promise.all(
    rows.map((row) => {
      void createAuditLog({
        workspaceId: access.workspace.id,
        actorId: access.user.id,
        actorEmail: access.user.email,
        action: 'PROJECT_ARCHIVE',
        targetType: 'project',
        targetId: row.id,
        details: row.name,
      })
    }),
  )
}

export async function bulkActivateProjects(
  data: z.infer<typeof bulkIdsSchema>,
) {
  const access = await requireWorkspaceAccess()
  assertCanManageCatalogs(access)

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      color: projects.color,
      clientId: projects.clientId,
    })
    .from(projects)
    .where(
      and(
        inArray(projects.id, data.ids),
        eq(projects.workspaceId, access.workspace.id),
      ),
    )

  await db
    .update(projects)
    .set({ archived: false })
    .where(
      and(
        inArray(projects.id, data.ids),
        eq(projects.workspaceId, access.workspace.id),
      ),
    )

  await Promise.all(
    rows.map((row) => {
      void createAuditLog({
        workspaceId: access.workspace.id,
        actorId: access.user.id,
        actorEmail: access.user.email,
        action: 'PROJECT_ACTIVATE',
        targetType: 'project',
        targetId: row.id,
        details: row.name,
      })
    }),
  )
}

export async function archiveProject(data: z.infer<typeof idSchema>) {
  const access = await requireWorkspaceAccess()
  assertCanManageCatalogs(access)

  const [project] = await db
    .select({
      name: projects.name,
      color: projects.color,
      clientId: projects.clientId,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, data.id),
        eq(projects.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)

  await db
    .update(projects)
    .set({ archived: true })
    .where(
      and(
        eq(projects.id, data.id),
        eq(projects.workspaceId, access.workspace.id),
      ),
    )

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'PROJECT_ARCHIVE',
    targetType: 'project',
    targetId: data.id,
    details: project?.name ?? null,
  })
}

export async function activateProject(data: z.infer<typeof idSchema>) {
  const access = await requireWorkspaceAccess()
  assertCanManageCatalogs(access)

  const [project] = await db
    .select({
      name: projects.name,
      color: projects.color,
      clientId: projects.clientId,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, data.id),
        eq(projects.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)

  await db
    .update(projects)
    .set({ archived: false })
    .where(
      and(
        eq(projects.id, data.id),
        eq(projects.workspaceId, access.workspace.id),
      ),
    )

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'PROJECT_ACTIVATE',
    targetType: 'project',
    targetId: data.id,
    details: project?.name ?? null,
  })
}

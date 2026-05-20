import type { z } from 'zod'
import { db } from '#/db'
import { departments } from '#/db/schema'
import { and, eq, ilike } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import { assertOwnerOrAdmin } from '../shared/role-gates.server'
import { createAuditLog } from '../audit/audit-logger.server'
import type {
  createDepartmentSchema,
  idSchema,
  updateDepartmentSchema,
} from '../shared/schemas'

export async function createDepartment(
  data: z.infer<typeof createDepartmentSchema>,
) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [existing] = await db
    .select()
    .from(departments)
    .where(
      and(
        eq(departments.workspaceId, access.workspace.id),
        ilike(departments.name, data.name),
      ),
    )
    .limit(1)
  if (existing)
    throw new Error(`A department named "${data.name}" already exists.`)

  const [created] = await db
    .insert(departments)
    .values({
      workspaceId: access.workspace.id,
      name: data.name,
      description: data.description,
      color: data.color,
    })
    .returning()

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'DEPT_CREATE',
    targetType: 'department',
    targetId: created.id,
    details: data.name,
  })
}

export async function updateDepartment(
  data: z.infer<typeof updateDepartmentSchema>,
) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  await db
    .update(departments)
    .set({
      name: data.name,
      description: data.description,
      ...(data.color !== undefined && { color: data.color }),
      ...(data.headMemberId !== undefined && {
        headMemberId: data.headMemberId || null,
      }),
    })
    .where(
      and(
        eq(departments.id, data.id),
        eq(departments.workspaceId, access.workspace.id),
      ),
    )

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'DEPT_EDIT',
    targetType: 'department',
    targetId: data.id,
    details: data.name,
  })
}

export async function deleteDepartment(data: z.infer<typeof idSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  await db
    .delete(departments)
    .where(
      and(
        eq(departments.id, data.id),
        eq(departments.workspaceId, access.workspace.id),
      ),
    )

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'DEPT_DELETE',
    targetType: 'department',
    targetId: data.id,
  })
}

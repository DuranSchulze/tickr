import type { z } from 'zod'
import { db } from '#/db'
import { workspaceRoles } from '#/db/schema'
import { and, eq, ilike } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { assertPermission, getAccessLevel } from './shared/role-gates.server'
import { createAuditLog } from './audit/audit-logger.server'
import {
  AuthorizationError,
  getRoleCreationViolation,
  getRolePermissionChangeViolation,
} from '#/lib/rbac/authorization'
import {
  isPermissionKey,
  sanitizePermissionOverrides,
} from '#/lib/rbac/permissions'
import type {
  createRoleSchema,
  updateRolePermissionsSchema,
} from './shared/schemas'

export async function createWorkspaceRole(
  data: z.infer<typeof createRoleSchema>,
) {
  const access = await requireWorkspaceAccess()
  assertPermission(
    access,
    'roles.manage_permissions',
    'You do not have permission to manage workspace roles.',
  )

  const actorLevel = getAccessLevel(access)
  const creationViolation = getRoleCreationViolation(
    actorLevel,
    data.permissionLevel,
    access.member.workspaceRole?.permissionOverrides,
  )
  if (creationViolation) throw new AuthorizationError(creationViolation)

  const [existing] = await db
    .select()
    .from(workspaceRoles)
    .where(
      and(
        eq(workspaceRoles.workspaceId, access.workspace.id),
        ilike(workspaceRoles.name, data.name),
      ),
    )
    .limit(1)

  if (existing) {
    throw new Error(
      `A role named "${data.name}" already exists in this workspace.`,
    )
  }

  const [created] = await db
    .insert(workspaceRoles)
    .values({
      workspaceId: access.workspace.id,
      name: data.name,
      permissionLevel: data.permissionLevel,
      color: data.color,
    })
    .returning()

  await createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'ROLE_CREATE',
    targetType: 'role',
    targetId: created.id,
    details: `${data.name} (${data.permissionLevel})`,
  })
}

export async function updateWorkspaceRolePermissions(
  data: z.infer<typeof updateRolePermissionsSchema>,
) {
  const access = await requireWorkspaceAccess()
  assertPermission(
    access,
    'roles.manage_permissions',
    'You do not have permission to manage role permissions.',
  )

  const unknownKeys = Object.keys(data.overrides).filter(
    (key) => !isPermissionKey(key),
  )
  if (unknownKeys.length > 0) {
    throw new Error('One or more permissions are not supported.')
  }

  const [role] = await db
    .select()
    .from(workspaceRoles)
    .where(
      and(
        eq(workspaceRoles.id, data.roleId),
        eq(workspaceRoles.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)

  if (!role) throw new Error('Role not found in this workspace.')
  const overrides = sanitizePermissionOverrides(data.overrides)
  const violation = getRolePermissionChangeViolation({
    actorLevel: getAccessLevel(access),
    actorOverrides: access.member.workspaceRole?.permissionOverrides,
    actorRoleId: access.member.workspaceRoleId,
    targetRoleId: role.id,
    targetLevel: role.permissionLevel,
    targetOverrides: role.permissionOverrides,
    requestedOverrides: overrides,
  })
  if (violation) throw new AuthorizationError(violation)

  await db
    .update(workspaceRoles)
    .set({ permissionOverrides: overrides })
    .where(
      and(
        eq(workspaceRoles.id, role.id),
        eq(workspaceRoles.workspaceId, access.workspace.id),
      ),
    )

  await createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'ROLE_PERMISSIONS_UPDATE',
    targetType: 'role',
    targetId: role.id,
    details: JSON.stringify({
      roleName: role.name,
      before: sanitizePermissionOverrides(role.permissionOverrides),
      after: overrides,
    }),
  })

  return { roleId: role.id, overrides }
}

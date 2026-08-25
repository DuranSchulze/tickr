import '@tanstack/react-start/server-only'
import { db } from '#/db'
import { workspaceMembers, workspaceRoles } from '#/db/schema'
import {
  AuthorizationError,
  canManageMemberRole,
} from '#/lib/rbac/authorization'
import type { PermissionKey } from '#/lib/rbac/permissions'
import { and, eq } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { WorkspaceAccess } from '../../workspace-access.server'
import {
  assertCanAccessMember,
  assertPermission,
  getAccessLevel,
  permissionScope,
} from './role-gates.server'

export function memberScopeCondition(
  access: WorkspaceAccess,
  permission: PermissionKey,
): SQL {
  assertPermission(access, permission)
  const workspace = eq(workspaceMembers.workspaceId, access.workspace.id)
  const scope = permissionScope(access, permission)

  if (scope === 'workspace') return workspace
  if (scope === 'self') {
    return and(workspace, eq(workspaceMembers.id, access.member.id))!
  }
  if (!access.member.departmentId) {
    throw new AuthorizationError(
      'You must be assigned to a department to access team data.',
    )
  }
  return and(
    workspace,
    eq(workspaceMembers.departmentId, access.member.departmentId),
  )!
}

export function assertCanCreateMemberInDepartment(
  access: WorkspaceAccess,
  departmentId?: string | null,
) {
  assertPermission(access, 'members.manage')
  const scope = permissionScope(access, 'members.manage')
  if (scope === 'workspace') return
  if (
    scope === 'department' &&
    access.member.departmentId &&
    departmentId === access.member.departmentId
  ) {
    return
  }
  throw new AuthorizationError(
    'You can only invite members into your assigned department.',
  )
}

export async function assertCanManageMemberTarget(
  access: WorkspaceAccess,
  target: {
    id: string
    departmentId?: string | null
    workspaceRoleId?: string | null
  },
) {
  assertPermission(access, 'members.manage')
  assertCanAccessMember(access, target)
  if (getAccessLevel(access) === 'OWNER') return

  const [targetRole] = target.workspaceRoleId
    ? await db
        .select({ permissionLevel: workspaceRoles.permissionLevel })
        .from(workspaceRoles)
        .where(
          and(
            eq(workspaceRoles.id, target.workspaceRoleId),
            eq(workspaceRoles.workspaceId, access.workspace.id),
          ),
        )
        .limit(1)
    : []
  const targetLevel = targetRole?.permissionLevel ?? 'EMPLOYEE'
  if (!canManageMemberRole(getAccessLevel(access), targetLevel)) {
    throw new AuthorizationError(
      'You cannot manage a member at or above your hierarchy level.',
    )
  }
}

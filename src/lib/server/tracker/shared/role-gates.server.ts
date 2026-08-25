import type { RolePermission } from '#/db/schema'
import {
  canAccessMemberWithinHierarchy,
  getPermissionScope,
  hasPermission,
} from '#/lib/rbac/permissions'
import type { PermissionKey } from '#/lib/rbac/permissions'
import { AuthorizationError } from '#/lib/rbac/authorization'

type AccessWithRole = {
  member: {
    id?: string
    departmentId?: string | null
    workspaceRole: {
      permissionLevel: RolePermission
      permissionOverrides?: unknown
    } | null
  }
}

export function getAccessLevel(access: AccessWithRole): RolePermission {
  return access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
}

export function can(
  access: AccessWithRole,
  permission: PermissionKey,
): boolean {
  return hasPermission(
    getAccessLevel(access),
    access.member.workspaceRole?.permissionOverrides,
    permission,
  )
}

export function assertPermission(
  access: AccessWithRole,
  permission: PermissionKey,
  message = 'You do not have permission to perform this action.',
) {
  if (!can(access, permission)) throw new AuthorizationError(message)
}

export function permissionScope(
  access: AccessWithRole,
  permission: PermissionKey,
) {
  return getPermissionScope(getAccessLevel(access), permission)
}

export function assertCanAccessMember(
  access: AccessWithRole,
  target: { id: string; departmentId?: string | null },
  message = 'You do not have permission to access this workspace member.',
) {
  if (!canAccessMember(access, target)) {
    throw new AuthorizationError(message)
  }
}

export function canAccessMember(
  access: AccessWithRole,
  target: { id: string; departmentId?: string | null },
) {
  return Boolean(
    access.member.id &&
    canAccessMemberWithinHierarchy({
      actorLevel: getAccessLevel(access),
      actorMemberId: access.member.id,
      actorDepartmentId: access.member.departmentId,
      targetMemberId: target.id,
      targetDepartmentId: target.departmentId,
    }),
  )
}

export function assertOwnerOrAdmin(access: AccessWithRole) {
  const l = getAccessLevel(access)
  if (l !== 'OWNER' && l !== 'ADMIN') {
    throw new AuthorizationError(
      'Only Owners and Admins can perform this action.',
    )
  }
}

export function assertOwner(access: AccessWithRole) {
  if (getAccessLevel(access) !== 'OWNER') {
    throw new AuthorizationError(
      'Only the workspace Owner can perform this action.',
    )
  }
}

export function assertAtLeastManager(access: AccessWithRole) {
  const l = getAccessLevel(access)
  if (l !== 'OWNER' && l !== 'ADMIN' && l !== 'MANAGER') {
    throw new AuthorizationError(
      'Only Owners, Admins, and Managers can perform this action.',
    )
  }
}

export function assertCanReadMembers(access: AccessWithRole) {
  assertPermission(
    access,
    'members.view',
    'You do not have permission to view workspace members.',
  )
}

export function assertCanManageMembers(access: AccessWithRole) {
  assertPermission(
    access,
    'members.manage',
    'You do not have permission to manage workspace members.',
  )
}

export function assertCanReadCatalogs(access: AccessWithRole) {
  assertPermission(
    access,
    'catalogs.view',
    'You do not have permission to view workspace catalogs.',
  )
}

export function assertCanManageCatalogs(access: AccessWithRole) {
  assertPermission(
    access,
    'catalogs.manage',
    'You do not have permission to manage workspace catalogs.',
  )
}

export function assertCanManageAllTimeEntries(access: AccessWithRole) {
  assertPermission(
    access,
    'time_entries.manage_all',
    "You do not have permission to manage other members' time entries.",
  )
}

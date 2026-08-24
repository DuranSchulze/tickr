import type { RolePermission } from '#/db/schema'
import {
  getEffectivePermissions,
  hasPermission,
  isOwnerControlledPermission,
  PERMISSION_KEYS,
} from './permissions'
import type { PermissionOverrides } from './permissions'

export class AuthorizationError extends Error {
  readonly code = 'FORBIDDEN'
  readonly status = 403

  constructor(message = 'You do not have permission to perform this action.') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export function getMembershipActivationDecision(
  status: 'ACTIVE' | 'INVITED' | 'DISABLED',
): 'allow' | 'activate' | 'deny' {
  if (status === 'DISABLED') return 'deny'
  if (status === 'INVITED') return 'activate'
  return 'allow'
}

export type RolePermissionChangeContext = {
  actorLevel: RolePermission
  actorOverrides: unknown
  actorRoleId: string | null
  targetRoleId: string
  targetLevel: RolePermission
  targetOverrides: unknown
  requestedOverrides: PermissionOverrides
}

export function getRolePermissionChangeViolation(
  context: RolePermissionChangeContext,
): string | null {
  if (context.targetLevel === 'OWNER') {
    return 'Owner permissions cannot be changed.'
  }
  if (context.actorRoleId === context.targetRoleId) {
    return 'You cannot change permissions for your own assigned role.'
  }
  if (
    context.actorLevel !== 'OWNER' &&
    ROLE_RANK[context.targetLevel] >= ROLE_RANK[context.actorLevel]
  ) {
    return 'You cannot change permissions for a role at or above your hierarchy level.'
  }

  const before = getEffectivePermissions(
    context.targetLevel,
    context.targetOverrides,
  )
  const after = getEffectivePermissions(
    context.targetLevel,
    context.requestedOverrides,
  )

  for (const permission of PERMISSION_KEYS) {
    if (before[permission] === after[permission]) continue
    if (
      context.actorLevel !== 'OWNER' &&
      isOwnerControlledPermission(permission)
    ) {
      return 'Only the workspace Owner can change protected permissions.'
    }
    if (
      after[permission] &&
      !hasPermission(context.actorLevel, context.actorOverrides, permission)
    ) {
      return 'You cannot grant a permission that you do not have.'
    }
  }

  return null
}

const ROLE_RANK: Record<RolePermission, number> = {
  EMPLOYEE: 0,
  MANAGER: 1,
  ADMIN: 2,
  OWNER: 3,
}

export function canManageRoleTarget(input: {
  actorLevel: RolePermission
  actorRoleId: string | null
  targetLevel: RolePermission
  targetRoleId: string
}) {
  if (input.targetLevel === 'OWNER') return false
  if (input.actorRoleId === input.targetRoleId) return false
  return (
    input.actorLevel === 'OWNER' ||
    ROLE_RANK[input.targetLevel] < ROLE_RANK[input.actorLevel]
  )
}

export function canManageMemberRole(
  actorLevel: RolePermission,
  targetLevel: RolePermission,
) {
  return (
    actorLevel === 'OWNER' || ROLE_RANK[targetLevel] < ROLE_RANK[actorLevel]
  )
}

export function canAssignRoleLevel(
  actorLevel: RolePermission,
  targetLevel: RolePermission,
) {
  if (targetLevel === 'OWNER') return false
  return (
    actorLevel === 'OWNER' || ROLE_RANK[targetLevel] < ROLE_RANK[actorLevel]
  )
}

export function getRoleCreationViolation(
  actorLevel: RolePermission,
  requestedLevel: RolePermission,
  actorOverrides?: unknown,
): string | null {
  if (requestedLevel === 'OWNER') {
    return 'Additional Owner roles cannot be created. Transfer ownership through the workspace ownership flow.'
  }
  if (requestedLevel === 'ADMIN' && actorLevel !== 'OWNER') {
    return 'Only the workspace Owner can create Admin roles.'
  }
  if (actorLevel !== 'OWNER') {
    const requestedPermissions = getEffectivePermissions(requestedLevel, {})
    for (const permission of PERMISSION_KEYS) {
      if (
        requestedPermissions[permission] &&
        !hasPermission(actorLevel, actorOverrides, permission)
      ) {
        return 'You cannot create a role containing permissions that you do not have.'
      }
    }
  }
  return null
}

export function getRoleAssignmentViolation(input: {
  actorLevel: RolePermission
  actorOverrides: unknown
  targetRoleLevel: RolePermission
  targetRoleOverrides: unknown
}): string | null {
  if (input.targetRoleLevel === 'OWNER') {
    return 'The Owner role can only be assigned through the workspace ownership transfer flow.'
  }
  if (input.actorLevel === 'OWNER') return null
  if (ROLE_RANK[input.targetRoleLevel] >= ROLE_RANK[input.actorLevel]) {
    return 'Only the workspace Owner can assign a role at or above your hierarchy level.'
  }

  const targetPermissions = getEffectivePermissions(
    input.targetRoleLevel,
    input.targetRoleOverrides,
  )
  for (const permission of PERMISSION_KEYS) {
    if (
      targetPermissions[permission] &&
      isOwnerControlledPermission(permission)
    ) {
      return 'Only the workspace Owner can assign a role containing protected permissions.'
    }
    if (
      targetPermissions[permission] &&
      !hasPermission(input.actorLevel, input.actorOverrides, permission)
    ) {
      return 'You cannot assign a role containing permissions that you do not have.'
    }
  }
  return null
}

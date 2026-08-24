import type { RolePermission } from '#/db/schema'

export const PERMISSION_GROUPS = [
  'Time tracking',
  'Analytics & reports',
  'People',
  'Workspace',
] as const

type PermissionGroup = (typeof PERMISSION_GROUPS)[number]

export type PermissionDataScope = 'workspace' | 'hierarchy'
export type PermissionDelegation = 'delegable' | 'owner-controlled'

type PermissionDefinition = {
  group: PermissionGroup
  label: string
  description: string
  defaults: readonly RolePermission[]
  dataScope: PermissionDataScope
  delegation: PermissionDelegation
}

export const PERMISSIONS = {
  'time_entries.manage_all': {
    group: 'Time tracking',
    label: 'Manage team entries',
    description:
      'Create, edit, or delete time entries belonging to other members.',
    defaults: ['OWNER', 'ADMIN'],
    dataScope: 'hierarchy',
    delegation: 'delegable',
  },
  'activity.view': {
    group: 'Analytics & reports',
    label: 'View team activity',
    description: 'View workspace activity and presence information.',
    defaults: ['OWNER', 'ADMIN', 'MANAGER'],
    dataScope: 'hierarchy',
    delegation: 'delegable',
  },
  'locations.view': {
    group: 'Analytics & reports',
    label: 'View member locations',
    description: 'View location information captured with time entries.',
    defaults: ['OWNER', 'ADMIN', 'MANAGER'],
    dataScope: 'hierarchy',
    delegation: 'delegable',
  },
  'members.view': {
    group: 'People',
    label: 'View members',
    description: 'View the workspace member directory and member details.',
    defaults: ['OWNER', 'ADMIN', 'MANAGER'],
    dataScope: 'hierarchy',
    delegation: 'delegable',
  },
  'members.manage': {
    group: 'People',
    label: 'Manage members',
    description: 'Invite, update, disable, and assign roles to members.',
    defaults: ['OWNER', 'ADMIN'],
    dataScope: 'hierarchy',
    delegation: 'delegable',
  },
  'catalogs.view': {
    group: 'Workspace',
    label: 'View catalogs',
    description:
      'View roles, projects, clients, tags, departments, and groups.',
    defaults: ['OWNER', 'ADMIN', 'MANAGER'],
    dataScope: 'workspace',
    delegation: 'delegable',
  },
  'catalogs.manage': {
    group: 'Workspace',
    label: 'Manage catalogs',
    description: 'Create and update workspace catalog records.',
    defaults: ['OWNER', 'ADMIN'],
    dataScope: 'workspace',
    delegation: 'delegable',
  },
  'catalogs.import': {
    group: 'Workspace',
    label: 'Import catalogs',
    description: 'Import catalog records from the connected Google Sheet.',
    defaults: ['OWNER', 'ADMIN', 'MANAGER'],
    dataScope: 'workspace',
    delegation: 'delegable',
  },
  'roles.manage_permissions': {
    group: 'Workspace',
    label: 'Manage role permissions',
    description: 'Change the capabilities granted to non-Owner roles.',
    defaults: ['OWNER', 'ADMIN'],
    dataScope: 'workspace',
    delegation: 'owner-controlled',
  },
  'workspace.settings.view': {
    group: 'Workspace',
    label: 'View workspace settings',
    description: 'Open workspace configuration and integration settings.',
    defaults: ['OWNER', 'ADMIN'],
    dataScope: 'workspace',
    delegation: 'delegable',
  },
  'workspace.settings.manage': {
    group: 'Workspace',
    label: 'Manage workspace settings',
    description: 'Change workspace-wide configuration and integrations.',
    defaults: ['OWNER'],
    dataScope: 'workspace',
    delegation: 'owner-controlled',
  },
  'audit_logs.view': {
    group: 'Workspace',
    label: 'View audit logs',
    description: 'Review security and administrative activity.',
    defaults: ['OWNER', 'ADMIN'],
    dataScope: 'workspace',
    delegation: 'delegable',
  },
  'billing.manage': {
    group: 'Workspace',
    label: 'Manage billing',
    description: 'View and change workspace subscription and billing settings.',
    defaults: ['OWNER'],
    dataScope: 'workspace',
    delegation: 'owner-controlled',
  },
} as const satisfies Record<string, PermissionDefinition>

export type PermissionKey = keyof typeof PERMISSIONS
export type PermissionOverrides = Partial<Record<PermissionKey, boolean>>
export type EffectivePermissions = Record<PermissionKey, boolean>
export type HierarchyScope = 'workspace' | 'department' | 'self'

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[]

export function isPermissionKey(value: string): value is PermissionKey {
  return Object.hasOwn(PERMISSIONS, value)
}

export function sanitizePermissionOverrides(
  value: unknown,
): PermissionOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const sanitized: PermissionOverrides = {}
  for (const [key, enabled] of Object.entries(value)) {
    if (isPermissionKey(key) && typeof enabled === 'boolean') {
      sanitized[key] = enabled
    }
  }
  return sanitized
}

export function getEffectivePermissions(
  permissionLevel: RolePermission,
  rawOverrides?: unknown,
): EffectivePermissions {
  const overrides = sanitizePermissionOverrides(rawOverrides)
  return Object.fromEntries(
    PERMISSION_KEYS.map((key) => [
      key,
      permissionLevel === 'OWNER'
        ? true
        : (overrides[key] ??
          (PERMISSIONS[key].defaults as readonly RolePermission[]).includes(
            permissionLevel,
          )),
    ]),
  ) as EffectivePermissions
}

export function hasPermission(
  permissionLevel: RolePermission,
  rawOverrides: unknown,
  permission: PermissionKey,
): boolean {
  if (permissionLevel === 'OWNER') return true
  const overrides = sanitizePermissionOverrides(rawOverrides)
  return (
    overrides[permission] ??
    (PERMISSIONS[permission].defaults as readonly RolePermission[]).includes(
      permissionLevel,
    )
  )
}

export function getHierarchyScope(
  permissionLevel: RolePermission,
): HierarchyScope {
  if (permissionLevel === 'OWNER' || permissionLevel === 'ADMIN') {
    return 'workspace'
  }
  if (permissionLevel === 'MANAGER') return 'department'
  return 'self'
}

export function getPermissionScope(
  permissionLevel: RolePermission,
  permission: PermissionKey,
): HierarchyScope {
  return PERMISSIONS[permission].dataScope === 'workspace'
    ? 'workspace'
    : getHierarchyScope(permissionLevel)
}

export function isOwnerControlledPermission(
  permission: PermissionKey,
): boolean {
  return PERMISSIONS[permission].delegation === 'owner-controlled'
}

export function canAccessMemberWithinHierarchy(input: {
  actorLevel: RolePermission
  actorMemberId: string
  actorDepartmentId?: string | null
  targetMemberId: string
  targetDepartmentId?: string | null
}): boolean {
  const scope = getHierarchyScope(input.actorLevel)
  if (scope === 'workspace') return true
  if (scope === 'self') return input.actorMemberId === input.targetMemberId
  return Boolean(
    input.actorDepartmentId &&
    input.targetDepartmentId &&
    input.actorDepartmentId === input.targetDepartmentId,
  )
}

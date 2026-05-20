import type { RolePermission } from '#/db/schema'

export type DefaultRoleDefinition = {
  name: string
  permissionLevel: RolePermission
  color: string
}

export const DEFAULT_WORKSPACE_ROLES: readonly DefaultRoleDefinition[] = [
  { name: 'Owner', permissionLevel: 'OWNER', color: '#0f172a' },
  { name: 'Admin', permissionLevel: 'ADMIN', color: '#7c3aed' },
  { name: 'Manager', permissionLevel: 'MANAGER', color: '#2563eb' },
  { name: 'Employee', permissionLevel: 'EMPLOYEE', color: '#14b8a6' },
] as const

export const DEFAULT_WORKSPACE_TIMEZONE = 'Asia/Manila'

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

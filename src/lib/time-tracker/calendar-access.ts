import type { RolePermission } from '#/db/schema'

export function canViewTeamCalendars(
  permissionLevel: RolePermission,
  canViewMembers: boolean,
): boolean {
  return (
    canViewMembers &&
    (permissionLevel === 'OWNER' || permissionLevel === 'ADMIN')
  )
}

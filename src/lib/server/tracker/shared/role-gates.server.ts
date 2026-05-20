type AccessWithRole = {
  member: { workspaceRole: { permissionLevel: string } | null }
}

function level(access: AccessWithRole): string {
  return access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
}

export function assertOwnerOrAdmin(access: AccessWithRole) {
  const l = level(access)
  if (l !== 'OWNER' && l !== 'ADMIN') {
    throw new Error('Only Owners and Admins can perform this action.')
  }
}

export function assertOwner(access: AccessWithRole) {
  if (level(access) !== 'OWNER') {
    throw new Error('Only the workspace Owner can perform this action.')
  }
}

export function assertAtLeastManager(access: AccessWithRole) {
  const l = level(access)
  if (l !== 'OWNER' && l !== 'ADMIN' && l !== 'MANAGER') {
    throw new Error(
      'Only Owners, Admins, and Managers can perform this action.',
    )
  }
}

export function assertCanReadMembers(access: AccessWithRole) {
  const l = level(access)
  if (l !== 'OWNER' && l !== 'ADMIN' && l !== 'MANAGER') {
    throw new Error('Only Owners, Admins, and Managers can view members.')
  }
}

export function assertCanReadCatalogs(access: AccessWithRole) {
  const l = level(access)
  if (l !== 'OWNER' && l !== 'ADMIN' && l !== 'MANAGER') {
    throw new Error('Only Owners, Admins, and Managers can view catalogs.')
  }
}

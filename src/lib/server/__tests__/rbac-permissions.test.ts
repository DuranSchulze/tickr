import { describe, expect, it } from 'vitest'
import {
  getEffectivePermissions,
  getHierarchyScope,
  getPermissionScope,
  hasPermission,
  isOwnerControlledPermission,
  canAccessMemberWithinHierarchy,
  PERMISSION_KEYS,
  sanitizePermissionOverrides,
} from '#/lib/rbac/permissions'
import {
  getRoleAssignmentViolation,
  getRoleCreationViolation,
  getMembershipActivationDecision,
  canManageMemberRole,
  getRolePermissionChangeViolation,
} from '#/lib/rbac/authorization'

describe('configurable workspace RBAC', () => {
  it('preserves the existing hierarchy defaults', () => {
    expect(hasPermission('EMPLOYEE', {}, 'members.view')).toBe(false)
    expect(hasPermission('EMPLOYEE', {}, 'time_entries.manage_all')).toBe(false)

    expect(hasPermission('MANAGER', {}, 'members.view')).toBe(true)
    expect(hasPermission('MANAGER', {}, 'catalogs.view')).toBe(true)
    expect(hasPermission('MANAGER', {}, 'catalogs.manage')).toBe(false)

    expect(hasPermission('ADMIN', {}, 'catalogs.manage')).toBe(true)
    expect(hasPermission('ADMIN', {}, 'billing.manage')).toBe(false)
  })

  it('applies workspace role overrides over hierarchy defaults', () => {
    const overrides = {
      'members.view': false,
      'catalogs.manage': true,
    }

    expect(hasPermission('MANAGER', overrides, 'members.view')).toBe(false)
    expect(hasPermission('MANAGER', overrides, 'catalogs.manage')).toBe(true)
  })

  it('always grants every registered permission to Owner', () => {
    const denied = Object.fromEntries(
      PERMISSION_KEYS.map((key) => [key, false]),
    )
    const effective = getEffectivePermissions('OWNER', denied)

    expect(Object.values(effective).every(Boolean)).toBe(true)
  })

  it('ignores malformed and unknown stored override values', () => {
    expect(
      sanitizePermissionOverrides({
        'members.view': false,
        'catalogs.view': 'yes',
        'future.unknown': true,
      }),
    ).toEqual({ 'members.view': false })

    expect(sanitizePermissionOverrides(null)).toEqual({})
    expect(sanitizePermissionOverrides([])).toEqual({})
  })

  it('uses registry defaults for permissions without an override', () => {
    const effective = getEffectivePermissions('MANAGER', {
      'members.view': false,
    })

    expect(effective['members.view']).toBe(false)
    expect(effective['locations.view']).toBe(true)
  })

  it('uses hierarchy as the ceiling for team data permissions', () => {
    expect(getHierarchyScope('OWNER')).toBe('workspace')
    expect(getHierarchyScope('ADMIN')).toBe('workspace')
    expect(getHierarchyScope('MANAGER')).toBe('department')
    expect(getHierarchyScope('EMPLOYEE')).toBe('self')
    expect(getPermissionScope('EMPLOYEE', 'members.view')).toBe('self')
    expect(getPermissionScope('EMPLOYEE', 'catalogs.view')).toBe('workspace')
  })

  it('marks only security-sensitive grants as Owner-controlled', () => {
    expect(isOwnerControlledPermission('billing.manage')).toBe(true)
    expect(isOwnerControlledPermission('workspace.settings.manage')).toBe(true)
    expect(isOwnerControlledPermission('roles.manage_permissions')).toBe(true)
    expect(isOwnerControlledPermission('members.manage')).toBe(false)
  })

  it('prevents editing the actor own role and all Owner roles', () => {
    expect(
      getRolePermissionChangeViolation({
        actorLevel: 'ADMIN',
        actorOverrides: {},
        actorRoleId: 'admin-role',
        targetRoleId: 'admin-role',
        targetLevel: 'ADMIN',
        targetOverrides: {},
        requestedOverrides: { 'members.view': false },
      }),
    ).toMatch(/own assigned role/i)

    expect(
      getRolePermissionChangeViolation({
        actorLevel: 'OWNER',
        actorOverrides: {},
        actorRoleId: 'owner-role',
        targetRoleId: 'other-owner-role',
        targetLevel: 'OWNER',
        targetOverrides: {},
        requestedOverrides: { 'billing.manage': false },
      }),
    ).toMatch(/Owner permissions/i)

    expect(
      getRolePermissionChangeViolation({
        actorLevel: 'MANAGER',
        actorOverrides: { 'roles.manage_permissions': true },
        actorRoleId: 'manager-a',
        targetRoleId: 'manager-b',
        targetLevel: 'MANAGER',
        targetOverrides: {},
        requestedOverrides: { 'members.view': false },
      }),
    ).toMatch(/at or above your hierarchy/i)
  })

  it('prevents non-Owners from changing protected grants or granting capabilities they lack', () => {
    expect(
      getRolePermissionChangeViolation({
        actorLevel: 'ADMIN',
        actorOverrides: {},
        actorRoleId: 'admin-role',
        targetRoleId: 'manager-role',
        targetLevel: 'MANAGER',
        targetOverrides: {},
        requestedOverrides: { 'billing.manage': true },
      }),
    ).toMatch(/Only the workspace Owner/i)

    expect(
      getRolePermissionChangeViolation({
        actorLevel: 'MANAGER',
        actorOverrides: { 'roles.manage_permissions': true },
        actorRoleId: 'manager-role',
        targetRoleId: 'employee-role',
        targetLevel: 'EMPLOYEE',
        targetOverrides: {},
        requestedOverrides: { 'members.manage': true },
      }),
    ).toMatch(/permission that you do not have/i)
  })

  it('allows bounded delegation and Owner-controlled changes by the Owner', () => {
    expect(
      getRolePermissionChangeViolation({
        actorLevel: 'ADMIN',
        actorOverrides: {},
        actorRoleId: 'admin-role',
        targetRoleId: 'manager-role',
        targetLevel: 'MANAGER',
        targetOverrides: {},
        requestedOverrides: { 'members.manage': true },
      }),
    ).toBeNull()

    expect(
      getRolePermissionChangeViolation({
        actorLevel: 'OWNER',
        actorOverrides: {},
        actorRoleId: 'owner-role',
        targetRoleId: 'admin-role',
        targetLevel: 'ADMIN',
        targetOverrides: {},
        requestedOverrides: { 'billing.manage': true },
      }),
    ).toBeNull()
  })

  it('enforces self, department, and workspace member visibility', () => {
    expect(
      canAccessMemberWithinHierarchy({
        actorLevel: 'EMPLOYEE',
        actorMemberId: 'employee-a',
        targetMemberId: 'employee-b',
      }),
    ).toBe(false)
    expect(
      canAccessMemberWithinHierarchy({
        actorLevel: 'EMPLOYEE',
        actorMemberId: 'employee-a',
        targetMemberId: 'employee-a',
      }),
    ).toBe(true)
    expect(
      canAccessMemberWithinHierarchy({
        actorLevel: 'MANAGER',
        actorMemberId: 'manager',
        actorDepartmentId: 'engineering',
        targetMemberId: 'engineer',
        targetDepartmentId: 'engineering',
      }),
    ).toBe(true)
    expect(
      canAccessMemberWithinHierarchy({
        actorLevel: 'MANAGER',
        actorMemberId: 'manager',
        actorDepartmentId: 'engineering',
        targetMemberId: 'sales-member',
        targetDepartmentId: 'sales',
      }),
    ).toBe(false)
    expect(
      canAccessMemberWithinHierarchy({
        actorLevel: 'ADMIN',
        actorMemberId: 'admin',
        targetMemberId: 'any-member',
      }),
    ).toBe(true)
  })

  it('prevents non-Owners from assigning peer, higher, or more capable roles', () => {
    expect(
      getRoleAssignmentViolation({
        actorLevel: 'MANAGER',
        actorOverrides: { 'members.manage': true },
        targetRoleLevel: 'MANAGER',
        targetRoleOverrides: {},
      }),
    ).toMatch(/at or above/i)
    expect(
      getRoleAssignmentViolation({
        actorLevel: 'ADMIN',
        actorOverrides: { 'catalogs.manage': false },
        targetRoleLevel: 'MANAGER',
        targetRoleOverrides: { 'catalogs.manage': true },
      }),
    ).toMatch(/permissions that you do not have/i)
    expect(
      getRoleAssignmentViolation({
        actorLevel: 'ADMIN',
        actorOverrides: { 'billing.manage': true },
        targetRoleLevel: 'MANAGER',
        targetRoleOverrides: { 'billing.manage': true },
      }),
    ).toMatch(/protected permissions/i)
    expect(
      getRoleAssignmentViolation({
        actorLevel: 'OWNER',
        actorOverrides: {},
        targetRoleLevel: 'ADMIN',
        targetRoleOverrides: {},
      }),
    ).toBeNull()
    expect(
      getRoleAssignmentViolation({
        actorLevel: 'OWNER',
        actorOverrides: {},
        targetRoleLevel: 'OWNER',
        targetRoleOverrides: {},
      }),
    ).toMatch(/ownership transfer flow/i)
  })

  it('prevents duplicate Owner roles and restricts Admin role creation', () => {
    expect(getRoleCreationViolation('OWNER', 'OWNER')).toMatch(
      /Additional Owner roles/i,
    )
    expect(getRoleCreationViolation('ADMIN', 'ADMIN')).toMatch(
      /Only the workspace Owner/i,
    )
    expect(getRoleCreationViolation('OWNER', 'ADMIN')).toBeNull()
    expect(
      getRoleCreationViolation('ADMIN', 'MANAGER', {
        'members.view': false,
      }),
    ).toContain('permissions that you do not have')
    expect(getRoleCreationViolation('ADMIN', 'MANAGER')).toBeNull()
  })

  it('never reactivates a disabled workspace membership during authorization', () => {
    expect(getMembershipActivationDecision('ACTIVE')).toBe('allow')
    expect(getMembershipActivationDecision('INVITED')).toBe('activate')
    expect(getMembershipActivationDecision('DISABLED')).toBe('deny')
  })

  it('prevents delegated member managers from controlling peer or higher roles', () => {
    expect(canManageMemberRole('ADMIN', 'OWNER')).toBe(false)
    expect(canManageMemberRole('ADMIN', 'ADMIN')).toBe(false)
    expect(canManageMemberRole('ADMIN', 'MANAGER')).toBe(true)
    expect(canManageMemberRole('MANAGER', 'MANAGER')).toBe(false)
    expect(canManageMemberRole('MANAGER', 'EMPLOYEE')).toBe(true)
    expect(canManageMemberRole('OWNER', 'OWNER')).toBe(true)
  })
})

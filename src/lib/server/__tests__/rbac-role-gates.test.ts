import { describe, expect, it } from 'vitest'
import {
  assertCanAccessMember,
  assertPermission,
  can,
  permissionScope,
} from '#/lib/server/tracker/shared/role-gates.server'
import { AuthorizationError } from '#/lib/rbac/authorization'

function access(input: {
  level?: 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
  overrides?: Record<string, boolean>
  memberId?: string
  departmentId?: string | null
}) {
  return {
    member: {
      id: input.memberId ?? 'actor',
      departmentId: input.departmentId ?? null,
      workspaceRole: {
        permissionLevel: input.level ?? 'EMPLOYEE',
        permissionOverrides: input.overrides ?? {},
      },
    },
  }
}

describe('RBAC server authorization gates', () => {
  it('throws a safe forbidden error when a direct server call lacks permission', () => {
    const employee = access({ level: 'EMPLOYEE' })
    expect(can(employee, 'members.view')).toBe(false)
    expect(() => assertPermission(employee, 'members.view')).toThrowError(
      AuthorizationError,
    )
    try {
      assertPermission(employee, 'members.view')
    } catch (error) {
      expect(error).toMatchObject({ code: 'FORBIDDEN', status: 403 })
    }
  })

  it('uses permission overrides without increasing hierarchy data scope', () => {
    const employee = access({
      level: 'EMPLOYEE',
      overrides: { 'locations.view': true },
    })
    expect(can(employee, 'locations.view')).toBe(true)
    expect(permissionScope(employee, 'locations.view')).toBe('self')
  })

  it('rejects cross-department member access for a delegated Manager', () => {
    const manager = access({
      level: 'MANAGER',
      memberId: 'manager',
      departmentId: 'engineering',
    })
    expect(() =>
      assertCanAccessMember(manager, {
        id: 'sales-member',
        departmentId: 'sales',
      }),
    ).toThrowError(AuthorizationError)
  })
})

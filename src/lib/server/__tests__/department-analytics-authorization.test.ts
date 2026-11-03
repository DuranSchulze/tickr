import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import {
  getDepartmentDashboard,
  getDepartmentMemberDetail,
  getDepartmentMemberTodayActivity,
} from '../tracker/department-dashboard.server'

const state = vi.hoisted(() => ({
  access: vi.fn(),
  results: [] as unknown[][],
  conditions: [] as unknown[],
  select: vi.fn(),
}))
vi.mock('../workspace-access.server', () => ({
  requireWorkspaceAccess: state.access,
}))
vi.mock('#/db', () => ({ db: { select: state.select } }))

function access(
  level: string,
  departmentId: string | null = 'dept-a',
  overrides?: unknown,
) {
  return {
    workspace: {
      id: 'workspace-a',
      timezone: 'Asia/Manila',
      defaultBillableRate: '0',
      billableCurrency: 'PHP',
    },
    member: {
      id: 'actor',
      departmentId,
      workspaceRole: { permissionLevel: level, permissionOverrides: overrides },
    },
  }
}
const range = { startDate: '2026-11-01', endDate: '2026-11-03' }
const department = { id: 'dept-a', name: 'Design', color: '#123456' }
const dialect = new PgDialect()
function query(index: number) {
  return dialect.sqlToQuery(state.conditions[index] as SQL)
}

beforeEach(() => {
  vi.clearAllMocks()
  state.results = []
  state.conditions = []
  state.select.mockImplementation(() => {
    const chain: Record<string, unknown> = {}
    for (const method of ['from', 'leftJoin', 'orderBy', 'limit'])
      chain[method] = () => chain
    chain.where = (condition: unknown) => {
      state.conditions.push(condition)
      return chain
    }
    chain.then = (resolve: (rows: unknown[]) => void) =>
      resolve(state.results.shift() ?? [])
    return chain
  })
})

describe('department analytics authorization', () => {
  it.each(['EMPLOYEE', 'MANAGER', 'ADMIN'])(
    'denies %s with members.view disabled before any query',
    async (level) => {
      state.access.mockResolvedValue(
        access(level, 'dept-a', { 'members.view': false }),
      )
      await expect(getDepartmentDashboard(range)).rejects.toThrow('permission')
      await expect(
        getDepartmentMemberTodayActivity({ memberId: 'victim' }),
      ).rejects.toThrow('permission')
      await expect(
        getDepartmentMemberDetail({ memberId: 'victim' }),
      ).rejects.toThrow('permission')
      expect(state.select).not.toHaveBeenCalled()
    },
  )
  it('rejects a manager with no assigned department before querying', async () => {
    state.access.mockResolvedValue(access('MANAGER', null))
    await expect(getDepartmentDashboard(range)).rejects.toThrow(
      'assigned to a department',
    )
    expect(state.select).not.toHaveBeenCalled()
  })
  it('scopes department options, available members, and analytics members to the manager department', async () => {
    state.access.mockResolvedValue(access('MANAGER'))
    state.results = [[department], [], []]
    const result = await getDepartmentDashboard(range)
    expect(result.canFilterDepartments).toBe(false)
    expect(result.filters.departmentId).toBe('dept-a')
    for (let index = 0; index < 3; index++) {
      expect(query(index).params).toContain('workspace-a')
      expect(query(index).params).toContain('dept-a')
    }
  })
  it('rejects an explicit inaccessible department instead of widening the dashboard', async () => {
    state.access.mockResolvedValue(access('MANAGER'))
    state.results = [[department]]
    await expect(
      getDepartmentDashboard({ ...range, departmentId: 'dept-b' }),
    ).rejects.toThrow('not accessible')
    expect(state.select).toHaveBeenCalledTimes(1)
  })
  it('rejects an inaccessible member instead of returning everyone', async () => {
    state.access.mockResolvedValue(access('MANAGER'))
    state.results = [[department], []]
    await expect(
      getDepartmentDashboard({ ...range, memberId: 'other-member' }),
    ).rejects.toThrow('not accessible')
    expect(state.select).toHaveBeenCalledTimes(2)
  })
  it.each(['OWNER', 'ADMIN'])(
    'allows %s workspace-wide filtering',
    async (level) => {
      state.access.mockResolvedValue(access(level))
      state.results = [[department], [], []]
      const result = await getDepartmentDashboard(range)
      expect(result.canFilterDepartments).toBe(true)
      expect(query(0).params).toEqual(['workspace-a'])
      expect(query(2).params).not.toContain('dept-a')
    },
  )
  it('keeps an employee permission override scoped to their own member ID', async () => {
    state.access.mockResolvedValue(
      access('EMPLOYEE', 'dept-a', { 'members.view': true }),
    )
    state.results = [[department], [], []]
    await getDepartmentDashboard(range)
    expect(query(1).params).toContain('actor')
    expect(query(2).params).toContain('actor')
  })
  it.each([getDepartmentMemberTodayActivity, getDepartmentMemberDetail])(
    'checks member hierarchy before reading entries or returning rates',
    async (endpoint) => {
      state.access.mockResolvedValue(access('MANAGER'))
      // Even if a query returned an out-of-scope row, the explicit hierarchy gate rejects it.
      state.results = [
        [{ id: 'victim', departmentId: 'dept-b', billableRate: '1000' }],
      ]
      await expect(endpoint({ memberId: 'victim' })).rejects.toThrow(
        'permission',
      )
      expect(state.select).toHaveBeenCalledTimes(1)
      expect(query(0).params).toContain('workspace-a')
      expect(query(0).params).toContain('dept-a')
    },
  )
})

import { describe, expect, it } from 'vitest'
import { buildDepartmentMemberOptions } from './DepartmentDashboardScreen'

const members = [
  {
    id: 'member-a',
    name: 'Alex',
    email: 'alex@example.com',
    departmentId: 'engineering',
    departmentName: 'Engineering',
  },
  {
    id: 'member-b',
    name: 'Bea',
    email: 'bea@example.com',
    departmentId: 'operations',
    departmentName: 'Operations',
  },
]

describe('department analytics member options', () => {
  it('shows every member without a department and narrows after selection', () => {
    expect(
      buildDepartmentMemberOptions(members, '').map(({ value }) => value),
    ).toEqual(['', 'member-a', 'member-b'])

    expect(
      buildDepartmentMemberOptions(members, 'engineering').map(
        ({ value }) => value,
      ),
    ).toEqual(['', 'member-a'])
  })
})

import { describe, expect, it } from 'vitest'
import { canViewTeamCalendars } from './calendar-access'

describe('canViewTeamCalendars', () => {
  it.each(['OWNER', 'ADMIN'] as const)(
    'allows %s accounts with member visibility',
    (permissionLevel) => {
      expect(canViewTeamCalendars(permissionLevel, true)).toBe(true)
    },
  )

  it('does not expose team calendars to managers or employees', () => {
    expect(canViewTeamCalendars('MANAGER', true)).toBe(false)
    expect(canViewTeamCalendars('EMPLOYEE', true)).toBe(false)
  })

  it('respects an admin member-visibility restriction', () => {
    expect(canViewTeamCalendars('ADMIN', false)).toBe(false)
  })
})

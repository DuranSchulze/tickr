import { describe, expect, it } from 'vitest'
import {
  countRunningTimers,
  getTimerStatusLabel,
  hasRunningTimer,
} from './member-timer-status'

describe('member timer status', () => {
  const trackingMember = { activeEntry: { id: 'entry-1' } }
  const idleMember = { activeEntry: null }

  it('derives the status only from whether a time entry is running', () => {
    expect(hasRunningTimer(trackingMember)).toBe(true)
    expect(hasRunningTimer(idleMember)).toBe(false)
    expect(countRunningTimers([trackingMember, idleMember])).toBe(1)
  })

  it('uses timer-specific labels instead of implying login presence', () => {
    expect(getTimerStatusLabel(trackingMember)).toBe('Timer running')
    expect(getTimerStatusLabel(idleMember)).toBe('No timer running')
  })
})

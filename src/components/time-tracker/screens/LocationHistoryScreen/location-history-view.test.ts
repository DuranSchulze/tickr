import { describe, expect, it } from 'vitest'
import {
  closeLocationPanel,
  getLocationHistoryViewState,
  openLocationPanel,
} from './location-history-view'
import type { LocationHistoryPayload } from '#/lib/server/tracker/location-history.server'

const member = {
  id: 'member-1',
  name: 'Mia Manager',
  email: 'mia@example.com',
  avatarUrl: null,
  departmentName: 'Operations',
}

const entry = {
  id: 'entry-1',
  memberId: member.id,
  memberName: member.name,
  description: 'Review launch checklist',
  projectName: 'Website launch',
  projectColor: '#2563eb',
  taskName: 'Final QA',
  location: 'Makati City, Metro Manila, PH',
  latitude: 14.5547,
  longitude: 121.0244,
  locationSource: 'network' as const,
  locationAccuracyM: null,
  startedAt: '2026-08-24T08:00:00.000Z',
  endedAt: '2026-08-24T09:00:00.000Z',
  durationSeconds: 3600,
}

function payload(
  overrides: Partial<LocationHistoryPayload> = {},
): LocationHistoryPayload {
  return {
    timezone: 'Asia/Manila',
    currentMemberId: member.id,
    selectedMemberId: '',
    members: [member],
    entries: [],
    limit: 200,
    ...overrides,
  }
}

describe('location history view state', () => {
  it('opens a marker group and retains its data while the panel animates closed', () => {
    const openState = openLocationPanel('14.67600:121.04300')
    expect(openState).toEqual({
      groupKey: '14.67600:121.04300',
      open: true,
    })
    expect(closeLocationPanel(openState)).toEqual({
      groupKey: '14.67600:121.04300',
      open: false,
    })
  })

  it('treats a cleared member filter as the all-members map', () => {
    expect(getLocationHistoryViewState(payload())).toMatchObject({
      selectedMember: undefined,
      hasSelectedMember: false,
      showEmptyState: true,
    })
  })

  it('keeps workspace-wide pinpoints visible after clearing a member', () => {
    expect(
      getLocationHistoryViewState(payload({ entries: [entry] })),
    ).toMatchObject({
      selectedMember: undefined,
      hasSelectedMember: false,
      showEmptyState: false,
    })
  })

  it('shows a selected member empty state when they have no located tasks', () => {
    expect(
      getLocationHistoryViewState(payload({ selectedMemberId: member.id })),
    ).toMatchObject({
      selectedMember: member,
      hasSelectedMember: true,
      showEmptyState: true,
    })
  })
})

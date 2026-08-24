import type { LocationHistoryPayload } from '#/lib/server/tracker/location-history.server'

export type LocationPanelState = {
  groupKey: string | null
  open: boolean
}

export function openLocationPanel(groupKey: string): LocationPanelState {
  return { groupKey, open: true }
}

export function closeLocationPanel(
  state: LocationPanelState,
): LocationPanelState {
  return { ...state, open: false }
}

export function getLocationHistoryViewState(data: LocationHistoryPayload) {
  const selectedMember = data.members.find(
    (member) => member.id === data.selectedMemberId,
  )
  const hasSelectedMember = Boolean(selectedMember)

  return {
    selectedMember,
    hasSelectedMember,
    showEmptyState: data.entries.length === 0,
  }
}

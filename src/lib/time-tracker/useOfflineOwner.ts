import { useEffect, useSyncExternalStore } from 'react'
import {
  getOwnerState,
  hydrateOwner,
  ownerKey,
  subscribeOfflineStore,
} from './offline-store'
import type { OwnerState } from './offline-store'
import { setLastOfflineOwner } from './offline-config'

const SERVER_STATE: OwnerState = {
  ready: false,
  available: true,
  queue: [],
  needsReview: [],
  pendingDisplay: [],
  meta: { idMap: {}, lastSyncAt: null, migratedV1: false },
}

/** Subscribes to one owner's offline stores and hydrates them on mount. */
export function useOfflineOwner(
  workspaceId: string | null | undefined,
  memberId: string | null | undefined,
): OwnerState {
  const owner = workspaceId && memberId ? ownerKey(workspaceId, memberId) : null
  const state = useSyncExternalStore(
    subscribeOfflineStore,
    () => (owner ? getOwnerState(owner) : SERVER_STATE),
    () => SERVER_STATE,
  )
  useEffect(() => {
    if (!owner) return
    // Lets the root sync coordinator find this queue even when `/app` fails.
    setLastOfflineOwner(owner)
    void hydrateOwner(owner)
  }, [owner])
  return state
}

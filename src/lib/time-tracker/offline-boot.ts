import type { QueryClient } from '@tanstack/react-query'
import { getOfflineConfig, setLastOfflineOwner } from './offline-config'
import {
  loadAppSnapshot,
  restorePersistedQueries,
  saveAppSnapshot,
  setCatalogSavedAt,
  setOnlineCacheOwner,
} from './offline-cache'
import type { AppSnapshot } from './offline-cache'
import { ownerKey } from './offline-store'

/** Why `/app` cannot open offline. Thrown by the `/app` route, never a route. */
export class OfflineGateError extends Error {
  constructor(
    readonly reason: 'expired' | 'none',
    readonly graceHours: number,
  ) {
    super('Sign in to keep tracking')
    this.name = 'OfflineGateError'
  }
}

/**
 * Opens `/app` from the last online load (offline-mode REQ-6): within the
 * grace window it restores the persisted queries and returns the snapshot;
 * otherwise it throws `OfflineGateError` so the sign-in gate renders.
 */
export async function bootFromSnapshot<T>(
  queryClient: QueryClient,
): Promise<AppSnapshot<T>> {
  const state = await loadAppSnapshot<T>()
  if (state.status !== 'ok') {
    throw new OfflineGateError(state.status, getOfflineConfig().graceHours)
  }
  const { trackerSavedAt } = await restorePersistedQueries(
    queryClient,
    state.snapshot.owner,
  ).catch(() => ({ trackerSavedAt: null }))
  setCatalogSavedAt(trackerSavedAt)
  return state.snapshot
}

/** After an online `/app` load: remember the owner and refresh the snapshot. */
export function rememberOnlineSession<T>(
  workspaceId: string,
  memberId: string,
  userId: string,
  data: T,
) {
  const owner = ownerKey(workspaceId, memberId)
  setLastOfflineOwner(owner)
  setOnlineCacheOwner(owner)
  setCatalogSavedAt(null)
  void saveAppSnapshot(owner, userId, data).catch((err: unknown) =>
    console.warn('Offline snapshot was not saved', err),
  )
  // Shared device: drop other members' synced local data (REQ-8).
  void import('./offline-wipe').then((m) =>
    m.forgetPreviousOwnerIfSynced(owner),
  )
}

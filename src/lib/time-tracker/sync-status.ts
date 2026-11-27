import { useSyncExternalStore } from 'react'
import {
  getConnectivity,
  isEffectivelyOnline,
  subscribeConnectivity,
} from './connectivity'
import type { ConnectivityState } from './connectivity'
import { getLastOfflineOwner } from './offline-config'
import { getOwnerState, subscribeOfflineStore } from './offline-store'
import type { OwnerState } from './offline-store'

/** What the sync pill shows (offline-mode REQ-5). */
export type SyncStatus = {
  online: boolean
  pending: number
  oldestPendingAt: string | null
  needsReview: number
  needsConfirmation: number
  lastSyncAt: string | null
  retryAt: string | null
  /** Short visible label, also announced by screen readers. */
  label: string
}

export function formatAge(fromIso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function summarizeSyncStatus(
  owner: Pick<OwnerState, 'queue' | 'needsReview' | 'meta'>,
  connectivity: ConnectivityState,
  now = Date.now(),
): SyncStatus {
  const online = isEffectivelyOnline(connectivity)
  const pending = owner.queue.length
  const oldestPendingAt = owner.queue.reduce<string | null>(
    (oldest, item) =>
      !oldest || item.capturedAt < oldest ? item.capturedAt : oldest,
    null,
  )
  const needsReview = owner.needsReview.length
  const needsConfirmation = owner.queue.filter(
    (i) => i.needsConfirmation,
  ).length

  const parts: string[] = [online ? 'Online' : 'Offline']
  if (pending > 0) {
    parts.push(
      `${pending} pending${oldestPendingAt ? ` · oldest ${formatAge(oldestPendingAt, now)}` : ''}`,
    )
  }
  if (needsReview + needsConfirmation > 0) {
    parts.push(`${needsReview + needsConfirmation} need review`)
  }
  if (pending === 0 && needsReview === 0) {
    parts.push(online ? 'Synced' : 'No pending work')
  }

  return {
    online,
    pending,
    oldestPendingAt,
    needsReview,
    needsConfirmation,
    lastSyncAt: owner.meta.lastSyncAt,
    retryAt: connectivity.nextRetryAt,
    label: parts.join(' · '),
  }
}

const NO_OWNER = null

/**
 * The offline owner for the current workspace, or null when this device has
 * no offline data for it (e.g. the member switched workspaces).
 */
export function useCurrentOfflineOwner(workspaceId: string): string | null {
  return useSyncExternalStore(
    subscribeOfflineStore,
    () => {
      const owner = getLastOfflineOwner()
      return owner && owner.startsWith(`${workspaceId}:`) ? owner : NO_OWNER
    },
    () => NO_OWNER,
  )
}

export function useSyncStatus(owner: string | null): SyncStatus | null {
  const ownerState = useSyncExternalStore(
    subscribeOfflineStore,
    () => (owner ? getOwnerState(owner) : null),
    () => null,
  )
  const connectivity = useSyncExternalStore(
    subscribeConnectivity,
    getConnectivity,
    getConnectivity,
  )
  if (!ownerState) return null
  return summarizeSyncStatus(ownerState, connectivity)
}

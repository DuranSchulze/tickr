import type { QueryClient } from '@tanstack/react-query'
import { clearOfflineSettings } from './offline-config'
import {
  deleteOfflineDatabase,
  deleteOwnerData,
  listOwners,
} from './offline-db'
import {
  clearOfflineStoreMirrors,
  getOwnerState,
  hydrateOwner,
} from './offline-store'
import { setCatalogSavedAt, setOnlineCacheOwner } from './offline-cache'

/**
 * Logout and shared-device wipe (offline-mode REQ-8). Works with no network:
 * everything local is removed first; the server session is ended afterwards
 * (immediately when online, otherwise on the next online visit).
 */

const PENDING_SIGNOUT_KEY = 'trackly-pending-signout'
const OFFLINE_KEY_PREFIXES = [
  'trackly-offline-',
  'offline-queue:',
  'pending-stopped-entries:',
]

function clearOfflineKeys(storage: Storage) {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (key && OFFLINE_KEY_PREFIXES.some((p) => key.startsWith(p))) {
      keys.push(key)
    }
  }
  for (const key of keys) storage.removeItem(key)
}

async function clearShellCache() {
  // Ask the worker (it owns the cache name), and clear directly as a fallback.
  // `serviceWorker` is absent on insecure origins and in some WebViews.
  const container =
    typeof navigator !== 'undefined'
      ? (navigator as { serviceWorker?: ServiceWorkerContainer }).serviceWorker
      : undefined
  const controller = container?.controller
  if (controller) {
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel()
      const timer = setTimeout(resolve, 1000)
      channel.port1.onmessage = () => {
        clearTimeout(timer)
        resolve()
      }
      controller.postMessage({ type: 'CLEAR_OFFLINE_SHELL' }, [channel.port2])
    })
  }
  if (typeof caches !== 'undefined') {
    const names = await caches.keys()
    await Promise.all(
      names.filter((n) => n.endsWith('-shell')).map((n) => caches.delete(n)),
    )
  }
}

/** Removes every offline queue, cache, key, snapshot and setting on this device. */
export async function wipeLocalData(queryClient?: QueryClient): Promise<void> {
  setOnlineCacheOwner(null)
  setCatalogSavedAt(null)
  clearOfflineStoreMirrors()
  const results = await Promise.allSettled([
    deleteOfflineDatabase(),
    clearShellCache(),
  ])
  try {
    clearOfflineSettings()
    clearOfflineKeys(localStorage)
    clearOfflineKeys(sessionStorage)
  } catch {
    // storage unavailable: nothing stored there either
  }
  queryClient?.clear()
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason
  }
}

/** Pending and parked items of the device's offline owner, for the logout warning. */
export async function countUnsyncedWork(owner: string | null) {
  if (!owner) return 0
  await hydrateOwner(owner)
  // The live mirror, not the hydration result: work queued since counts too.
  const state = getOwnerState(owner)
  return state.queue.length + state.needsReview.length
}

/** Decrypted unsynced items as a JSON file the member can keep. */
export function exportUnsyncedWork(owner: string): Blob {
  const state = getOwnerState(owner)
  return new Blob(
    [
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          note: 'Offline changes that had not synced to Trackly. Re-enter them online or send this file to your administrator.',
          pending: state.queue,
          needsReview: state.needsReview,
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  )
}

export function markSignOutPending() {
  try {
    localStorage.setItem(PENDING_SIGNOUT_KEY, '1')
  } catch {
    // best effort
  }
}

export function isSignOutPending() {
  try {
    return localStorage.getItem(PENDING_SIGNOUT_KEY) === '1'
  } catch {
    return false
  }
}

export function clearSignOutPending() {
  try {
    localStorage.removeItem(PENDING_SIGNOUT_KEY)
  } catch {
    // best effort
  }
}

/**
 * A different member is now signed in: delete the previous owner's local data
 * once nothing of theirs is waiting to sync. Unsynced work is kept (still
 * encrypted, never shown or replayed for the new member).
 */
export async function forgetPreviousOwnerIfSynced(currentOwner: string) {
  try {
    const owners = new Set(
      (
        await Promise.all(
          (
            ['queue', 'needsReview', 'pendingDisplay', 'meta', 'cache'] as const
          ).map((store) => listOwners(store)),
        )
      ).flat(),
    )
    for (const owner of owners) {
      if (owner === currentOwner) continue
      if ((await countUnsyncedWork(owner)) === 0) {
        await deleteOwnerData(owner)
      }
    }
  } catch {
    // retried on the next online load
  }
}

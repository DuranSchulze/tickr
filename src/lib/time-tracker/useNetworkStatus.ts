import { useEffect, useSyncExternalStore } from 'react'
import {
  getConnectivity,
  isEffectivelyOnline,
  startConnectivityListeners,
  subscribeConnectivity,
  syncBrowserOnline,
} from './connectivity'

// SSR and hydration assume online, so markup matches before the first check.
const serverSnapshot = () => true

/**
 * Online when the browser has a network and the last server probe succeeded
 * (offline-mode REQ-4). The sync coordinator runs the probes.
 */
export function useNetworkStatus() {
  const isOnline = useSyncExternalStore(
    subscribeConnectivity,
    () => isEffectivelyOnline(getConnectivity()),
    serverSnapshot,
  )

  useEffect(() => {
    startConnectivityListeners()
    // After the first commit, so the initial render matches the server markup.
    queueMicrotask(syncBrowserOnline)
  }, [])

  return { isOnline }
}

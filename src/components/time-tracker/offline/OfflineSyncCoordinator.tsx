import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import {
  getConnectivity,
  probeConnectivity,
  startConnectivityListeners,
  subscribeConnectivity,
  syncBrowserOnline,
} from '#/lib/time-tracker/connectivity'
import {
  getLastOfflineOwner,
  setOfflineConfig,
} from '#/lib/time-tracker/offline-config'
import {
  getOwnerState,
  hydrateOwner,
  ownerKey,
} from '#/lib/time-tracker/offline-store'
import {
  OFFLINE_SYNC_REQUEST_EVENT,
  replayQueue,
} from '#/lib/time-tracker/offline-replay'
import type { ReplayDeps } from '#/lib/time-tracker/offline-replay'
import { startQueryPersistence } from '#/lib/time-tracker/offline-cache'
import { OfflineSaveErrorDialog } from './OfflineSaveErrorDialog'

const IDLE_PROBE_MS = 60_000

async function loadReplayDeps(): Promise<ReplayDeps> {
  // Loaded on demand so the root bundle does not carry the tracker client.
  const [tracker, access] = await Promise.all([
    import('#/lib/server/tracker'),
    import('#/lib/server/workspace-access'),
  ])
  return {
    startTimer: (data) => tracker.startTimerFn({ data: data as never }),
    createManualEntry: (data) =>
      tracker.createManualEntryFn({ data: data as never }),
    stopTimer: (data) => tracker.stopTimerFn({ data: data as never }),
    deleteEntry: (data) => tracker.deleteEntryFn({ data }),
    probe: () => probeConnectivity(),
    currentOwner: async () => {
      const result = await access.getWorkspaceAccessFn({ data: {} })
      return ownerKey(result.workspace.id, result.member.id)
    },
  }
}

/**
 * Replays the offline queue from the root shell (offline-mode REQ-4), so sync
 * runs on any route and survives `/app` bootstrap failure. Triggers: launch,
 * `online`, tab visible, focus, `pageshow` (bfcache) and the backoff timer.
 * Does nothing for visitors who never used the tracker on this device.
 */
export function OfflineSyncCoordinator() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const runningRef = useRef(false)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = useCallback(async () => {
    const owner = getLastOfflineOwner()
    if (!owner || runningRef.current) return
    runningRef.current = true
    try {
      await hydrateOwner(owner)
      if (getOwnerState(owner).queue.length === 0) {
        // Nothing to send; still learn about connectivity when it is unknown.
        if (!getConnectivity().reachable) await probeConnectivity()
        return
      }
      const deps = await loadReplayDeps()
      const result = await replayQueue(owner, deps)
      if (result.replayed > 0 || result.parked > 0) {
        const [
          { invalidateTrackerState, trackerKeys },
          { publishTaskDataChange },
        ] = await Promise.all([
          import('#/lib/time-tracker/query-keys'),
          import('#/lib/time-tracker/task-sync'),
        ])
        const workspaceId = owner.split(':')[0]
        publishTaskDataChange(workspaceId)
        void invalidateTrackerState(queryClient)
        void queryClient.invalidateQueries({ queryKey: trackerKeys.timesheets })
        void queryClient.invalidateQueries({
          queryKey: trackerKeys.missingWeekdays(workspaceId),
        })
        void router.invalidate()
      }
    } catch (err) {
      console.warn('Offline sync did not complete', err)
    } finally {
      runningRef.current = false
    }
  }, [queryClient, router])

  // Refresh the rollout switches and the owner whenever the server is reachable.
  const refreshConfig = useCallback(async () => {
    if (!getLastOfflineOwner()) return
    try {
      const { getOfflineConfigFn } = await import('#/lib/server/offline-config')
      setOfflineConfig(await getOfflineConfigFn())
    } catch {
      // keep the cached switches
    }
  }, [])

  useEffect(() => {
    startConnectivityListeners()
    syncBrowserOnline()
    const stopPersisting = startQueryPersistence(queryClient)
    void refreshConfig()
    void run()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void run()
    }
    const onTrigger = () => void run()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onTrigger)
    window.addEventListener('pageshow', onTrigger)
    window.addEventListener('online', onTrigger)
    window.addEventListener(OFFLINE_SYNC_REQUEST_EVENT, onTrigger)

    // Schedule the next attempt from the backoff, never a tight loop.
    const unsubscribe = subscribeConnectivity(() => {
      const { nextRetryAt, browserOnline } = getConnectivity()
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
      if (!nextRetryAt || !browserOnline) return
      const delay = Math.max(0, Date.parse(nextRetryAt) - Date.now())
      retryTimerRef.current = setTimeout(() => void run(), delay)
    })

    // Idle probe, at most once a minute and only while the tab is visible.
    const idle = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      const owner = getLastOfflineOwner()
      if (!owner) return
      if (
        getOwnerState(owner).queue.length > 0 ||
        !getConnectivity().reachable
      ) {
        void run()
      }
    }, IDLE_PROBE_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onTrigger)
      window.removeEventListener('pageshow', onTrigger)
      window.removeEventListener('online', onTrigger)
      window.removeEventListener(OFFLINE_SYNC_REQUEST_EVENT, onTrigger)
      unsubscribe()
      stopPersisting()
      clearInterval(idle)
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [queryClient, refreshConfig, run])

  return <OfflineSaveErrorDialog />
}

export default OfflineSyncCoordinator

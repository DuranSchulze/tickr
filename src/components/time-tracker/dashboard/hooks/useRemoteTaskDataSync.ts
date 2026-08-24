import { useEffect, useRef } from 'react'
import { subscribeToTaskDataChanges } from '#/lib/time-tracker/task-sync'

// Direct broadcast subscription for views whose data lives outside the
// react-query cache (the dashboard's locally-paginated entries list). The
// TaskSyncCoordinator already refreshes query-backed data on remote changes,
// but its completion notification is the only signal that list receives — if
// any step of the coordinator's refresh throws, or its fetch fails silently,
// the list keeps serving stale rows (e.g. an entry still shown as running
// after another tab stopped it). Listening to the broadcast directly gives
// the list an independent refresh leg.
//
// Bursts (a stop immediately followed by a start in the other tab) coalesce
// into one refresh, and hidden tabs defer the work until they become visible.
const REMOTE_REFRESH_COALESCE_MS = 300

export function useRemoteTaskDataSync(
  workspaceId: string,
  refresh: () => void,
) {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    let disposed = false
    let pending = false
    let timer: ReturnType<typeof setTimeout> | null = null

    function runRefresh() {
      pending = false
      refreshRef.current()
    }

    function onRemoteChange() {
      if (disposed) return
      if (document.visibilityState !== 'visible') {
        pending = true
        return
      }
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        if (disposed) return
        if (document.visibilityState !== 'visible') {
          pending = true
          return
        }
        runRefresh()
      }, REMOTE_REFRESH_COALESCE_MS)
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && pending && !timer) {
        runRefresh()
      }
    }

    const unsubscribe = subscribeToTaskDataChanges(workspaceId, onRemoteChange)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [workspaceId])
}

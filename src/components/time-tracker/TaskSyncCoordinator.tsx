// ─────────────────────────────────────────────────────────────────────────────
// Realtime sync coordinator for time-entry data (no UI — logic only).
//
// Three legs keep task-data routes (dashboard, calendar, analytics, reports,
// …) in sync, all funnelling into one coalesced refresh (query invalidation +
// router.invalidate + completion notification for the dashboard's local list):
//
//   1. SAME BROWSER, OTHER TABS — instant. Mutations broadcast over
//      BroadcastChannel (lib/time-tracker/task-sync.ts). Hidden tabs mark
//      cached data stale immediately and defer the network work until
//      visible.
//   2. ANY DEVICE, ON TAB ACTIVATION — visibilitychange / window focus /
//      pageshow (bfcache) / online events trigger a refresh, catching up a
//      tab the moment the user returns to it.
//   3. ANY DEVICE, WHILE OPEN+VISIBLE — pulse polling (added 2026-09). A
//      page left open, visible and idle on another PC never fires a DOM
//      event and BroadcastChannel never crosses devices, so nothing else
//      can reach it. While a task-data route is visible and online we poll
//      getTrackerPulseFn — a tiny per-member change stamp — and run the same
//      refresh path when it differs from the post-refresh baseline.
//
// Leg 3 is what makes cross-device start/stop reflect on an untouched
// machine within one poll interval. See lib/time-tracker/tracker-pulse.ts
// for the stamp contract and its accepted micro-races.
// ─────────────────────────────────────────────────────────────────────────────

import * as Sentry from '@sentry/react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import {
  invalidateTaskDataQueries,
  isTaskDataRoute,
  notifyTaskSyncCompleted,
  publishTaskDataChange,
  subscribeToTaskDataChanges,
} from '#/lib/time-tracker/task-sync'
import type { TaskSyncCompletedEvent } from '#/lib/time-tracker/task-sync'
import { isSameTrackerPulse } from '#/lib/time-tracker/tracker-pulse'
import type { TrackerPulse } from '#/lib/time-tracker/tracker-pulse'
import { getTrackerPulseFn } from '#/lib/server/tracker'

const REFRESH_COALESCE_MS = 1_000
// Cross-device poll cadence (leg 3 above). Matches the app's established
// polling rhythm (timesheet/activity screens poll at 30s). Only fires while
// a task-data route is visible and online, so a hidden tab costs nothing.
const PULSE_POLL_INTERVAL_MS = 30_000
const TaskSyncPublisherContext = createContext<() => void>(() => {})

export function useTaskSyncPublisher(): () => void {
  return useContext(TaskSyncPublisherContext)
}

export function TaskSyncCoordinator({
  workspaceId,
  pathname,
  children,
}: {
  workspaceId: string
  pathname: string
  children: ReactNode
}) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname
  const publishChange = useCallback(
    () => publishTaskDataChange(workspaceId),
    [workspaceId],
  )

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let inFlight = false
    let trailing: TaskSyncCompletedEvent['reason'] | null = null

    const isReady = () =>
      document.visibilityState === 'visible' && navigator.onLine

    async function refresh(reason: TaskSyncCompletedEvent['reason']) {
      if (disposed || !isReady()) return
      if (inFlight) {
        trailing = reason
        return
      }

      inFlight = true
      try {
        await invalidateTaskDataQueries(queryClient)
        if (isTaskDataRoute(pathnameRef.current)) {
          await router.invalidate()
        }
        notifyTaskSyncCompleted({ workspaceId, reason })
        // Adopt the server's current change stamp as the new poll baseline so
        // the next tick compares against the state this refresh just loaded.
        // (Also resyncs after this device's own mutations — those stale the
        // baseline and cause one redundant refresh on the following tick.)
        void rebaselinePulse()
      } catch (error) {
        Sentry.captureException(error, {
          tags: { feature: 'task-sync', reason },
        })
      } finally {
        inFlight = false
        const nextReason = trailing
        trailing = null
        if (nextReason) schedule(nextReason)
      }
    }

    function schedule(reason: TaskSyncCompletedEvent['reason']) {
      if (disposed || !isReady()) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void refresh(reason)
      }, REFRESH_COALESCE_MS)
    }

    function scheduleActivation() {
      if (!isTaskDataRoute(pathnameRef.current)) return
      schedule('activation')
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') scheduleActivation()
    }

    function handlePageShow() {
      scheduleActivation()
    }

    function handleOnline() {
      if (isTaskDataRoute(pathnameRef.current)) schedule('online')
    }

    // ── Leg 3: cross-device pulse polling ──────────────────────────────────
    let pulseBaseline: TrackerPulse | null = null

    async function fetchPulse(): Promise<TrackerPulse | null> {
      try {
        return await getTrackerPulseFn()
      } catch {
        // Transport/session failure: keep the last baseline and retry on the
        // next tick. Activation refreshes still surface real auth errors.
        return null
      }
    }

    async function rebaselinePulse() {
      const pulse = await fetchPulse()
      if (!pulse || disposed) return
      pulseBaseline = pulse
    }

    async function pollPulse() {
      if (!isReady() || !isTaskDataRoute(pathnameRef.current)) return
      // A refresh is already running or scheduled; its completion re-baselines.
      if (inFlight || timer) return

      const pulse = await fetchPulse()
      // disposed is re-checked after the await — the effect may have cleaned
      // up while the request was in flight.
      if (!pulse || disposed) return

      if (pulseBaseline === null) {
        // First successful poll after mount — adopt the stamp that matches
        // the loader data the route just rendered with.
        pulseBaseline = pulse
        return
      }
      if (!isSameTrackerPulse(pulseBaseline, pulse)) {
        pulseBaseline = pulse
        schedule('remote-change')
      }
    }

    // Establish the baseline immediately, then poll. Hidden/offline tabs or
    // non-task routes simply no-op each tick.
    void pollPulse()
    const pulseTimer = setInterval(
      () => void pollPulse(),
      PULSE_POLL_INTERVAL_MS,
    )

    const unsubscribe = subscribeToTaskDataChanges(workspaceId, () => {
      // Mark cached task data stale immediately, even in a hidden tab. Network
      // work remains deferred until the document is visible and online.
      void invalidateTaskDataQueries(queryClient, 'none')
      if (isTaskDataRoute(pathnameRef.current)) schedule('remote-change')
    })

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', scheduleActivation)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('online', handleOnline)

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      clearInterval(pulseTimer)
      unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', scheduleActivation)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('online', handleOnline)
    }
  }, [queryClient, router, workspaceId])

  return (
    <TaskSyncPublisherContext.Provider value={publishChange}>
      {children}
    </TaskSyncPublisherContext.Provider>
  )
}

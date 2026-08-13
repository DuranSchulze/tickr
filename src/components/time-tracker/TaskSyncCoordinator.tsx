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

const REFRESH_COALESCE_MS = 1_000
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

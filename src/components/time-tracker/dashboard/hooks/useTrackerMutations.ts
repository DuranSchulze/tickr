import { useRef, useState } from 'react'
import { gooeyToast } from '#/lib/toast'
import { useRouter } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import type { TimeEntry, TrackerState } from '#/lib/time-tracker/types'
import {
  invalidateTrackerState,
  removeTrackerStateEntry,
  trackerKeys,
  upsertTrackerStateEntry,
} from '#/lib/time-tracker/query-keys'
import {
  createClientFn,
  createManualEntryFn,
  createProjectFn,
  createTaskFn,
  createTagFn,
  deleteEntryFn,
  duplicateEntryFn,
  attachEntryOriginFn,
  startTimerFn,
  stopTimerFn,
  updateActiveTimerFn,
  updateEntryFn,
  deleteTaskFn,
} from '#/lib/server/tracker'
import { confirmTimeEntryOverlap } from '#/lib/time-tracker/overlap-confirmation'
import { publishTaskDataChange } from '#/lib/time-tracker/task-sync'
import { captureDeviceLocation } from '#/lib/time-tracker/device-location'
import type {
  DeviceLocation,
  EntryLocationCaptureStatus,
} from '#/lib/time-tracker/device-location'

type StartTimerInput = {
  description: string
  projectId: string
  taskId: string | null
  tagIds: string[]
  billable: boolean
  startedAt?: string
  deviceLocation?: DeviceLocation
}

type UpdateActiveTimerInput = StartTimerInput & {
  id: string
  startedAt?: string
}

type EntryPayload = {
  description: string
  projectId: string
  taskId: string | null
  tagIds: string[]
  billable: boolean
  startedAt: string
  endedAt: string
  durationSeconds: number
  notes: string
  deviceLocation?: DeviceLocation
}

type MutationOptions<T> = {
  invalidate?: boolean
  successMessage?: string
  onSuccess?: (result: T) => void
  onError?: () => void
}

export function useTrackerMutations(
  workspaceId: string,
  locationTrackingEnabled: boolean,
) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  const [startTimerPending, setStartTimerPending] = useState(false)
  const [stopTimerPending, setStopTimerPending] = useState(false)
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null)
  const [timerLocationStatus, setTimerLocationStatus] =
    useState<EntryLocationCaptureStatus>('idle')
  const timerLocationEntryIdRef = useRef<string | null>(null)

  function patchEntryOrigin(
    result: Awaited<ReturnType<typeof attachEntryOriginFn>>,
  ) {
    queryClient.setQueryData<TrackerState>(trackerKeys.state, (prev) => {
      if (!prev) return prev
      return {
        ...prev,
        entries: prev.entries.map((entry) =>
          entry.id === result.id
            ? {
                ...entry,
                ipAddress: result.ipAddress,
                location: result.location,
                latitude: result.latitude,
                longitude: result.longitude,
                locationSource: result.locationSource,
                locationAccuracyM: result.locationAccuracyM,
                userAgent: result.userAgent,
              }
            : entry,
        ),
      }
    })
    void queryClient.invalidateQueries({ queryKey: ['location-history'] })
  }

  function attachOriginInBackground(
    entryId: string,
    locationPromise: Promise<DeviceLocation | undefined>,
    updateTimerStatus: boolean,
  ) {
    void locationPromise
      .then((deviceLocation) =>
        attachEntryOriginFn({
          data: {
            entryId,
            ...(deviceLocation ? { deviceLocation } : {}),
          },
        }),
      )
      .then((result) => {
        patchEntryOrigin(result)
        if (updateTimerStatus && timerLocationEntryIdRef.current === entryId) {
          setTimerLocationStatus(
            result.status === 'attached'
              ? 'attached'
              : result.status === 'approximate'
                ? 'approximate'
                : 'unavailable',
          )
        }
      })
      .catch(() => {
        if (updateTimerStatus && timerLocationEntryIdRef.current === entryId) {
          setTimerLocationStatus('unavailable')
        }
      })
  }

  async function run<T>(
    action: () => Promise<T>,
    options: MutationOptions<T> = {},
  ) {
    setPending(true)
    try {
      const result = await action()
      publishTaskDataChange(workspaceId)
      options.onSuccess?.(result)
      if (options.invalidate !== false) {
        void invalidateTrackerState(queryClient)
        void router.invalidate()
      }
      if (options.successMessage) gooeyToast.success(options.successMessage)
      return result
    } catch (err) {
      options.onError?.()
      gooeyToast.error('Action failed', {
        description:
          err instanceof Error ? err.message : 'Something went wrong.',
      })
    } finally {
      setPending(false)
    }
  }

  return {
    pending,
    startTimerPending,
    stopTimerPending,
    deletingEntryId,
    timerLocationStatus,
    startTimer: (
      input: StartTimerInput,
      options?: MutationOptions<TimeEntry>,
    ) => {
      setStartTimerPending(true)
      timerLocationEntryIdRef.current = null
      setTimerLocationStatus(locationTrackingEnabled ? 'locating' : 'idle')
      const locationPromise = locationTrackingEnabled
        ? captureDeviceLocation()
        : Promise.resolve(undefined)
      return run(
        async () => {
          const created = await startTimerFn({ data: input })
          if (locationTrackingEnabled) {
            timerLocationEntryIdRef.current = created.id
            attachOriginInBackground(created.id, locationPromise, true)
          }
          return created
        },
        {
          ...options,
          onError: () => {
            setTimerLocationStatus('idle')
            options?.onError?.()
          },
        },
      ).finally(() => setStartTimerPending(false))
    },
    stopTimer: async (
      id: string,
      options?: MutationOptions<TimeEntry | null>,
    ) => {
      setStopTimerPending(true)
      try {
        const confirmed = await confirmTimeEntryOverlap({ entryId: id })
        if (!confirmed) return undefined
        return await run(() => stopTimerFn({ data: { id } }), options)
      } finally {
        setStopTimerPending(false)
      }
    },
    updateActiveTimer: (
      input: UpdateActiveTimerInput,
      options?: MutationOptions<TimeEntry>,
    ) =>
      run(() => updateActiveTimerFn({ data: input }), {
        successMessage: 'Entry updated',
        ...options,
      }),
    addManualEntry: async (
      payload: EntryPayload,
      options?: MutationOptions<TimeEntry>,
    ) => {
      const confirmed = await confirmTimeEntryOverlap({
        startedAt: payload.startedAt,
        endedAt: payload.endedAt,
      })
      if (!confirmed) return undefined
      const locationPromise = locationTrackingEnabled
        ? captureDeviceLocation()
        : Promise.resolve(undefined)
      return run(
        async () => {
          const created = await createManualEntryFn({
            data: payload,
          })
          upsertTrackerStateEntry(queryClient, created)
          if (locationTrackingEnabled) {
            attachOriginInBackground(created.id, locationPromise, false)
          }
          return created
        },
        {
          successMessage: 'Entry added',
          ...options,
        },
      )
    },
    updateEntry: async (
      id: string,
      payload: EntryPayload,
      options?: MutationOptions<unknown>,
    ) => {
      const confirmed = await confirmTimeEntryOverlap({
        excludeEntryId: id,
        startedAt: payload.startedAt,
        endedAt: payload.endedAt,
      })
      if (!confirmed) return undefined
      return run(async () => updateEntryFn({ data: { id, ...payload } }), {
        successMessage: 'Entry updated',
        ...options,
      })
    },
    deleteEntry: (id: string, options?: MutationOptions<unknown>) => {
      setDeletingEntryId(id)
      return run(
        async () => {
          await deleteEntryFn({ data: { id } })
          removeTrackerStateEntry(queryClient, id)
        },
        {
          successMessage: 'Entry deleted',
          ...options,
        },
      ).finally(() => setDeletingEntryId(null))
    },
    duplicateEntry: (id: string, options?: MutationOptions<unknown>) =>
      run(
        async () => {
          const duplicated = await duplicateEntryFn({ data: { id } })
          // Splice the duplicate into cached state immediately.
          queryClient.setQueryData<TrackerState>(trackerKeys.state, (prev) =>
            prev ? { ...prev, entries: [...prev.entries, duplicated] } : prev,
          )
          return duplicated
        },
        {
          successMessage: 'Entry duplicated',
          ...options,
        },
      ),
    createClient: (
      name: string,
      clientStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' = 'ACTIVE',
    ) => run(() => createClientFn({ data: { name, clientStatus } })),
    createProject: (name: string, color: string, clientId: string) =>
      run(() => createProjectFn({ data: { name, color, clientId } })),
    createTask: (projectId: string, name: string) =>
      run(async () => {
        const created = await createTaskFn({ data: { projectId, name } })
        // Immediately splice the new task into cached state so the picker
        // shows it without waiting for router.invalidate + refetch.
        queryClient.setQueryData<TrackerState>(trackerKeys.state, (prev) =>
          prev
            ? { ...prev, projectTasks: [...prev.projectTasks, created] }
            : prev,
        )
        return created
      }),
    deleteTask: (id: string) =>
      run(async () => {
        await deleteTaskFn({ data: { id } })
        // Immediately remove the task from cached state so the picker
        // hides it without waiting for router.invalidate + refetch.
        queryClient.setQueryData<TrackerState>(trackerKeys.state, (prev) =>
          prev
            ? {
                ...prev,
                projectTasks: prev.projectTasks.filter((t) => t.id !== id),
              }
            : prev,
        )
      }),
    createTag: (name: string, color: string) =>
      run(() => createTagFn({ data: { name, color } })),
  }
}

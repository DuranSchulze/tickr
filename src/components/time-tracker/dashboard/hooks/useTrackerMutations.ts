import { useState } from 'react'
import { gooeyToast } from 'goey-toast'
import { useRouter } from '@tanstack/react-router'
import type { TimeEntry } from '#/lib/time-tracker/types'
import {
  createClientFn,
  createManualEntryFn,
  createProjectFn,
  createTagFn,
  deleteEntryFn,
  duplicateEntryFn,
  startTimerFn,
  stopTimerFn,
  updateActiveTimerFn,
  updateEntryFn,
} from '#/lib/server/tracker'

type StartTimerInput = {
  description: string
  projectId: string
  tagIds: string[]
  billable: boolean
}

type UpdateActiveTimerInput = StartTimerInput & {
  id: string
  startedAt?: string
}

type EntryPayload = {
  description: string
  projectId: string
  tagIds: string[]
  billable: boolean
  startedAt: string
  endedAt: string
  durationSeconds: number
  notes: string
}

type MutationOptions<T> = {
  invalidate?: boolean
  onSuccess?: (result: T) => void
  onError?: () => void
}

export function useTrackerMutations() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [startTimerPending, setStartTimerPending] = useState(false)
  const [stopTimerPending, setStopTimerPending] = useState(false)

  async function run<T>(
    action: () => Promise<T>,
    options: MutationOptions<T> = {},
  ) {
    setPending(true)
    try {
      const result = await action()
      options.onSuccess?.(result)
      if (options.invalidate !== false) void router.invalidate()
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
    startTimer: (
      input: StartTimerInput,
      options?: MutationOptions<TimeEntry>,
    ) => {
      setStartTimerPending(true)
      return run(async () => startTimerFn({ data: input }), options).finally(
        () => setStartTimerPending(false),
      )
    },
    stopTimer: (id: string, options?: MutationOptions<TimeEntry | null>) => {
      setStopTimerPending(true)
      return run(() => stopTimerFn({ data: { id } }), options).finally(() =>
        setStopTimerPending(false),
      )
    },
    updateActiveTimer: (
      input: UpdateActiveTimerInput,
      options?: MutationOptions<TimeEntry>,
    ) => run(() => updateActiveTimerFn({ data: input }), options),
    addManualEntry: (
      payload: EntryPayload,
      options?: MutationOptions<unknown>,
    ) => run(async () => createManualEntryFn({ data: payload }), options),
    updateEntry: (
      id: string,
      payload: EntryPayload,
      options?: MutationOptions<unknown>,
    ) => run(async () => updateEntryFn({ data: { id, ...payload } }), options),
    deleteEntry: (id: string) => run(() => deleteEntryFn({ data: { id } })),
    duplicateEntry: (id: string) =>
      run(() => duplicateEntryFn({ data: { id } })),
    createClient: (
      name: string,
      clientStatus: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
    ) => run(() => createClientFn({ data: { name, clientStatus } })),
    createProject: (name: string, color: string, clientId: string) =>
      run(() => createProjectFn({ data: { name, color, clientId } })),
    createTag: (name: string, color: string) =>
      run(() => createTagFn({ data: { name, color } })),
  }
}

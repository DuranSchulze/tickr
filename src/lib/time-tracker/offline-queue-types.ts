import type { DeviceLocation } from './device-location'

export type StartTimerPayload = {
  description: string
  projectId: string
  taskId: string | null
  tagIds: string[]
  billable: boolean
  // Real client-side start time, so a replay after reconnect doesn't record
  // the reconnect moment as the start. Optional for items queued by older
  // app versions.
  startedAt?: string
  deviceLocation?: DeviceLocation
}

export type StopTimerPayload = {
  id: string
  // Real client-side stop time (same reasoning as startedAt above).
  endedAt?: string
  // Final field values at the moment of stopping, mirroring the online
  // stop path's overrides.
  description?: string
  projectId?: string
  taskId?: string | null
  tagIds?: string[]
  billable?: boolean
}

export type ManualEntryPayload = {
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

export type OfflineQueueItem =
  | {
      id: string
      type: 'startTimer'
      optimisticId: string
      payload: StartTimerPayload
    }
  | { id: string; type: 'stopTimer'; payload: StopTimerPayload }
  | { id: string; type: 'discardTimer'; payload: { id: string } }
  | {
      id: string
      type: 'createManualEntry'
      optimisticId: string
      payload: ManualEntryPayload
    }

export type EnqueueInput =
  | { type: 'startTimer'; optimisticId: string; payload: StartTimerPayload }
  | { type: 'stopTimer'; payload: StopTimerPayload }
  | { type: 'discardTimer'; payload: { id: string } }
  | {
      type: 'createManualEntry'
      optimisticId: string
      payload: ManualEntryPayload
    }

/** The entry an item creates or acts on. */
export function itemEntryId(item: OfflineQueueItem): string {
  return item.type === 'startTimer' || item.type === 'createManualEntry'
    ? item.optimisticId
    : item.payload.id
}

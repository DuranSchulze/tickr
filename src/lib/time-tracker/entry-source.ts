import type { TimeEntrySource } from './types'

export type { TimeEntrySource } from './types'

export const ENTRY_SOURCE_ERROR_MARGIN_SECONDS = 60

export function classifyHistoricalEntrySource({
  createdAt,
  updatedAt,
  startedAt,
  endedAt,
  errorMarginSeconds = ENTRY_SOURCE_ERROR_MARGIN_SECONDS,
}: {
  createdAt: Date
  updatedAt: Date
  startedAt: Date
  endedAt: Date | null
  errorMarginSeconds?: number
}): TimeEntrySource | null {
  if (!endedAt) return null

  const errorMarginMs = errorMarginSeconds * 1000
  const createdStartDelta = Math.abs(createdAt.getTime() - startedAt.getTime())
  const updatedEndDelta = Math.abs(updatedAt.getTime() - endedAt.getTime())

  return createdStartDelta <= errorMarginMs && updatedEndDelta <= errorMarginMs
    ? 'TIMER'
    : 'MANUAL'
}

export function formatTimeEntrySource(
  entrySource: TimeEntrySource | null,
): string {
  if (entrySource === 'TIMER') return 'Timer'
  if (entrySource === 'MANUAL') return 'Manual'
  return 'Unknown'
}

export function formatManualEntryIndicator(
  entrySource: TimeEntrySource | null,
): string {
  return entrySource === 'MANUAL' ? 'X' : ''
}

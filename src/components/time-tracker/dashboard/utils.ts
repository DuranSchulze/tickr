import { dateTimeLocalValue } from '#/lib/time-tracker/store'

export type DraftEntry = {
  description: string
  clientId: string
  projectId: string
  tagIds: string[]
  billable: boolean
  startedAt: string
  endedAt: string
  notes: string
}

export function emptyDraft(
  clientId = '',
  projectId = '',
  tagId = '',
): DraftEntry {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  const end = new Date(start)
  end.setHours(start.getHours() + 1)

  return {
    description: '',
    clientId,
    projectId,
    tagIds: tagId ? [tagId] : [],
    billable: false,
    startedAt: dateTimeLocalValue(start),
    endedAt: dateTimeLocalValue(end),
    notes: '',
  }
}

export function calculateManualSeconds(d: DraftEntry) {
  return Math.max(
    0,
    Math.floor(
      (new Date(d.endedAt).getTime() - new Date(d.startedAt).getTime()) / 1000,
    ),
  )
}

export function toEntryPayload(d: DraftEntry) {
  return {
    description: d.description.trim(),
    projectId: d.projectId,
    tagIds: d.tagIds.filter(Boolean),
    billable: d.billable,
    startedAt: new Date(d.startedAt).toISOString(),
    endedAt: new Date(d.endedAt).toISOString(),
    durationSeconds: calculateManualSeconds(d),
    notes: d.notes.trim(),
  }
}

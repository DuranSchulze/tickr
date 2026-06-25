export type WorkIntervalInput = {
  memberId: string
  startedAt: Date | string
  endedAt: Date | string | null
}

export type ClippedWorkInterval = {
  memberId: string
  startedAt: Date
  endedAt: Date
  seconds: number
}

export type WorkTimeSummary = {
  totalSeconds: number
  actualSeconds: number
  overlapSeconds: number
}

function toValidDate(value: Date | string | null): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function clipWorkInterval(
  entry: WorkIntervalInput,
  rangeStart: Date,
  rangeEnd: Date,
): ClippedWorkInterval | null {
  const startedAt = toValidDate(entry.startedAt)
  const endedAt = toValidDate(entry.endedAt)
  if (!startedAt || !endedAt || endedAt <= startedAt) return null

  const clippedStartMs = Math.max(startedAt.getTime(), rangeStart.getTime())
  const clippedEndMs = Math.min(endedAt.getTime(), rangeEnd.getTime())
  if (clippedEndMs <= clippedStartMs) return null

  return {
    memberId: entry.memberId,
    startedAt: new Date(clippedStartMs),
    endedAt: new Date(clippedEndMs),
    seconds: Math.floor((clippedEndMs - clippedStartMs) / 1000),
  }
}

export function summarizeWorkIntervals(
  entries: WorkIntervalInput[],
  rangeStart: Date,
  rangeEnd: Date,
): WorkTimeSummary {
  const intervalsByMember = new Map<string, ClippedWorkInterval[]>()
  let totalSeconds = 0

  for (const entry of entries) {
    const clipped = clipWorkInterval(entry, rangeStart, rangeEnd)
    if (!clipped) continue
    totalSeconds += clipped.seconds
    const memberIntervals = intervalsByMember.get(clipped.memberId) ?? []
    memberIntervals.push(clipped)
    intervalsByMember.set(clipped.memberId, memberIntervals)
  }

  let actualSeconds = 0
  for (const intervals of intervalsByMember.values()) {
    intervals.sort(
      (a, b) =>
        a.startedAt.getTime() - b.startedAt.getTime() ||
        a.endedAt.getTime() - b.endedAt.getTime(),
    )

    let mergedStart = 0
    let mergedEnd = 0
    for (const interval of intervals) {
      const start = interval.startedAt.getTime()
      const end = interval.endedAt.getTime()
      if (mergedEnd === 0) {
        mergedStart = start
        mergedEnd = end
        continue
      }
      if (start <= mergedEnd) {
        mergedEnd = Math.max(mergedEnd, end)
        continue
      }
      actualSeconds += Math.floor((mergedEnd - mergedStart) / 1000)
      mergedStart = start
      mergedEnd = end
    }
    if (mergedEnd > mergedStart) {
      actualSeconds += Math.floor((mergedEnd - mergedStart) / 1000)
    }
  }

  return {
    totalSeconds,
    actualSeconds,
    overlapSeconds: Math.max(0, totalSeconds - actualSeconds),
  }
}

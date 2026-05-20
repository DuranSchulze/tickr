import type { z } from 'zod'
import { db } from '#/db'
import { timeEntries, projects } from '#/db/schema'
import { and, eq, gte, isNull, lt, or } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { toDateKey } from './shared/dates'
import type { calendarMonthSchema } from './shared/schemas'

export type CalendarEntry = {
  id: string
  description: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number
  project: {
    name: string
    color: string
  } | null
}

export type CalendarEntriesPayload = {
  month: string
  workspaceId: string
  entriesByDate: Record<string, CalendarEntry[]>
}

type RawEntry = {
  id: string
  description: string
  startedAt: Date
  endedAt: Date | null
  durationSeconds: number
  project: { name: string; color: string } | null
}

function splitEntryByDay(
  entry: RawEntry,
  monthStart: Date,
  monthEnd: Date,
  now: Date,
): CalendarEntry[] {
  const start = entry.startedAt
  const end = entry.endedAt ?? now
  const isActive = entry.endedAt === null

  const startDayStr = toDateKey(start)
  const endDayStr = toDateKey(isActive ? now : entry.endedAt!)

  // Single-day entry — no split needed
  if (startDayStr === endDayStr) {
    const dayMs = start.getTime()
    if (dayMs < monthStart.getTime() || dayMs >= monthEnd.getTime()) return []
    return [
      {
        id: entry.id,
        description: entry.description,
        startedAt: start.toISOString(),
        endedAt: isActive ? null : entry.endedAt!.toISOString(),
        durationSeconds: isActive
          ? Math.floor((now.getTime() - start.getTime()) / 1000)
          : entry.durationSeconds,
        project: entry.project,
      },
    ]
  }

  // Multi-day split — cap at 7 slices
  const slices: CalendarEntry[] = []
  let cursor = new Date(start)
  const MAX_SLICES = 7

  for (let i = 0; i < MAX_SLICES && cursor < end; i++) {
    const nextMidnight = new Date(
      Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate() + 1,
      ),
    )
    const sliceEnd = nextMidnight < end ? nextMidnight : end
    const sliceDuration = Math.max(
      0,
      Math.floor((sliceEnd.getTime() - cursor.getTime()) / 1000),
    )
    const isLastSlice = nextMidnight >= end
    const sliceIsActive = isActive && isLastSlice
    const dayKey = toDateKey(cursor)

    // Only include slices that fall within the requested month window
    const sliceDayMs = new Date(
      Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate(),
      ),
    ).getTime()
    if (
      sliceDayMs >= monthStart.getTime() &&
      sliceDayMs < monthEnd.getTime() &&
      sliceDuration > 0
    ) {
      slices.push({
        id: `${entry.id}:${dayKey}`,
        description: entry.description,
        startedAt: cursor.toISOString(),
        endedAt: sliceIsActive ? null : sliceEnd.toISOString(),
        durationSeconds: sliceDuration,
        project: entry.project,
      })
    }

    cursor = nextMidnight
  }

  return slices
}

export async function getCalendarEntries(
  data: z.infer<typeof calendarMonthSchema>,
): Promise<CalendarEntriesPayload> {
  const access = await requireWorkspaceAccess()
  const [year, month] = data.month.split('-').map(Number)
  const monthStart = new Date(Date.UTC(year, month - 1, 1))
  const monthEnd = new Date(Date.UTC(year, month, 1))
  // Go back up to 7 days before month start to catch midnight-crossing entries
  const queryStart = new Date(monthStart.getTime() - 7 * 24 * 60 * 60 * 1000)
  const now = new Date()

  const rows = await db
    .select({
      id: timeEntries.id,
      description: timeEntries.description,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
      durationSeconds: timeEntries.durationSeconds,
      projectName: projects.name,
      projectColor: projects.color,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .where(
      and(
        eq(timeEntries.workspaceId, access.workspace.id),
        eq(timeEntries.workspaceMemberId, access.member.id),
        gte(timeEntries.startedAt, queryStart),
        lt(timeEntries.startedAt, monthEnd),
        or(gte(timeEntries.endedAt, monthStart), isNull(timeEntries.endedAt)),
      ),
    )
    .orderBy(timeEntries.startedAt)

  const entries: RawEntry[] = rows.map((row) => ({
    id: row.id,
    description: row.description,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationSeconds: row.durationSeconds,
    project:
      row.projectName && row.projectColor
        ? { name: row.projectName, color: row.projectColor }
        : null,
  }))

  const entriesByDate: Record<string, CalendarEntry[]> = {}

  for (const entry of entries) {
    const slices = splitEntryByDay(entry, monthStart, monthEnd, now)
    for (const slice of slices) {
      const dateKey = slice.startedAt.slice(0, 10)
      entriesByDate[dateKey] ??= []
      entriesByDate[dateKey].push(slice)
    }
  }

  return {
    month: data.month,
    workspaceId: access.workspace.id,
    entriesByDate,
  }
}

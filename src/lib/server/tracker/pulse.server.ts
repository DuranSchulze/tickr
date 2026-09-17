// ─────────────────────────────────────────────────────────────────────────────
// Cross-device sync: server side of the tracker "pulse" (added 2026-09).
//
// Returns the per-member change stamp defined by TrackerPulse
// (#/lib/time-tracker/tracker-pulse.ts). TaskSyncCoordinator polls this via
// getTrackerPulseFn while a task-data route is visible and online, and
// refreshes when the stamp changes — that is the only leg that reaches a
// page sitting open on ANOTHER device (BroadcastChannel is same-browser and
// DOM activation events never fire on an untouched tab).
//
// Cost note: two member-scoped aggregate queries per poll (index prefix
// workspace_id + workspace_member_id), served in one parallel wave as
// everywhere else on the Neon HTTP driver. Session/workspace resolution in
// requireWorkspaceAccess dominates the cost — still roughly an order of
// magnitude cheaper than polling getTrackerState, which ships the whole
// 62-day entry window.
// ─────────────────────────────────────────────────────────────────────────────

import '@tanstack/react-start/server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '#/db'
import { timeEntries } from '#/db/schema'
import { requireWorkspaceAccess } from '../workspace-access.server'
import type { TrackerPulse } from '#/lib/time-tracker/tracker-pulse'

export async function getTrackerPulse(): Promise<TrackerPulse> {
  const access = await requireWorkspaceAccess()
  const workspaceId = access.workspace.id
  const memberId = access.member.id

  const memberEntries = and(
    eq(timeEntries.workspaceId, workspaceId),
    eq(timeEntries.workspaceMemberId, memberId),
  )

  const [[activeRow], [aggregateRow]] = await Promise.all([
    db
      .select({ id: timeEntries.id, updatedAt: timeEntries.updatedAt })
      .from(timeEntries)
      .where(and(memberEntries, isNull(timeEntries.endedAt)))
      .limit(1),
    db
      .select({
        latestEntryUpdatedAt: sql<Date | null>`max(${timeEntries.updatedAt})`,
        entryCount: sql<number>`count(*)::int`,
      })
      .from(timeEntries)
      .where(memberEntries),
  ])

  const latest = aggregateRow?.latestEntryUpdatedAt

  return {
    activeEntryId: activeRow?.id ?? null,
    activeEntryUpdatedAt: activeRow?.updatedAt?.toISOString() ?? null,
    latestEntryUpdatedAt: latest ? new Date(latest).toISOString() : null,
    entryCount: aggregateRow?.entryCount ?? 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-device sync: change-detection "pulse" contract (client-safe).
//
// The app has three sync legs for time-entry data (see
// components/time-tracker/TaskSyncCoordinator.tsx for the full picture):
//   1. Same browser, other tabs — instant via BroadcastChannel (task-sync.ts).
//   2. Any device, on tab activation — visibilitychange/focus/pageshow/online.
//   3. Any device, while open+visible — THIS pulse, polled by the coordinator
//      (added 2026-09). Without it, a page left open and idle on another PC
//      never hears about a timer started/stopped elsewhere: no DOM event fires
//      there and BroadcastChannel never crosses devices.
//
// The pulse is a tiny per-member change stamp — NOT entry data. The
// coordinator compares each poll against the stamp captured after the last
// refresh and, on a mismatch, runs the exact same refresh path a cross-tab
// change would. It is intentionally scoped to the CURRENT member (the
// dashboard renders only their entries); team screens that need
// cross-member liveness already run their own refetchInterval polling.
//
// Semantics of each field:
//   activeEntryId / activeEntryUpdatedAt — the member's running entry, if
//     any. Covers start (null → id), stop (id → null), resume, and edits to
//     the running timer (updated_at bumps on every write).
//   latestEntryUpdatedAt — max(updated_at) over the member's entries.
//     Covers manual entries, edits, and deletes that keep the count equal.
//   entryCount — catches hard deletes, which leave no row to stamp.
//
// Known micro-races (accepted, each self-heals on the next tick or on tab
// activation): a change landing between a refresh and its re-baseline is
// adopted as the new baseline; this device's own mutations stale the
// baseline and cause one redundant refresh on the following tick.
// ─────────────────────────────────────────────────────────────────────────────

export type TrackerPulse = {
  /** Id of the member's running entry, null when no timer is running. */
  activeEntryId: string | null
  /** ISO timestamp of the running entry's last write, null when idle. */
  activeEntryUpdatedAt: string | null
  /** ISO timestamp of the newest write across the member's entries. */
  latestEntryUpdatedAt: string | null
  /** Total entries for the member — detects hard deletes. */
  entryCount: number
}

export function isSameTrackerPulse(a: TrackerPulse, b: TrackerPulse): boolean {
  return (
    a.activeEntryId === b.activeEntryId &&
    a.activeEntryUpdatedAt === b.activeEntryUpdatedAt &&
    a.latestEntryUpdatedAt === b.latestEntryUpdatedAt &&
    a.entryCount === b.entryCount
  )
}

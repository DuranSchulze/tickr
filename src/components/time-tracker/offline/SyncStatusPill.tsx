import { lazy, Suspense, useState } from 'react'
import { AlertTriangle, Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { cn } from '#/lib/utils'
import {
  useCurrentOfflineOwner,
  useSyncStatus,
} from '#/lib/time-tracker/sync-status'

const SyncIssuesDrawer = lazy(() => import('./SyncIssuesDrawer'))

/**
 * Persistent sync status for the member's own offline work (offline-mode
 * REQ-5): online/offline from the probe, pending count and oldest age, and
 * items needing review. Status is conveyed by text and icon, never colour
 * alone, and changes are announced politely.
 */
export function SyncStatusPill({ workspaceId }: { workspaceId: string }) {
  const owner = useCurrentOfflineOwner(workspaceId)
  const status = useSyncStatus(owner)
  const [open, setOpen] = useState(false)

  if (!owner || !status) return null
  const attention = status.needsReview + status.needsConfirmation > 0
  const Icon = attention
    ? AlertTriangle
    : !status.online
      ? CloudOff
      : status.pending > 0
        ? RefreshCw
        : Cloud
  const shortLabel = attention
    ? `${status.needsReview + status.needsConfirmation} need review`
    : !status.online
      ? status.pending > 0
        ? `Offline · ${status.pending} pending`
        : 'Offline'
      : status.pending > 0
        ? `${status.pending} pending`
        : 'Synced'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Sync status: ${status.label}. Open sync details.`}
        className={cn(
          'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50',
          attention
            ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : !status.online
              ? 'border-stone bg-warm-taupe text-foreground'
              : 'border-stone bg-eggshell text-smoke hover:bg-accent',
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">{shortLabel}</span>
        {/* Compact on phones: the count still shows as text. */}
        <span className="sm:hidden">
          {attention
            ? `${status.needsReview + status.needsConfirmation}!`
            : status.pending > 0
              ? status.pending
              : status.online
                ? ''
                : 'Off'}
        </span>
      </button>
      <span
        className="sr-only"
        aria-live="polite"
        role="status"
        data-sync-status=""
      >
        {status.label}
      </span>
      {open ? (
        <Suspense fallback={null}>
          <SyncIssuesDrawer owner={owner} open={open} onOpenChange={setOpen} />
        </Suspense>
      ) : null}
    </>
  )
}

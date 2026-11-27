import { useState, useSyncExternalStore } from 'react'
import { AlertTriangle, Clock, CloudOff, RefreshCw } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '#/components/ui/drawer'
import {
  discardParkedItem,
  removeQueuedItemsForEntry,
  retryParkedItem,
  updateQueuedItem,
} from '#/lib/time-tracker/offline-queue'
import { itemEntryId } from '#/lib/time-tracker/offline-queue-types'
import {
  getOwnerState,
  subscribeOfflineStore,
} from '#/lib/time-tracker/offline-store'
import type {
  NeedsReviewItem,
  QueuedItem,
} from '#/lib/time-tracker/offline-store'
import {
  normalizeItemTimes,
  requestOfflineSync,
} from '#/lib/time-tracker/offline-replay'
import { removePendingEntry } from '#/lib/time-tracker/pending-entries'
import { formatAge, useSyncStatus } from '#/lib/time-tracker/sync-status'
import { toast } from '#/lib/toast'

const ACTION_LABELS: Record<QueuedItem['type'], string> = {
  startTimer: 'Timer start',
  stopTimer: 'Timer stop',
  discardTimer: 'Timer discard',
  createManualEntry: 'Manual entry',
}

function describe(item: QueuedItem) {
  const description =
    'description' in item.payload &&
    typeof item.payload.description === 'string'
      ? item.payload.description
      : ''
  return description || 'No description'
}

function formatTime(iso: string | undefined) {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
}

function itemTimes(item: QueuedItem) {
  if (item.type === 'createManualEntry') {
    return `${formatTime(item.payload.startedAt)} – ${formatTime(item.payload.endedAt)}`
  }
  if (item.type === 'startTimer') return formatTime(item.payload.startedAt)
  if (item.type === 'stopTimer') return formatTime(item.payload.endedAt)
  return null
}

function SupportId({ id }: { id: string }) {
  return (
    <p className="m-0 mt-1 break-all font-mono text-[11px] text-smoke">
      Support ID: {id}
    </p>
  )
}

/**
 * Pending and needs-review offline work (offline-mode REQ-3, REQ-5). Nothing
 * is removed without an explicit, confirmed Discard.
 */
export default function SyncIssuesDrawer({
  owner,
  open,
  onOpenChange,
}: {
  owner: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const state = useSyncExternalStore(
    subscribeOfflineStore,
    () => getOwnerState(owner),
    () => getOwnerState(owner),
  )
  const status = useSyncStatus(owner)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [workspaceId, memberId] = owner.split(':')
  const now = Date.now()

  async function act(id: string, action: () => Promise<unknown>) {
    setBusyId(id)
    try {
      await action()
      requestOfflineSync()
    } catch (err) {
      toast.error('Could not update this item', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setBusyId(null)
      setConfirmingId(null)
    }
  }

  const retry = (review: NeedsReviewItem) =>
    act(review.id, () => retryParkedItem(owner, review.id))
  const discard = (review: NeedsReviewItem) =>
    act(review.id, async () => {
      const { entryId } = await discardParkedItem(owner, review.id)
      if (entryId) removePendingEntry(workspaceId, memberId, entryId)
    })
  const sendCorrected = (item: QueuedItem) =>
    act(item.id, () =>
      updateQueuedItem(owner, item.id, (i) => ({
        ...i,
        needsConfirmation: false,
        clockConfirmed: true,
      })),
    )
  const discardQueued = (item: QueuedItem) =>
    act(item.id, async () => {
      const entryId = itemEntryId(item)
      await removeQueuedItemsForEntry(workspaceId, memberId, entryId)
      removePendingEntry(workspaceId, memberId, entryId)
    })

  const confirmations = state.queue.filter((i) => i.needsConfirmation)
  const pending = state.queue.filter((i) => !i.needsConfirmation)

  function DiscardButton({
    id,
    onConfirm,
  }: {
    id: string
    onConfirm: () => void
  }) {
    if (confirmingId === id) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-destructive">
            Discard permanently? These hours will not reach payroll.
          </span>
          <Button
            variant="destructive"
            size="sm"
            className="min-h-11"
            disabled={busyId === id}
            onClick={onConfirm}
          >
            Yes, discard
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => setConfirmingId(null)}
          >
            Keep
          </Button>
        </div>
      )
    }
    return (
      <Button
        variant="outline"
        size="sm"
        className="min-h-11"
        disabled={busyId === id}
        onClick={() => setConfirmingId(id)}
      >
        Discard
      </Button>
    )
  }

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2 font-heading text-lg font-black">
            {status?.online ? (
              <RefreshCw className="size-5 text-primary" aria-hidden="true" />
            ) : (
              <CloudOff className="size-5 text-primary" aria-hidden="true" />
            )}
            Sync status
          </DrawerTitle>
          <DrawerDescription>
            {status?.online
              ? 'Connected. Saved work syncs automatically.'
              : 'Offline. Your work is saved on this device and syncs when you reconnect.'}{' '}
            {status?.lastSyncAt
              ? `Last synced ${formatAge(status.lastSyncAt, now)} ago.`
              : 'Not synced from this device yet.'}
          </DrawerDescription>
        </DrawerHeader>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-4 pb-6">
          {state.needsReview.length > 0 ? (
            <section
              aria-labelledby="needs-review-heading"
              className="grid gap-2"
            >
              <h3
                id="needs-review-heading"
                className="m-0 flex items-center gap-2 text-sm font-bold text-foreground"
              >
                <AlertTriangle
                  className="size-4 text-destructive"
                  aria-hidden="true"
                />
                Needs review ({state.needsReview.length})
              </h3>
              <p className="m-0 text-xs text-smoke">
                The server did not accept these. They stay here until you retry
                or discard them; changes that depend on them are on hold.
              </p>
              <ul className="m-0 grid list-none gap-2 p-0">
                {state.needsReview.map((review) => (
                  <li
                    key={review.id}
                    className="rounded-xl border border-destructive/30 bg-destructive/5 p-3"
                  >
                    <p className="m-0 text-sm font-semibold text-foreground">
                      {review.item
                        ? `${ACTION_LABELS[review.item.type]}: ${describe(review.item)}`
                        : 'Unreadable saved item'}
                    </p>
                    {review.item ? (
                      <p className="m-0 text-xs text-smoke">
                        {itemTimes(review.item)}
                      </p>
                    ) : null}
                    <p className="m-0 mt-1 text-xs font-medium text-destructive">
                      {review.message}
                    </p>
                    <SupportId id={review.id} />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {review.item ? (
                        <Button
                          size="sm"
                          className="min-h-11"
                          disabled={busyId === review.id}
                          onClick={() => void retry(review)}
                        >
                          Retry
                        </Button>
                      ) : null}
                      <DiscardButton
                        id={review.id}
                        onConfirm={() => void discard(review)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {confirmations.length > 0 ? (
            <section aria-labelledby="clock-heading" className="grid gap-2">
              <h3
                id="clock-heading"
                className="m-0 flex items-center gap-2 text-sm font-bold text-foreground"
              >
                <Clock className="size-4 text-destructive" aria-hidden="true" />
                Check the time ({confirmations.length})
              </h3>
              <p className="m-0 text-xs text-smoke">
                This device&apos;s clock was off when these were captured. They
                will be sent with the corrected time shown.
              </p>
              <ul className="m-0 grid list-none gap-2 p-0">
                {confirmations.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-stone p-3"
                  >
                    <p className="m-0 text-sm font-semibold text-foreground">
                      {ACTION_LABELS[item.type]}: {describe(item)}
                    </p>
                    <p className="m-0 text-xs text-smoke">
                      Corrected: {itemTimes(normalizeItemTimes(item))}
                    </p>
                    <SupportId id={item.id} />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="min-h-11"
                        disabled={busyId === item.id}
                        onClick={() => void sendCorrected(item)}
                      >
                        Send corrected time
                      </Button>
                      <DiscardButton
                        id={item.id}
                        onConfirm={() => void discardQueued(item)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="pending-heading" className="grid gap-2">
            <h3
              id="pending-heading"
              className="m-0 text-sm font-bold text-foreground"
            >
              Waiting to sync ({pending.length})
            </h3>
            {pending.length === 0 ? (
              <p className="m-0 text-sm text-smoke">Nothing waiting.</p>
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {pending.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-stone p-3"
                  >
                    <p className="m-0 text-sm font-semibold text-foreground">
                      {ACTION_LABELS[item.type]}: {describe(item)}
                    </p>
                    <p className="m-0 text-xs text-smoke">
                      Saved {formatAge(item.capturedAt, now)} ago
                      {itemTimes(item) ? ` · ${itemTimes(item)}` : ''}
                    </p>
                    <SupportId id={item.id} />
                  </li>
                ))}
              </ul>
            )}
            {status?.online && pending.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 justify-self-start"
                onClick={() => requestOfflineSync()}
              >
                Sync now
              </Button>
            ) : null}
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { DatabaseZap, MapPin, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import {
  purgeWorkspaceLocationDataFn,
  updateWorkspaceLocationTrackingFn,
} from '#/lib/server/tracker'
import { gooeyToast } from '#/lib/toast'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import { cn } from '#/lib/utils'

export function LocationTrackingPanel({
  workspaceName,
  locationTrackingEnabled,
  taggedEntryCount,
  isOwner,
}: {
  workspaceName: string
  locationTrackingEnabled: boolean
  taggedEntryCount: number
  isOwner: boolean
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')

  async function refreshLocationData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trackerKeys.state }),
      queryClient.invalidateQueries({ queryKey: ['location-history'] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-activity'] }),
    ])
    await router.invalidate()
  }

  const trackingMutation = useMutation({
    mutationKey: ['workspace-location-tracking'],
    mutationFn: (enabled: boolean) =>
      updateWorkspaceLocationTrackingFn({ data: { enabled } }),
    onSuccess: async ({ enabled }) => {
      await refreshLocationData()
      gooeyToast.success(
        enabled ? 'Location tracking enabled' : 'Location tracking disabled',
      )
    },
    onError: (error) => {
      gooeyToast.error('Could not update location tracking', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      })
    },
  })

  const purgeMutation = useMutation({
    mutationKey: ['workspace-location-data-purge'],
    mutationFn: () => purgeWorkspaceLocationDataFn({ data: { confirmation } }),
    onSuccess: async ({ purgedEntryCount }) => {
      setDialogOpen(false)
      setConfirmation('')
      await refreshLocationData()
      gooeyToast.success('Location history erased', {
        description: `Removed origin data from ${purgedEntryCount.toLocaleString()} ${purgedEntryCount === 1 ? 'entry' : 'entries'}.`,
      })
    },
    onError: (error) => {
      gooeyToast.error('Could not erase location history', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      })
    },
  })

  const pending = trackingMutation.isPending || purgeMutation.isPending
  const confirmationMatches = confirmation.trim() === workspaceName

  function handleDialogChange(open: boolean) {
    if (purgeMutation.isPending) return
    setDialogOpen(open)
    if (!open) setConfirmation('')
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="m-0 flex items-center gap-2 text-base font-bold text-foreground">
              <MapPin className="size-4 text-primary" />
              Location tracking
            </h2>
            <p className="m-0 mt-1 max-w-2xl text-sm text-muted-foreground">
              Add network or device location details to new time entries. This
              helps authorized workspace members review where work was logged.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                locationTrackingEnabled
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  locationTrackingEnabled
                    ? 'bg-emerald-500'
                    : 'bg-muted-foreground',
                )}
              />
              {locationTrackingEnabled ? 'Collecting' : 'Not collecting'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={locationTrackingEnabled}
              aria-label="Toggle location tracking"
              disabled={pending || !isOwner}
              onClick={() => trackingMutation.mutate(!locationTrackingEnabled)}
              className={cn(
                'relative h-6 w-11 shrink-0 rounded-full outline-none transition-colors motion-reduce:transition-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                locationTrackingEnabled
                  ? 'bg-primary'
                  : 'bg-muted-foreground/30',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] motion-reduce:transition-none',
                  locationTrackingEnabled ? 'left-[22px]' : 'left-0.5',
                )}
              />
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-y border-border py-4 sm:grid-cols-2 sm:divide-x sm:divide-border">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="m-0 text-sm font-semibold text-foreground">
                Future entries
              </p>
              <p className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
                {locationTrackingEnabled
                  ? 'New entries can receive location details.'
                  : 'New entries are saved without origin details.'}
              </p>
            </div>
          </div>
          <div className="flex gap-3 sm:pl-4">
            <DatabaseZap className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="m-0 text-sm font-semibold text-foreground">
                Recorded history
              </p>
              <p className="m-0 mt-0.5 text-xs leading-5 text-muted-foreground">
                {isOwner
                  ? `${taggedEntryCount.toLocaleString()} ${taggedEntryCount === 1 ? 'entry has' : 'entries have'} origin data.`
                  : 'Existing location details are retained.'}
              </p>
            </div>
          </div>
        </div>

        {!isOwner && (
          <p className="m-0 mt-4 text-xs text-muted-foreground">
            Only the workspace Owner can change location privacy settings.
          </p>
        )}
      </div>

      {isOwner && (
        <div className="border-t border-destructive/20 bg-destructive/[0.025] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="m-0 text-sm font-bold text-foreground">
                Erase recorded location history
              </h3>
              <p className="m-0 mt-1 max-w-2xl text-sm text-muted-foreground">
                Permanently remove IP, location, coordinates, and browser
                details. Time entries and their work data remain unchanged.
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              className="shrink-0"
              disabled={pending || taggedEntryCount === 0}
              onClick={() => setDialogOpen(true)}
            >
              <Trash2 />
              {taggedEntryCount === 0 ? 'No history to erase' : 'Erase history'}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Erase location history?</DialogTitle>
            <DialogDescription>
              This permanently removes origin data from{' '}
              <strong className="text-foreground">
                {taggedEntryCount.toLocaleString()}{' '}
                {taggedEntryCount === 1 ? 'time entry' : 'time entries'}
              </strong>
              . The entries themselves will stay in the workspace.
            </DialogDescription>
          </DialogHeader>

          {locationTrackingEnabled && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
              Tracking is still enabled. New or in-progress entries may add
              location details again after this erase finishes.
            </div>
          )}

          <form
            id="purge-location-history-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (confirmationMatches) purgeMutation.mutate()
            }}
            className="grid gap-2"
          >
            <label
              htmlFor="purge-location-confirmation"
              className="text-sm font-semibold text-foreground"
            >
              Type <span className="font-mono">{workspaceName}</span> to confirm
            </label>
            <Input
              id="purge-location-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              autoFocus
              disabled={purgeMutation.isPending}
              aria-invalid={confirmation.length > 0 && !confirmationMatches}
            />
          </form>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={purgeMutation.isPending}
              onClick={() => handleDialogChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="purge-location-history-form"
              variant="destructive"
              disabled={!confirmationMatches || purgeMutation.isPending}
            >
              <Trash2 />
              {purgeMutation.isPending ? 'Erasing…' : 'Erase location history'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

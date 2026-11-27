import { useState, useSyncExternalStore } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  clearOfflineSaveFailure,
  getOfflineSaveFailure,
  subscribeOfflineSaveFailure,
} from '#/lib/time-tracker/offline-alerts'

/**
 * Blocking error for an offline capture that could not be saved on this
 * device (offline-mode REQ-1). The user's input is kept by the capture flow;
 * this dialog explains it and offers Retry.
 */
export function OfflineSaveErrorDialog() {
  const failure = useSyncExternalStore(
    subscribeOfflineSaveFailure,
    getOfflineSaveFailure,
    () => null,
  )
  const [retrying, setRetrying] = useState(false)

  async function retry() {
    const action = failure?.retry
    if (!action) return
    setRetrying(true)
    clearOfflineSaveFailure()
    try {
      await action()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <Dialog
      open={failure !== null}
      onOpenChange={(open) => {
        if (!open) clearOfflineSaveFailure()
      }}
    >
      <DialogContent role="alertdialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle
              className="size-5 text-destructive"
              aria-hidden="true"
            />
            {failure?.title ?? 'Not saved'}
          </DialogTitle>
          <DialogDescription>{failure?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => clearOfflineSaveFailure()}
          >
            Close
          </Button>
          {failure?.retry ? (
            <Button
              className="min-h-11"
              disabled={retrying}
              onClick={() => void retry()}
            >
              Try again
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

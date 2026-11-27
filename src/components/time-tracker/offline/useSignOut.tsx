import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Download } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { getLastOfflineOwner } from '#/lib/time-tracker/offline-config'
import {
  clearSignOutPending,
  countUnsyncedWork,
  exportUnsyncedWork,
  markSignOutPending,
  wipeLocalData,
} from '#/lib/time-tracker/offline-wipe'

/** Ends the server session left open by an offline logout. */
export async function completePendingSignOut() {
  try {
    await authClient.signOut()
    clearSignOutPending()
  } catch {
    // still offline: the marker keeps the app signed out until it works
  }
}

/**
 * Sign-out for every navigation surface (offline-mode REQ-8). Warns first
 * when unsynced work would be lost, wipes all local offline data (works with
 * no network), then ends the server session.
 */
export function useSignOut({ onStart }: { onStart?: () => void } = {}) {
  const queryClient = useQueryClient()
  const [unsynced, setUnsynced] = useState(0)
  const [busy, setBusy] = useState(false)

  async function finish() {
    setBusy(true)
    markSignOutPending()
    try {
      await wipeLocalData(queryClient)
    } catch (err) {
      console.warn('Local offline data was not fully removed', err)
    }
    await completePendingSignOut()
    // A full load, so no in-memory state of this member survives.
    window.location.assign('/auth')
  }

  async function signOut() {
    onStart?.()
    const owner = getLastOfflineOwner()
    const count = await countUnsyncedWork(owner).catch(() => 0)
    if (count > 0) {
      setUnsynced(count)
      return
    }
    await finish()
  }

  function exportWork() {
    const owner = getLastOfflineOwner()
    if (!owner) return
    const url = URL.createObjectURL(exportUnsyncedWork(owner))
    const link = document.createElement('a')
    link.href = url
    link.download = `trackly-unsynced-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const dialog = (
    <Dialog
      open={unsynced > 0}
      onOpenChange={(open) => {
        if (!open && !busy) setUnsynced(0)
      }}
    >
      <DialogContent role="alertdialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle
              className="size-5 text-destructive"
              aria-hidden="true"
            />
            Unsynced work on this device
          </DialogTitle>
          <DialogDescription>
            {unsynced} {unsynced === 1 ? 'change has' : 'changes have'} not
            reached the server yet. Signing out removes{' '}
            {unsynced === 1 ? 'it' : 'them'} from this device permanently.
            Reconnect and wait for sync, or export a copy first.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-wrap gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() => setUnsynced(0)}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={exportWork}
          >
            <Download className="size-4" aria-hidden="true" />
            Export
          </Button>
          <Button
            variant="destructive"
            className="min-h-11"
            disabled={busy}
            onClick={() => void finish()}
          >
            Sign out anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { signOut, dialog }
}

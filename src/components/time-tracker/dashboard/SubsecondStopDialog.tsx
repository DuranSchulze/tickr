import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'

export function SubsecondStopDialog({
  open,
  onContinue,
  onKeep,
  onDiscard,
}: {
  open: boolean
  onContinue: () => void
  onKeep: () => void
  onDiscard: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onContinue()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keep this very short entry?</DialogTitle>
          <DialogDescription>
            The timer ran for less than one second. You can keep the exact
            timestamps, discard the timer, or close this dialog to continue
            tracking.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onKeep}>
            Keep entry
          </Button>
          <Button type="button" variant="destructive" onClick={onDiscard}>
            Discard timer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

import { createRoot } from 'react-dom/client'
import { checkTimeEntryOverlapFn } from '#/lib/server/tracker'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

type TimeEntryOverlapConflict = {
  id: string
  description: string
  startedAt: string
  endedAt: string | null
}

export type OverlapCheckInput = {
  memberId?: string
  entryId?: string
  excludeEntryId?: string
  startedAt?: string
  endedAt?: string
}

function formatConflictTime(value: string): string {
  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function showOverlapConfirmation(
  conflicts: TimeEntryOverlapConflict[],
): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    let settled = false

    const finish = (result: boolean) => {
      if (settled) return
      settled = true
      root.unmount()
      container.remove()
      resolve(result)
    }

    root.render(
      <Dialog open onOpenChange={(open) => !open && finish(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Overlapping time detected</DialogTitle>
            <DialogDescription>
              This entry overlaps existing work for the same member.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-72 gap-2 overflow-y-auto">
            {conflicts.slice(0, 5).map((conflict) => (
              <div
                key={conflict.id}
                className="rounded-lg border border-border bg-muted/30 p-3"
              >
                <p className="m-0 text-sm font-semibold text-foreground">
                  {conflict.description || 'Untitled'}
                </p>
                <p className="m-0 mt-1 text-xs text-muted-foreground">
                  {formatConflictTime(conflict.startedAt)} –{' '}
                  {conflict.endedAt
                    ? formatConflictTime(conflict.endedAt)
                    : 'Currently running'}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => finish(false)}>
              Cancel
            </Button>
            <Button onClick={() => finish(true)}>Save anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    )
  })
}

export async function confirmTimeEntryOverlap(
  input: OverlapCheckInput,
): Promise<boolean> {
  const conflicts = await checkTimeEntryOverlapFn({ data: input })
  if (conflicts.length === 0) return true
  return showOverlapConfirmation(conflicts)
}

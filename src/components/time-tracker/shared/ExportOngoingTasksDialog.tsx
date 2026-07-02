import { AlertTriangle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import type { ExportOngoingTaskSummary } from '#/lib/time-tracker/export-ongoing-tasks'

function formatStartedAt(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function ExportOngoingTasksDialog({
  open,
  summary,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  summary: ExportOngoingTaskSummary | null
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const count = summary?.count ?? 0
  const memberCount = summary?.memberCount ?? 0
  const taskLabel = count === 1 ? 'ongoing task' : 'ongoing tasks'
  const memberLabel = memberCount === 1 ? 'member' : 'members'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            Ongoing tasks found
          </DialogTitle>
          <DialogDescription>
            {count} {taskLabel} from {memberCount} {memberLabel} will not be
            included because export files only include completed time entries.
          </DialogDescription>
        </DialogHeader>

        {summary?.examples.length ? (
          <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <p className="m-0 text-xs font-semibold text-foreground">
              Active tasks
            </p>
            <div className="grid gap-2">
              {summary.examples.map((entry) => (
                <div
                  key={entry.id}
                  className="grid gap-1 rounded-md bg-background p-2 text-xs"
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate font-semibold text-foreground">
                      {entry.memberName}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatStartedAt(entry.startedAt)}
                    </span>
                  </div>
                  <span className="truncate text-muted-foreground">
                    {[entry.projectName, entry.clientName, entry.taskName]
                      .filter(Boolean)
                      .join(' / ') || 'No project or task selected'}
                  </span>
                  {entry.description ? (
                    <span className="line-clamp-2 text-muted-foreground">
                      {entry.description}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            Export completed entries
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

export type StepStatus = 'pending' | 'running' | 'done' | 'error'

export type ImportStep = {
  label: string
  status: StepStatus
  count?: number
  warnings?: string[]
  error?: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  steps: ImportStep[]
  done: boolean
}

function completedCount(steps: ImportStep[]) {
  return steps.filter((s) => s.status === 'done' || s.status === 'error').length
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'running')
    return <Loader2 className="h-4 w-4 animate-spin text-primary" />
  if (status === 'done')
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  if (status === 'error')
    return <XCircle className="h-4 w-4 text-destructive" />
  return <Circle className="h-4 w-4 text-muted-foreground/50" />
}

export function CatalogImportDialog({
  open,
  onOpenChange,
  steps,
  done,
}: Props) {
  const progress = Math.round((completedCount(steps) / steps.length) * 100)
  const hasError = steps.some((s) => s.status === 'error')
  const isRunning = steps.some((s) => s.status === 'running')
  const failedStep = steps.find((s) => s.status === 'error')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {hasError
              ? 'Import stopped'
              : done
                ? 'Import complete'
                : 'Importing from Google Sheet'}
          </DialogTitle>
          <DialogDescription>
            {hasError
              ? 'An error occurred during the import process.'
              : done
                ? 'All items have been imported successfully.'
                : 'Importing projects, clients, and tags from your Google Sheet.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {isRunning && (
            <p className="text-sm text-muted-foreground">
              You can close this dialog — the import continues in the
              background.
            </p>
          )}

          {/* Progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ${hasError ? 'bg-destructive' : 'bg-primary'}`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Step list */}
          <ul className="space-y-3">
            {steps.map((step) => (
              <li key={step.label} className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">
                  <StepIcon status={step.status} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">
                    {step.label}
                    {step.status === 'done' && step.count !== undefined && (
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        — {step.count} {step.count === 1 ? 'record' : 'records'}
                      </span>
                    )}
                  </p>
                  {step.status === 'done' &&
                    (step.warnings?.length ?? 0) > 0 && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {step.warnings!.length} row
                        {step.warnings!.length !== 1 ? 's' : ''} skipped
                      </p>
                    )}
                </div>
              </li>
            ))}
          </ul>

          {/* Error banner */}
          {hasError && failedStep?.error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5">
              <p className="text-xs font-semibold text-destructive">
                {failedStep.label} step failed
              </p>
              <p className="mt-0.5 text-xs text-destructive/80">
                {failedStep.error}
              </p>
            </div>
          )}

          {done && !hasError && (
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              All steps completed successfully.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

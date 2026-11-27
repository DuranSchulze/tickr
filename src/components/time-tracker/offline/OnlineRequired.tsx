import { ErrorComponent } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { CloudOff } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { isNetworkError } from '#/lib/time-tracker/connectivity'

/**
 * Router default error view (offline-mode REQ-7). Screens that are not kept
 * for offline use (analytics, team views, reports, settings, ...) explain that
 * they need a connection; every other error renders exactly as before.
 */
export function OfflineAwareErrorComponent(props: ErrorComponentProps) {
  if (typeof window === 'undefined' || !isNetworkError(props.error)) {
    return <ErrorComponent error={props.error} />
  }
  return (
    <div className="mx-auto my-10 grid max-w-lg gap-4 rounded-xl border border-stone bg-eggshell p-6 text-center shadow-[var(--shadow-whisper)]">
      <CloudOff className="mx-auto size-8 text-primary" aria-hidden="true" />
      <div role="status">
        <p className="m-0 text-sm font-semibold text-primary">
          Online required
        </p>
        <h1 className="m-0 mt-1 font-display text-heading-sm text-foreground">
          This screen needs a connection
        </h1>
        <p className="m-0 mt-2 text-sm text-smoke">
          Offline, you can use the time tracker and your own timesheet.
          Reconnect to open this screen.
        </p>
      </div>
      <Button
        type="button"
        className="mx-auto min-h-11"
        onClick={() => props.reset()}
      >
        Try again
      </Button>
    </div>
  )
}

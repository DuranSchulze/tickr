import { CloudOff, RefreshCw } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { getLastOfflineOwner } from '#/lib/time-tracker/offline-config'
import type { OfflineGateError } from '#/lib/time-tracker/offline-boot'
import { useOfflineOwner } from '#/lib/time-tracker/useOfflineOwner'

/**
 * Shown instead of `/onboarding` when the app opens without a connection and
 * no usable session snapshot exists (offline-mode REQ-6). Queued work is kept
 * and its count stays visible; nothing is deleted.
 */
export function OfflineSignInGate({ error }: { error: OfflineGateError }) {
  const owner = getLastOfflineOwner()
  const [workspaceId, memberId] = owner ? owner.split(':') : [null, null]
  const state = useOfflineOwner(workspaceId, memberId)
  const pending = state.queue.length + state.needsReview.length

  return (
    <main className="flex min-h-screen items-center justify-center bg-eggshell px-4 py-12">
      <section
        aria-labelledby="offline-gate-title"
        className="grid w-full max-w-lg gap-4 rounded-xl border border-stone bg-eggshell p-6 shadow-[var(--shadow-whisper)]"
      >
        <p className="m-0 inline-flex w-fit items-center gap-2 rounded-full border border-stone bg-warm-taupe px-2.5 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
          <CloudOff className="size-3.5" aria-hidden="true" />
          Offline
        </p>
        <h1
          id="offline-gate-title"
          className="m-0 font-display text-3xl font-black tracking-tight text-foreground"
        >
          Sign in to keep tracking
        </h1>
        <p className="m-0 text-base leading-7 text-smoke">
          {error.reason === 'expired'
            ? `You have been offline for more than ${error.graceHours} hours since your last sign-in on this device. Connect to the internet and sign in to continue.`
            : 'This device has not opened Trackly online recently, so it cannot open offline. Connect to the internet and sign in once.'}
        </p>
        <p
          className="m-0 rounded-md border border-stone bg-warm-taupe p-3 text-sm font-semibold text-foreground"
          role="status"
          aria-live="polite"
        >
          {pending > 0
            ? `${pending} ${pending === 1 ? 'change is' : 'changes are'} saved on this device and will sync after you sign in.`
            : 'No unsynced work is waiting on this device.'}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button className="min-h-11" onClick={() => window.location.reload()}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <a href="/auth" className="no-underline">
              Sign in
            </a>
          </Button>
        </div>
      </section>
    </main>
  )
}

import { useState } from 'react'
import { gooeyToast } from '#/lib/toast'
import { useRouter } from '@tanstack/react-router'
import { ExternalLink, RefreshCcw } from 'lucide-react'
import { syncWorkspaceToGoogleSheetsFn } from '#/lib/server/gsheets/sync'

export function GoogleSheetSyncButton({
  sheetUrl,
  lastSyncedAt,
}: {
  sheetUrl: string | null
  lastSyncedAt: string | null
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleSync() {
    if (!sheetUrl) {
      gooeyToast.error('No Google Sheet connected', {
        description:
          'This workspace has no Google Sheet linked yet, so there is nothing to sync to. The workspace Owner can add one in Workspace settings.',
      })
      return
    }
    setPending(true)
    try {
      const result = await syncWorkspaceToGoogleSheetsFn()
      await router.invalidate()
      gooeyToast.success('Synced to Google Sheets', {
        description: `${result.departmentCount} tab(s), ${result.rowCount} row(s).`,
      })
    } catch (err) {
      gooeyToast.error('Sync failed', {
        description:
          err instanceof Error && err.message
            ? err.message
            : 'Something went wrong while syncing. Please try again, and contact an admin if it keeps failing.',
      })
    } finally {
      setPending(false)
    }
  }

  // Keep the button clickable even without a linked sheet so the user gets a
  // clear toast explaining why sync can't proceed (rather than a dead button).
  const disabled = pending
  const tooltip = !sheetUrl
    ? 'No Google Sheet is linked yet. Set the URL in workspace settings first.'
    : 'Push all time entries to the linked Google Sheet.'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={disabled}
        title={tooltip}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCcw className={`size-3.5 ${pending ? 'animate-spin' : ''}`} />
        {pending ? 'Syncing…' : 'Google Sheet sync'}
      </button>
      {sheetUrl && (
        <a
          href={sheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Open linked Google Sheet"
          title="Open linked Google Sheet"
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}
      {lastSyncedAt && (
        <span className="text-xs text-muted-foreground">
          Last synced {new Date(lastSyncedAt).toLocaleString()}
        </span>
      )}
    </div>
  )
}

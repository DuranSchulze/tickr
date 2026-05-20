import { useState } from 'react'
import { gooeyToast } from 'goey-toast'
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
    setPending(true)
    try {
      const result = await syncWorkspaceToGoogleSheetsFn()
      await router.invalidate()
      gooeyToast.success('Synced to Google Sheets', {
        description: `${result.departmentCount} tab(s), ${result.rowCount} row(s).`,
      })
    } catch (err) {
      gooeyToast.error('Sync failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  const disabled = pending || !sheetUrl
  const tooltip = !sheetUrl
    ? 'Set the Google Sheet URL in workspace settings first.'
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
        <RefreshCcw
          className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`}
        />
        {pending ? 'Syncing…' : 'Google Sheet sync'}
      </button>
      {sheetUrl && (
        <a
          href={sheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Open linked Google Sheet"
          title="Open linked Google Sheet"
        >
          <ExternalLink className="h-3.5 w-3.5" />
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

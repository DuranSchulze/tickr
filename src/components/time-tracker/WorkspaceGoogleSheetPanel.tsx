import { useEffect, useState } from 'react'
import { gooeyToast } from 'goey-toast'
import { useRouter } from '@tanstack/react-router'
import { Download, ExternalLink, Save } from 'lucide-react'
import {
  getServiceAccountEmailFn,
  updateWorkspaceGoogleSheetFn,
} from '#/lib/server/gsheets/settings'
import type { Workspace } from '#/lib/time-tracker/types'
import { SyncSheetDialog } from './catalogs/SyncSheetDialog'

export function WorkspaceGoogleSheetPanel({
  workspace,
  permissionLevel,
}: {
  workspace: Workspace
  permissionLevel: string
}) {
  const router = useRouter()
  const [url, setUrl] = useState(workspace.googleSheetUrl ?? '')
  const [pending, setPending] = useState(false)
  const [showSyncDialog, setShowSyncDialog] = useState(false)
  const [serviceEmail, setServiceEmail] = useState<string | null>(null)
  const [emailError, setEmailError] = useState(false)

  const isOwner = permissionLevel === 'OWNER'
  const isOwnerOrAdmin =
    permissionLevel === 'OWNER' || permissionLevel === 'ADMIN'
  const isAtLeastManager = isOwnerOrAdmin || permissionLevel === 'MANAGER'

  useEffect(() => {
    setUrl(workspace.googleSheetUrl ?? '')
  }, [workspace.googleSheetUrl])

  useEffect(() => {
    let cancelled = false
    getServiceAccountEmailFn()
      .then((res) => {
        if (cancelled) return
        if (res.email) setServiceEmail(res.email)
        else setEmailError(true)
      })
      .catch(() => {
        if (!cancelled) setEmailError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await updateWorkspaceGoogleSheetFn({ data: { url } })
      await router.invalidate()
      gooeyToast.success(
        url.trim() ? 'Google Sheet linked' : 'Google Sheet unlinked',
      )
    } catch (err) {
      gooeyToast.error('Could not save Google Sheet URL', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  function handleImport() {
    setShowSyncDialog(true)
  }

  const dirty = url.trim() !== (workspace.googleSheetUrl ?? '').trim()

  return (
    <>
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <header className="mb-4">
          <h2 className="m-0 text-base font-bold text-foreground">
            Google Sheets sync
          </h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            Link a Google Sheet so owners, admins, and managers can push the
            workspace's time entries with one click.
          </p>
        </header>

        <ServiceAccountHint email={serviceEmail} errored={emailError} />

        {isOwner ? (
          <form onSubmit={handleSave} className="mt-4 grid gap-3">
            <label className="grid gap-1.5 text-xs font-semibold text-foreground">
              Google Sheet URL
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="h-9 rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={pending || !dirty}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                <Save className="h-3.5 w-3.5" />
                {pending ? 'Saving…' : 'Save URL'}
              </button>
              {workspace.googleSheetUrl && (
                <a
                  href={workspace.googleSheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-accent"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open sheet
                </a>
              )}
            </div>
          </form>
        ) : isAtLeastManager && workspace.googleSheetUrl ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="m-0 flex-1 text-sm text-muted-foreground">
              Sheet linked by the workspace Owner.
            </p>
            <a
              href={workspace.googleSheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open sheet
            </a>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Only the workspace Owner can change the Google Sheet URL.
          </p>
        )}

        {workspace.googleSheetSyncedAt && (
          <p className="mt-4 text-xs text-muted-foreground">
            Last synced{' '}
            {new Date(workspace.googleSheetSyncedAt).toLocaleString()}.
          </p>
        )}

        {workspace.googleSheetUrl && isAtLeastManager && (
          <div className="mt-5 border-t border-border pt-5">
            <h3 className="m-0 text-sm font-bold text-foreground">
              Import catalogs from sheet
            </h3>
            <p className="m-0 mt-1 text-sm text-muted-foreground">
              Reads the &quot;Clients&quot;, &quot;Projects&quot;, and
              &quot;Tags&quot; tabs and creates or updates matching records.
              Tabs are created automatically if they don&apos;t exist yet.
            </p>
            <button
              type="button"
              onClick={handleImport}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110"
            >
              <Download className="h-3.5 w-3.5" />
              Import catalogs
            </button>
          </div>
        )}
      </section>

      <SyncSheetDialog
        open={showSyncDialog}
        onClose={async () => {
          setShowSyncDialog(false)
          await router.invalidate()
        }}
        type="all"
      />
    </>
  )
}

function ServiceAccountHint({
  email,
  errored,
}: {
  email: string | null
  errored: boolean
}) {
  if (errored) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
        Google Sheets sync is not configured on this server. Ask an
        administrator to set <code>GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON</code> in
        the environment.
      </div>
    )
  }
  if (!email) {
    return (
      <div className="rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
        Loading service-account email…
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-foreground">
      Share your Google Sheet with this service account as{' '}
      <strong>Editor</strong>:{' '}
      <code className="break-all font-mono">{email}</code>
    </div>
  )
}

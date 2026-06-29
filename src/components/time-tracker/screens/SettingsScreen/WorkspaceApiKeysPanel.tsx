import { useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, KeyRound, Plus, Trash2 } from 'lucide-react'
import { gooeyToast } from '#/lib/toast'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  createWorkspaceApiKeyFn,
  listWorkspaceApiKeysFn,
  revokeWorkspaceApiKeyFn,
} from '#/lib/server/integrations/api-keys'
import type { WorkspaceApiKeyMetadata } from '#/lib/server/integrations/api-keys'

function formatDate(value: string | null): string {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusFor(key: WorkspaceApiKeyMetadata): {
  label: string
  className: string
} {
  if (key.revokedAt) {
    return {
      label: 'Revoked',
      className: 'bg-destructive/10 text-destructive',
    }
  }
  if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) {
    return {
      label: 'Expired',
      className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    }
  }
  return {
    label: 'Active',
    className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  }
}

export function WorkspaceApiKeysPanel() {
  const [keys, setKeys] = useState<WorkspaceApiKeyMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [keyToRevoke, setKeyToRevoke] =
    useState<WorkspaceApiKeyMetadata | null>(null)

  const activeCount = useMemo(
    () =>
      keys.filter(
        (key) =>
          !key.revokedAt &&
          (!key.expiresAt || new Date(key.expiresAt).getTime() > Date.now()),
      ).length,
    [keys],
  )

  async function loadKeys() {
    setLoading(true)
    try {
      setKeys(await listWorkspaceApiKeysFn())
    } catch (err) {
      gooeyToast.error('Could not load API keys', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadKeys()
  }, [])

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setCreating(true)
    try {
      const result = await createWorkspaceApiKeyFn({
        data: {
          name,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      })
      setNewApiKey(result.apiKey)
      setKeys((current) => [result.key, ...current])
      setName('')
      setExpiresAt('')
      gooeyToast.success('API key created')
    } catch (err) {
      gooeyToast.error('Could not create API key', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setCreating(false)
    }
  }

  async function handleCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      gooeyToast.success('Copied')
    } catch {
      gooeyToast.error('Could not copy API key')
    }
  }

  async function handleRevoke() {
    if (!keyToRevoke) return
    setRevokingId(keyToRevoke.id)
    try {
      await revokeWorkspaceApiKeyFn({ data: { id: keyToRevoke.id } })
      await loadKeys()
      setKeyToRevoke(null)
      gooeyToast.success('API key revoked')
    } catch (err) {
      gooeyToast.error('Could not revoke API key', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="m-0 flex items-center gap-2 text-base font-bold text-foreground">
            <KeyRound className="size-4 text-primary" />
            API keys
          </h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            Create workspace keys for read-only integrations and Swagger tests.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href="/api/docs" target="_blank" rel="noreferrer">
            <ExternalLink className="size-4" />
            API docs
          </a>
        </Button>
      </div>

      {newApiKey && (
        <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3">
          <p className="m-0 text-sm font-semibold text-foreground">
            Copy this key now. It will not be shown again.
          </p>
          <div className="mt-2 flex min-w-0 gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-background px-2 py-2 text-xs text-foreground">
              {newApiKey}
            </code>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void handleCopy(newApiKey)}
              aria-label="Copy API key"
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="mt-4 grid gap-3 lg:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-semibold text-foreground lg:col-span-2">
          Key name
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Production sync"
            maxLength={100}
            required
          />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-foreground">
          Expires at
          <Input
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </label>
        <div className="lg:col-span-3">
          <Button type="submit" disabled={creating || !name.trim()}>
            <Plus className="size-4" />
            {creating ? 'Creating...' : 'Create API key'}
          </Button>
        </div>
      </form>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="m-0 text-sm font-semibold text-foreground">
            Keys ({activeCount} active)
          </h3>
        </div>
        {loading ? (
          <p className="m-0 text-sm text-muted-foreground">Loading keys...</p>
        ) : keys.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">
            No API keys have been created for this workspace.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Key</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Last used</th>
                  <th className="px-3 py-2 font-semibold">Expires</th>
                  <th className="px-3 py-2 font-semibold">Created by</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => {
                  const status = statusFor(key)
                  const isRevoked = !!key.revokedAt
                  return (
                    <tr key={key.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium text-foreground">
                        {key.name}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <code>
                          {key.tokenPrefix}...{key.lastFour}
                        </code>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(key.lastUsedAt)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {key.expiresAt ? formatDate(key.expiresAt) : 'Never'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {key.createdByName ?? key.createdByEmail ?? 'Unknown'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-sm"
                          disabled={isRevoked || revokingId === key.id}
                          onClick={() => setKeyToRevoke(key)}
                          aria-label={`Revoke ${key.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!keyToRevoke} onOpenChange={() => setKeyToRevoke(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API key</DialogTitle>
            <DialogDescription>
              This immediately stops integrations using this key. Create a new
              key first if a connected system needs uninterrupted access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setKeyToRevoke(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!!revokingId}
              onClick={() => void handleRevoke()}
            >
              {revokingId ? 'Revoking...' : 'Revoke key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlugZap } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { ConfirmDialog } from '#/components/time-tracker/dashboard/ConfirmDialog'
import { toast } from '#/lib/toast'
import {
  disconnectAppFn,
  listConnectedAppsFn,
} from '#/lib/server/mcp-connections'
import { SectionCard } from '../shared/SectionCard'

const QUERY_KEY = ['mcp-connected-apps'] as const

function formatGrantedAt(value: string | null): string {
  if (!value) return 'Connected'
  return `Connected ${new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })}`
}

/**
 * Apps (MCP clients) the user allowed to read their tracked time. Hidden while
 * the MCP pilot is off. Disconnect deletes the app's tokens and consent.
 */
export function ConnectedAppsCard() {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState<{
    clientId: string
    name: string
  } | null>(null)

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listConnectedAppsFn(),
    staleTime: 30_000,
  })

  const disconnect = useMutation({
    mutationFn: (clientId: string) => disconnectAppFn({ data: { clientId } }),
    onSuccess: async () => {
      const name = confirming?.name ?? 'The app'
      setConfirming(null)
      toast.success(`${name} disconnected`, {
        description: 'It can no longer read your tracked time.',
      })
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: () => {
      toast.error('Could not disconnect', {
        description: 'Nothing changed. Please try again.',
      })
    },
  })

  if (query.isSuccess && !query.data.enabled) return null
  if (query.isPending) {
    return (
      <SectionCard title="Connected apps">
        <p className="m-0 mt-3 text-sm text-smoke">Loading connected apps…</p>
      </SectionCard>
    )
  }

  if (query.isError) {
    return (
      <SectionCard title="Connected apps">
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="m-0 text-sm text-smoke">
            Connected apps couldn’t be loaded.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </div>
      </SectionCard>
    )
  }

  const apps = query.data.apps

  return (
    <SectionCard title="Connected apps">
      <p className="m-0 mt-2 text-sm leading-6 text-smoke">
        Apps you allowed to read your tracked time. Signing out of Tickr doesn’t
        disconnect them.
      </p>

      {apps.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-warm-taupe p-4">
          <PlugZap className="size-5 shrink-0 text-smoke" aria-hidden />
          <p className="m-0 text-sm text-smoke">
            No apps are connected. When you connect an AI app to Tickr, it shows
            up here.
          </p>
        </div>
      ) : (
        <ul className="m-0 mt-4 grid list-none gap-2 p-0">
          {apps.map((app) => (
            <li
              key={app.clientId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone p-4"
            >
              <div className="min-w-0">
                <p className="m-0 truncate text-sm font-bold text-foreground">
                  {app.name}
                </p>
                <p className="m-0 text-xs text-smoke">
                  {formatGrantedAt(app.grantedAt)} · Read-only
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setConfirming({ clientId: app.clientId, name: app.name })
                }
              >
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !disconnect.isPending) setConfirming(null)
        }}
        title={`Disconnect ${confirming?.name ?? 'this app'}?`}
        description="It will stop being able to read your tracked time right away. Data it already received stays with that app. You can connect it again later."
        confirmLabel={disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
        variant="destructive"
        pending={disconnect.isPending}
        onConfirm={() => {
          if (confirming) disconnect.mutate(confirming.clientId)
        }}
      />
    </SectionCard>
  )
}

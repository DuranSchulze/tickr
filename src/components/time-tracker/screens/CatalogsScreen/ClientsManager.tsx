import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { Building2, CheckCircle2, Plus, Trash2, X } from 'lucide-react'
import {
  archiveClientFn,
  createClientFn,
  updateClientFn,
} from '#/lib/server/tracker'
import type { Client, TrackerState } from '#/lib/time-tracker/types'
import { IconBtn } from '../shared/IconBtn'
import { SectionCard } from '../shared/SectionCard'

type ClientStatus = Client['clientStatus']

export function ClientsManager({
  state,
  canManage,
}: {
  state: TrackerState
  canManage: boolean
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [status, setStatus] = useState<ClientStatus>('ACTIVE')
  const [pending, setPending] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await createClientFn({ data: { name, clientStatus: status } })
      await router.invalidate()
      gooeyToast.success('Client created')
      setName('')
      setStatus('ACTIVE')
      setShowForm(false)
    } catch (err) {
      gooeyToast.error('Could not create client', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  async function handleArchive(id: string, clientName: string) {
    setBusyId(id)
    try {
      await archiveClientFn({ data: { id } })
      await router.invalidate()
      gooeyToast.success(`"${clientName}" archived`)
    } catch (err) {
      gooeyToast.error('Could not archive client', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setBusyId(null)
    }
  }

  async function handleReactivate(client: Client) {
    setBusyId(client.id)
    try {
      await updateClientFn({
        data: { id: client.id, name: client.name, clientStatus: 'ACTIVE' },
      })
      await router.invalidate()
      gooeyToast.success(`"${client.name}" reactivated`)
    } catch (err) {
      gooeyToast.error('Could not reactivate client', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <SectionCard
      title="Clients"
      action={
        canManage ? (
          <button
            type="button"
            onClick={() => setShowForm((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:brightness-110"
          >
            {showForm ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {showForm ? 'Cancel' : 'New client'}
          </button>
        ) : undefined
      }
    >
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Client name"
            required
            className="h-9 rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
          />
          <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground">
            <input
              type="checkbox"
              checked={status === 'ACTIVE'}
              onChange={(e) =>
                setStatus(e.target.checked ? 'ACTIVE' : 'INACTIVE')
              }
            />
            Active
          </label>
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
          >
            {pending ? '…' : 'Add'}
          </button>
        </form>
      )}
      {state.clients.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No clients yet. Create one before adding projects.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {state.clients.map((c) => (
            <div
              key={c.id}
              className="group flex items-center gap-1.5 rounded-lg border border-border px-3 py-2"
            >
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">
                {c.name}
              </span>
              {c.clientStatus === 'INACTIVE' && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Inactive
                </span>
              )}
              {canManage && c.clientStatus === 'ACTIVE' && (
                <IconBtn
                  onClick={() => handleArchive(c.id, c.name)}
                  title="Archive client"
                  variant="danger"
                >
                  <Trash2
                    className={`h-3 w-3 opacity-0 group-hover:opacity-100 ${busyId === c.id ? 'opacity-100' : ''}`}
                  />
                </IconBtn>
              )}
              {canManage && c.clientStatus === 'INACTIVE' && (
                <IconBtn
                  onClick={() => handleReactivate(c)}
                  title="Reactivate client"
                >
                  <CheckCircle2
                    className={`h-3 w-3 opacity-0 group-hover:opacity-100 ${busyId === c.id ? 'opacity-100' : ''}`}
                  />
                </IconBtn>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

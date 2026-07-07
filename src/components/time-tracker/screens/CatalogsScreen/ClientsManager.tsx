import { useReducer } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from '#/lib/toast'
import {
  Building2,
  CheckCircle2,
  PauseCircle,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  archiveClientFn,
  createClientFn,
  suspendClientFn,
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
  const [local, dispatch] = useReducer(
    (
      s: {
        showForm: boolean
        name: string
        status: ClientStatus
        pending: boolean
        busyId: string | null
      },
      a: Partial<typeof s>,
    ) => ({ ...s, ...a }),
    {
      showForm: false,
      name: '',
      status: 'ACTIVE',
      pending: false,
      busyId: null,
    },
  )
  const { showForm, name, status, pending, busyId } = local

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    dispatch({ pending: true })
    try {
      await createClientFn({ data: { name, clientStatus: status } })
      await router.invalidate()
      gooeyToast.success('Client created')
      dispatch({ name: '', status: 'ACTIVE', showForm: false })
    } catch (err) {
      gooeyToast.error('Could not create client', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ pending: false })
    }
  }

  async function handleArchive(id: string, clientName: string) {
    dispatch({ busyId: id })
    try {
      await archiveClientFn({ data: { id } })
      await router.invalidate()
      gooeyToast.success(`"${clientName}" archived`)
    } catch (err) {
      gooeyToast.error('Could not archive client', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ busyId: null })
    }
  }

  async function handleSuspend(id: string, clientName: string) {
    dispatch({ busyId: id })
    try {
      await suspendClientFn({ data: { id } })
      await router.invalidate()
      gooeyToast.success(`"${clientName}" suspended`)
    } catch (err) {
      gooeyToast.error('Could not suspend client', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ busyId: null })
    }
  }

  async function handleReactivate(client: Client) {
    dispatch({ busyId: client.id })
    try {
      await updateClientFn({
        data: {
          id: client.id,
          name: client.name,
          clientStatus: 'ACTIVE',
          defaultBillableRate: client.defaultBillableRate,
        },
      })
      await router.invalidate()
      gooeyToast.success(`"${client.name}" reactivated`)
    } catch (err) {
      gooeyToast.error('Could not reactivate client', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ busyId: null })
    }
  }

  return (
    <SectionCard
      title="Clients"
      action={
        canManage ? (
          <button
            type="button"
            onClick={() => dispatch({ showForm: !showForm })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:brightness-110"
          >
            {showForm ? (
              <X className="size-3.5" />
            ) : (
              <Plus className="size-3.5" />
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
            onChange={(e) => dispatch({ name: e.target.value })}
            placeholder="Client name"
            aria-label="Client name"
            required
            className="h-9 rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
          />
          <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground">
            <span className="sr-only">Client status</span>
            <select
              value={status}
              onChange={(e) =>
                dispatch({ status: e.target.value as ClientStatus })
              }
              className="h-8 bg-transparent text-xs font-semibold outline-none"
            >
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="INACTIVE">Inactive</option>
            </select>
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
              <Building2 className="size-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">
                {c.name}
              </span>
              {c.clientStatus === 'INACTIVE' && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Inactive
                </span>
              )}
              {c.clientStatus === 'SUSPENDED' && (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                  Suspended
                </span>
              )}
              {canManage && c.clientStatus === 'ACTIVE' && (
                <>
                  <IconBtn
                    onClick={() => handleSuspend(c.id, c.name)}
                    title="Suspend client"
                  >
                    <PauseCircle
                      className={`size-3 opacity-0 group-hover:opacity-100 ${busyId === c.id ? 'opacity-100' : ''}`}
                    />
                  </IconBtn>
                  <IconBtn
                    onClick={() => handleArchive(c.id, c.name)}
                    title="Archive client"
                    variant="danger"
                  >
                    <Trash2
                      className={`size-3 opacity-0 group-hover:opacity-100 ${busyId === c.id ? 'opacity-100' : ''}`}
                    />
                  </IconBtn>
                </>
              )}
              {canManage && c.clientStatus === 'SUSPENDED' && (
                <>
                  <IconBtn
                    onClick={() => handleReactivate(c)}
                    title="Reactivate client"
                  >
                    <CheckCircle2
                      className={`size-3 opacity-0 group-hover:opacity-100 ${busyId === c.id ? 'opacity-100' : ''}`}
                    />
                  </IconBtn>
                  <IconBtn
                    onClick={() => handleArchive(c.id, c.name)}
                    title="Archive client"
                    variant="danger"
                  >
                    <Trash2
                      className={`size-3 opacity-0 group-hover:opacity-100 ${busyId === c.id ? 'opacity-100' : ''}`}
                    />
                  </IconBtn>
                </>
              )}
              {canManage && c.clientStatus === 'INACTIVE' && (
                <IconBtn
                  onClick={() => handleReactivate(c)}
                  title="Reactivate client"
                >
                  <CheckCircle2
                    className={`size-3 opacity-0 group-hover:opacity-100 ${busyId === c.id ? 'opacity-100' : ''}`}
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

import { useReducer } from 'react'
import type { FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { createClientFn, createProjectFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import {
  BulkNamesInput,
  ClientSelect,
  ColorInput,
  FormTitle,
  inputClass,
  ModeToggle,
  SubmitButton,
} from './CatalogFormParts'
import { parseBulkNames, runBulk } from './catalog-form.utils'

type ProjectFormState = {
  mode: 'single' | 'bulk'
  name: string
  bulkNames: string
  color: string
  clientId: string
  pending: boolean
  addingClient: boolean
  newClientName: string
  newClientPending: boolean
  pendingSelectName: string | null
}

export function ProjectForm({
  clients,
  onSuccess,
}: {
  clients: TrackerState['clients']
  onSuccess?: () => void
}) {
  const router = useRouter()
  const activeClients = clients.filter((c) => c.clientStatus === 'ACTIVE')
  const [state, dispatch] = useReducer(
    (s: ProjectFormState, a: Partial<ProjectFormState>) => ({ ...s, ...a }),
    {
      mode: 'single' as const,
      name: '',
      bulkNames: '',
      color: '#2563eb',
      clientId: activeClients[0]?.id ?? '',
      pending: false,
      addingClient: false,
      newClientName: '',
      newClientPending: false,
      pendingSelectName: null,
    },
  )
  const {
    mode,
    name,
    bulkNames,
    color,
    clientId,
    pending,
    addingClient,
    newClientName,
    newClientPending,
    pendingSelectName,
  } = state

  // Auto-select new client after creation — derive match instead of setState in effect
  const resolvedClientId = (() => {
    if (!pendingSelectName) return clientId
    const match = activeClients.find(
      (c) => c.name.toLowerCase() === pendingSelectName.toLowerCase(),
    )
    if (match && match.id !== clientId) {
      // Queue a render-phase update to clear pendingSelectName
      queueMicrotask(() => dispatch({ pendingSelectName: null }))
      return match.id
    }
    return clientId
  })()

  async function handleCreateClient() {
    if (!newClientName.trim()) return
    dispatch({ newClientPending: true })
    try {
      await createClientFn({
        data: { name: newClientName, clientStatus: 'ACTIVE' },
      })
      await router.invalidate()
      dispatch({
        pendingSelectName: newClientName.trim(),
        newClientName: '',
        addingClient: false,
      })
    } catch (err) {
      gooeyToast.error('Could not create client', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ newClientPending: false })
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!resolvedClientId) {
      gooeyToast.error('Choose a client first')
      return
    }
    dispatch({ pending: true })
    try {
      if (mode === 'single') {
        await createProjectFn({
          data: { name, color, clientId: resolvedClientId },
        })
        await router.invalidate()
        gooeyToast.success('Project created')
        dispatch({ name: '', color: '#2563eb' })
        onSuccess?.()
      } else {
        const names = parseBulkNames(bulkNames)
        await runBulk(
          names,
          (n) =>
            createProjectFn({
              data: { name: n, color, clientId: resolvedClientId },
            }),
          'project',
          router,
          onSuccess,
        )
        dispatch({ bulkNames: '' })
      }
    } catch (err) {
      gooeyToast.error('Could not create project', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ pending: false })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <FormTitle
        title={mode === 'single' ? 'Create project' : 'Bulk create projects'}
      />
      <ModeToggle mode={mode} onChange={(m) => dispatch({ mode: m })} />

      {activeClients.length === 0 && !addingClient ? (
        <p className="text-sm text-muted-foreground">
          No clients yet.{' '}
          <button
            type="button"
            onClick={() => dispatch({ addingClient: true })}
            className="font-semibold text-primary hover:underline"
          >
            Create one first.
          </button>
        </p>
      ) : (
        <>
          {activeClients.length > 0 && (
            <ClientSelect
              clients={activeClients}
              value={resolvedClientId}
              onChange={(id) => dispatch({ clientId: id })}
            />
          )}
          {addingClient ? (
            <div className="flex gap-2">
              <input
                value={newClientName}
                onChange={(e) => dispatch({ newClientName: e.target.value })}
                placeholder="New client name"
                aria-label="New client name"
                required
                className={`${inputClass} flex-1`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleCreateClient()
                  }
                  if (e.key === 'Escape') {
                    dispatch({ addingClient: false, newClientName: '' })
                  }
                }}
              />
              <button
                type="button"
                disabled={newClientPending}
                onClick={() => void handleCreateClient()}
                className="h-10 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {newClientPending ? '…' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() =>
                  dispatch({ addingClient: false, newClientName: '' })
                }
                className="h-10 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => dispatch({ addingClient: true })}
              className="flex items-center gap-1.5 self-start text-xs font-semibold text-primary hover:underline"
            >
              <Plus className="size-3" />
              New client
            </button>
          )}
        </>
      )}

      {mode === 'single' ? (
        <input
          value={name}
          onChange={(event) => dispatch({ name: event.target.value })}
          placeholder="Project name"
          aria-label="Project name"
          required
          className={inputClass}
          disabled={!resolvedClientId}
        />
      ) : (
        <BulkNamesInput
          value={bulkNames}
          onChange={(v) => dispatch({ bulkNames: v })}
        />
      )}
      <ColorInput value={color} onChange={(c) => dispatch({ color: c })} />
      <SubmitButton
        pending={pending}
        label={mode === 'single' ? 'Create project' : 'Create projects'}
      />
    </form>
  )
}

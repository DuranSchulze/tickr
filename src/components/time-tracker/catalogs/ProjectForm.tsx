import { useEffect, useState } from 'react'
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

export function ProjectForm({
  clients,
  onSuccess,
}: {
  clients: TrackerState['clients']
  onSuccess?: () => void
}) {
  const router = useRouter()
  const activeClients = clients.filter((c) => c.clientStatus === 'ACTIVE')
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [name, setName] = useState('')
  const [bulkNames, setBulkNames] = useState('')
  const [color, setColor] = useState('#2563eb')
  const [clientId, setClientId] = useState(activeClients[0]?.id ?? '')
  const [pending, setPending] = useState(false)

  const [addingClient, setAddingClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientPending, setNewClientPending] = useState(false)
  const [pendingSelectName, setPendingSelectName] = useState<string | null>(
    null,
  )

  // Auto-select client after inline creation once clients prop refreshes
  useEffect(() => {
    if (!pendingSelectName) return
    const match = activeClients.find(
      (c) => c.name.toLowerCase() === pendingSelectName.toLowerCase(),
    )
    if (match) {
      setClientId(match.id)
      setPendingSelectName(null)
    }
  }, [clients])

  async function handleCreateClient() {
    if (!newClientName.trim()) return
    setNewClientPending(true)
    try {
      await createClientFn({
        data: { name: newClientName, clientStatus: 'ACTIVE' },
      })
      await router.invalidate()
      setPendingSelectName(newClientName.trim())
      setNewClientName('')
      setAddingClient(false)
    } catch (err) {
      gooeyToast.error('Could not create client', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setNewClientPending(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!clientId) {
      gooeyToast.error('Choose a client first')
      return
    }
    setPending(true)
    try {
      if (mode === 'single') {
        await createProjectFn({ data: { name, color, clientId } })
        await router.invalidate()
        gooeyToast.success('Project created')
        setName('')
        setColor('#2563eb')
        onSuccess?.()
      } else {
        const names = parseBulkNames(bulkNames)
        await runBulk(
          names,
          (n) => createProjectFn({ data: { name: n, color, clientId } }),
          'project',
          router,
          onSuccess,
        )
        setBulkNames('')
      }
    } catch (err) {
      gooeyToast.error('Could not create project', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <FormTitle
        title={mode === 'single' ? 'Create project' : 'Bulk create projects'}
      />
      <ModeToggle mode={mode} onChange={setMode} />

      {activeClients.length === 0 && !addingClient ? (
        <p className="text-sm text-muted-foreground">
          No clients yet.{' '}
          <button
            type="button"
            onClick={() => setAddingClient(true)}
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
              value={clientId}
              onChange={setClientId}
            />
          )}
          {addingClient ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="New client name"
                required
                className={`${inputClass} flex-1`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleCreateClient()
                  }
                  if (e.key === 'Escape') {
                    setAddingClient(false)
                    setNewClientName('')
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
                onClick={() => {
                  setAddingClient(false)
                  setNewClientName('')
                }}
                className="h-10 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingClient(true)}
              className="flex items-center gap-1.5 self-start text-xs font-semibold text-primary hover:underline"
            >
              <Plus className="h-3 w-3" />
              New client
            </button>
          )}
        </>
      )}

      {mode === 'single' ? (
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Project name"
          required
          className={inputClass}
          disabled={!clientId}
        />
      ) : (
        <BulkNamesInput value={bulkNames} onChange={setBulkNames} />
      )}
      <ColorInput value={color} onChange={setColor} />
      <SubmitButton
        pending={pending}
        label={mode === 'single' ? 'Create project' : 'Create projects'}
      />
    </form>
  )
}

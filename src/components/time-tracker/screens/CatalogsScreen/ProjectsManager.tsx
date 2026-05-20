import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { Plus, Trash2, X } from 'lucide-react'
import { archiveProjectFn, createProjectFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import { IconBtn } from '../shared/IconBtn'
import { SectionCard } from '../shared/SectionCard'

export function ProjectsManager({
  state,
  canManage,
}: {
  state: TrackerState
  canManage: boolean
}) {
  const router = useRouter()
  const activeClients = state.clients.filter((c) => c.clientStatus === 'ACTIVE')
  const clientNameById = new Map(state.clients.map((c) => [c.id, c.name]))
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#2563eb')
  const [clientId, setClientId] = useState(activeClients[0]?.id ?? '')
  const [pending, setPending] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    if (!clientId) {
      gooeyToast.error('Choose a client first')
      return
    }
    setPending(true)
    try {
      await createProjectFn({ data: { name, color, clientId } })
      await router.invalidate()
      gooeyToast.success('Project created')
      setName('')
      setColor('#2563eb')
      setShowForm(false)
    } catch (err) {
      gooeyToast.error('Could not create project', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  async function handleArchive(id: string, projectName: string) {
    setArchivingId(id)
    try {
      await archiveProjectFn({ data: { id } })
      await router.invalidate()
      gooeyToast.success(`"${projectName}" archived`)
    } catch (err) {
      gooeyToast.error('Could not archive project', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setArchivingId(null)
    }
  }

  return (
    <SectionCard
      title="Projects"
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
            {showForm ? 'Cancel' : 'New project'}
          </button>
        ) : undefined
      }
    >
      {showForm &&
        (activeClients.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Create a client first before adding a project.
          </p>
        ) : (
          <form
            onSubmit={handleCreate}
            className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]"
          >
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className="h-9 rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
            >
              {activeClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              required
              className="h-9 rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-lg border border-border p-1"
              title="Project color"
            />
            <button
              type="submit"
              disabled={pending}
              className="h-9 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
            >
              {pending ? '…' : 'Add'}
            </button>
          </form>
        ))}
      <div className="mt-4 flex flex-wrap gap-2">
        {state.projects.map((p) => (
          <div
            key={p.id}
            className="group flex items-center gap-1.5 rounded-lg border border-border px-3 py-2"
          >
            <span
              className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">
                {p.name}
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">
                {clientNameById.get(p.clientId) ?? 'No client'}
              </span>
            </div>
            {canManage && (
              <IconBtn
                onClick={() => handleArchive(p.id, p.name)}
                title="Archive project"
                variant="danger"
              >
                <Trash2
                  className={`h-3 w-3 opacity-0 group-hover:opacity-100 ${archivingId === p.id ? 'opacity-100' : ''}`}
                />
              </IconBtn>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

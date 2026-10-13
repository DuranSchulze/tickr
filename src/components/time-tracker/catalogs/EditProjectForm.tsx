import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from '#/lib/toast'
import { updateProjectFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import {
  CancelButton,
  catalogFormActionsClass,
  catalogFormClass,
  ClientSelect,
  ColorInput,
  inputClass,
  SubmitButton,
} from './CatalogFormParts'
import { useTaskSyncPublisher } from '../TaskSyncCoordinator'

export function EditProjectForm({
  project,
  clients,
  fixedClient,
  onSaved,
  onDone,
}: {
  project: TrackerState['projects'][number]
  clients: TrackerState['clients']
  fixedClient?: { id: string; name: string }
  onSaved?: () => void | Promise<void>
  onDone: () => void
}) {
  const router = useRouter()
  const publishTaskChange = useTaskSyncPublisher()
  const [name, setName] = useState(project.name)
  const [color, setColor] = useState(project.color)
  const [clientId, setClientId] = useState(project.clientId)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await updateProjectFn({ data: { id: project.id, name, color, clientId } })
      await router.invalidate()
      publishTaskChange()
      gooeyToast.success('Project updated')
      await onSaved?.()
      onDone()
    } catch (err) {
      gooeyToast.error('Could not update project', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={catalogFormClass}>
      {fixedClient ? (
        <p className="m-0 text-sm text-smoke">
          Client:{' '}
          <span className="font-semibold text-foreground">
            {fixedClient.name}
          </span>
        </p>
      ) : (
        <ClientSelect
          clients={clients}
          value={clientId}
          onChange={(id) => setClientId(id)}
        />
      )}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        aria-label="Project name"
        required
        className={inputClass}
      />
      <ColorInput value={color} onChange={setColor} />
      <div className={catalogFormActionsClass}>
        <SubmitButton
          pending={pending}
          label="Save changes"
          pendingLabel="Saving..."
        />
        <CancelButton onClick={onDone} />
      </div>
    </form>
  )
}

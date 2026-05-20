import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { updateProjectFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import {
  CancelButton,
  ClientSelect,
  ColorInput,
  inputClass,
  SubmitButton,
} from './CatalogFormParts'

export function EditProjectForm({
  project,
  clients,
  onDone,
}: {
  project: TrackerState['projects'][number]
  clients: TrackerState['clients']
  onDone: () => void
}) {
  const router = useRouter()
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
      gooeyToast.success('Project updated')
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
    <form onSubmit={handleSubmit} className="grid gap-3">
      <ClientSelect
        clients={clients}
        value={clientId}
        onChange={(id) => setClientId(id)}
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        required
        className={inputClass}
      />
      <ColorInput value={color} onChange={setColor} />
      <div className="flex gap-2">
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

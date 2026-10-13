import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { updateTaskFn } from '#/lib/server/tracker'
import { createCatalogProjectTaskFn } from '#/lib/server/tracker/catalogs/project-detail'
import { gooeyToast } from '#/lib/toast'
import { useTaskSyncPublisher } from '../TaskSyncCoordinator'
import {
  CancelButton,
  catalogFormActionsClass,
  catalogFormClass,
  inputClass,
  SubmitButton,
} from './CatalogFormParts'

export function ProjectTaskForm({
  project,
  task,
  onSaved,
  onCancel,
}: {
  project: { id: string; name: string }
  task?: { id: string; name: string }
  onSaved: () => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(task?.name ?? '')
  const [pending, setPending] = useState(false)
  const router = useRouter()
  const publishTaskChange = useTaskSyncPublisher()
  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      if (task) await updateTaskFn({ data: { id: task.id, name } })
      else
        await createCatalogProjectTaskFn({
          data: { projectId: project.id, name },
        })
      await router.invalidate()
      publishTaskChange()
      await onSaved()
      gooeyToast.success(task ? 'Task updated' : 'Task created')
    } catch (error) {
      gooeyToast.error('Could not save task', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }
  return (
    <form onSubmit={submit} className={catalogFormClass}>
      <p className="m-0 text-sm text-smoke">
        Project:{' '}
        <span className="font-semibold text-foreground">{project.name}</span>
      </p>
      <input
        aria-label="Task name"
        placeholder="Task name"
        className={inputClass}
        required
        maxLength={200}
        value={name}
        disabled={pending}
        onChange={(event) => setName(event.target.value)}
      />
      <div className={catalogFormActionsClass}>
        <SubmitButton
          pending={pending}
          label={task ? 'Save changes' : 'Create task'}
        />
        <CancelButton onClick={onCancel} />
      </div>
    </form>
  )
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from '#/lib/toast'
import { updateDepartmentFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import {
  CancelButton,
  catalogFormActionsClass,
  catalogFormClass,
  ColorInput,
  inputClass,
  SubmitButton,
} from './CatalogFormParts'

export function EditDepartmentForm({
  department,
  onDone,
}: {
  department: TrackerState['departments'][number]
  onDone: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(department.name)
  const [description, setDescription] = useState(department.description)
  const [color, setColor] = useState(department.color)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await updateDepartmentFn({
        data: {
          id: department.id,
          name,
          description: description || undefined,
          color,
        },
      })
      await router.invalidate()
      gooeyToast.success('Department updated')
      onDone()
    } catch (err) {
      gooeyToast.error('Could not update department', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={catalogFormClass}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Department name"
        aria-label="Department name"
        required
        className={inputClass}
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        aria-label="Description"
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

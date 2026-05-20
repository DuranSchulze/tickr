import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { updateCohortFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import { CancelButton, inputClass, SubmitButton } from './CatalogFormParts'

export function EditCohortForm({
  cohort,
  departments,
  onDone,
}: {
  cohort: TrackerState['cohorts'][number]
  departments: TrackerState['departments']
  onDone: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(cohort.name)
  const [departmentId, setDepartmentId] = useState(cohort.departmentId)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await updateCohortFn({ data: { id: cohort.id, name, departmentId } })
      await router.invalidate()
      gooeyToast.success('Cohort updated')
      onDone()
    } catch (err) {
      gooeyToast.error('Could not update cohort', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <select
        value={departmentId}
        onChange={(e) => setDepartmentId(e.target.value)}
        required
        className={inputClass}
      >
        <option value="">Choose department</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Cohort name"
        required
        className={inputClass}
      />
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

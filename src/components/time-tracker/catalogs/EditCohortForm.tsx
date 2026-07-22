import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from '#/lib/toast'
import { updateCohortFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import { Combobox } from '#/components/ui/combobox'
import {
  CancelButton,
  catalogFormActionsClass,
  catalogFormClass,
  inputClass,
  SubmitButton,
} from './CatalogFormParts'

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
    <form onSubmit={handleSubmit} className={catalogFormClass}>
      <Combobox
        options={departments.map((department) => ({
          value: department.id,
          label: department.name,
        }))}
        value={departmentId}
        onValueChange={setDepartmentId}
        placeholder="Choose a department"
        searchPlaceholder="Search departments…"
        emptyText="No departments match."
        className="h-11 rounded-lg bg-background"
        contentClassName="z-[60]"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Cohort name"
        aria-label="Cohort name"
        required
        className={inputClass}
      />
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

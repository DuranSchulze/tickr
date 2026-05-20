import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { createCohortFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import {
  BulkNamesInput,
  FormTitle,
  inputClass,
  ModeToggle,
  SubmitButton,
} from './CatalogFormParts'
import { parseBulkNames, runBulk } from './catalog-form.utils'

export function CohortForm({
  departments,
  onSuccess,
}: {
  departments: TrackerState['departments']
  onSuccess?: () => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [name, setName] = useState('')
  const [bulkNames, setBulkNames] = useState('')
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? '')
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!departmentId) {
      gooeyToast.error('Select a department first')
      return
    }
    setPending(true)
    try {
      if (mode === 'single') {
        await createCohortFn({ data: { name, departmentId } })
        await router.invalidate()
        gooeyToast.success('Cohort created')
        setName('')
        onSuccess?.()
      } else {
        const names = parseBulkNames(bulkNames)
        await runBulk(
          names,
          (n) => createCohortFn({ data: { name: n, departmentId } }),
          'cohort',
          router,
          onSuccess,
        )
        setBulkNames('')
      }
    } catch (err) {
      gooeyToast.error('Could not create cohort', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <FormTitle
        title={
          mode === 'single' ? 'Create group / cohort' : 'Bulk create cohorts'
        }
      />
      <ModeToggle mode={mode} onChange={setMode} />
      <select
        value={departmentId}
        onChange={(event) => setDepartmentId(event.target.value)}
        required
        className={inputClass}
      >
        <option value="">Choose department</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </select>
      {mode === 'single' ? (
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Group or cohort name"
          required
          className={inputClass}
        />
      ) : (
        <BulkNamesInput value={bulkNames} onChange={setBulkNames} />
      )}
      <SubmitButton
        pending={pending}
        label={mode === 'single' ? 'Create cohort' : 'Create cohorts'}
      />
    </form>
  )
}

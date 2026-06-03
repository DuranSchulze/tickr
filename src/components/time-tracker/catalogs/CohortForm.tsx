import { useReducer } from 'react'
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

type CohortFormState = {
  mode: 'single' | 'bulk'
  name: string
  bulkNames: string
  departmentId: string
  pending: boolean
}

export function CohortForm({
  departments,
  onSuccess,
}: {
  departments: TrackerState['departments']
  onSuccess?: () => void
}) {
  const router = useRouter()
  const [state, dispatch] = useReducer(
    (s: CohortFormState, a: Partial<CohortFormState>) => ({ ...s, ...a }),
    {
      mode: 'single' as const,
      name: '',
      bulkNames: '',
      departmentId: departments[0]?.id ?? '',
      pending: false,
    },
  )
  const { mode, name, bulkNames, departmentId, pending } = state

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!departmentId) {
      gooeyToast.error('Select a department first')
      return
    }
    dispatch({ pending: true })
    try {
      if (mode === 'single') {
        await createCohortFn({ data: { name, departmentId } })
        await router.invalidate()
        gooeyToast.success('Cohort created')
        dispatch({ name: '' })
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
        dispatch({ bulkNames: '' })
      }
    } catch (err) {
      gooeyToast.error('Could not create cohort', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ pending: false })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <FormTitle
        title={
          mode === 'single' ? 'Create group / cohort' : 'Bulk create cohorts'
        }
      />
      <ModeToggle mode={mode} onChange={(m) => dispatch({ mode: m })} />
      <select
        value={departmentId}
        onChange={(event) => dispatch({ departmentId: event.target.value })}
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
          onChange={(event) => dispatch({ name: event.target.value })}
          placeholder="Group or cohort name"
          aria-label="Group or cohort name"
          required
          className={inputClass}
        />
      ) : (
        <BulkNamesInput
          value={bulkNames}
          onChange={(v) => dispatch({ bulkNames: v })}
        />
      )}
      <SubmitButton
        pending={pending}
        label={mode === 'single' ? 'Create cohort' : 'Create cohorts'}
      />
    </form>
  )
}

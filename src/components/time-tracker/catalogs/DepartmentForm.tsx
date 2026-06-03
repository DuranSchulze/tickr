import { useReducer } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { createDepartmentFn } from '#/lib/server/tracker'
import {
  BulkNamesInput,
  ColorInput,
  FormTitle,
  inputClass,
  ModeToggle,
  SubmitButton,
} from './CatalogFormParts'
import { parseBulkNames, runBulk } from './catalog-form.utils'

type DepartmentFormState = {
  mode: 'single' | 'bulk'
  name: string
  bulkNames: string
  description: string
  color: string
  pending: boolean
}

const initialDepartmentFormState: DepartmentFormState = {
  mode: 'single',
  name: '',
  bulkNames: '',
  description: '',
  color: '#6366f1',
  pending: false,
}

export function DepartmentForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter()
  const [state, dispatch] = useReducer(
    (s: DepartmentFormState, a: Partial<DepartmentFormState>) => ({
      ...s,
      ...a,
    }),
    initialDepartmentFormState,
  )
  const { mode, name, bulkNames, description, color, pending } = state

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    dispatch({ pending: true })
    try {
      if (mode === 'single') {
        await createDepartmentFn({
          data: { name, description: description || undefined, color },
        })
        await router.invalidate()
        gooeyToast.success('Department created')
        dispatch({ name: '', description: '', color: '#6366f1' })
        onSuccess?.()
      } else {
        const names = parseBulkNames(bulkNames)
        await runBulk(
          names,
          (n) => createDepartmentFn({ data: { name: n, color } }),
          'department',
          router,
          onSuccess,
        )
        dispatch({ bulkNames: '' })
      }
    } catch (err) {
      gooeyToast.error('Could not create department', {
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
          mode === 'single' ? 'Create department' : 'Bulk create departments'
        }
      />
      <ModeToggle mode={mode} onChange={(m) => dispatch({ mode: m })} />
      {mode === 'single' ? (
        <>
          <input
            value={name}
            onChange={(event) => dispatch({ name: event.target.value })}
            placeholder="Department name"
            aria-label="Department name"
            required
            className={inputClass}
          />
          <input
            value={description}
            onChange={(event) => dispatch({ description: event.target.value })}
            placeholder="Description"
            aria-label="Description"
            className={inputClass}
          />
        </>
      ) : (
        <BulkNamesInput
          value={bulkNames}
          onChange={(v) => dispatch({ bulkNames: v })}
        />
      )}
      <ColorInput value={color} onChange={(c) => dispatch({ color: c })} />
      <SubmitButton
        pending={pending}
        label={mode === 'single' ? 'Create department' : 'Create departments'}
      />
    </form>
  )
}

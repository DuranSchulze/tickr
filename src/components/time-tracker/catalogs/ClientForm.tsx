import { useReducer } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from '#/lib/toast'
import { createClientFn } from '#/lib/server/tracker'
import {
  BulkNamesInput,
  FormTitle,
  inputClass,
  ModeToggle,
  SubmitButton,
} from './CatalogFormParts'
import { parseBulkNames, runBulk } from './catalog-form.utils'

type ClientFormState = {
  mode: 'single' | 'bulk'
  name: string
  bulkNames: string
  active: boolean
  pending: boolean
}

const initialClientFormState: ClientFormState = {
  mode: 'single',
  name: '',
  bulkNames: '',
  active: true,
  pending: false,
}

function clientFormReducer(
  state: ClientFormState,
  action: Partial<ClientFormState>,
): ClientFormState {
  return { ...state, ...action }
}

export function ClientForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter()
  const [state, dispatch] = useReducer(
    clientFormReducer,
    initialClientFormState,
  )
  const { mode, name, bulkNames, active, pending } = state

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    dispatch({ pending: true })
    try {
      const status = active ? 'ACTIVE' : 'INACTIVE'
      if (mode === 'single') {
        await createClientFn({ data: { name, clientStatus: status } })
        await router.invalidate()
        gooeyToast.success('Client created')
        dispatch({ name: '', active: true })
        onSuccess?.()
      } else {
        const names = parseBulkNames(bulkNames)
        await runBulk(
          names,
          (n) => createClientFn({ data: { name: n, clientStatus: status } }),
          'client',
          router,
          onSuccess,
        )
        dispatch({ bulkNames: '' })
      }
    } catch (err) {
      gooeyToast.error('Could not create client', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ pending: false })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <FormTitle
        title={mode === 'single' ? 'Create client' : 'Bulk create clients'}
      />
      <ModeToggle mode={mode} onChange={(m) => dispatch({ mode: m })} />
      {mode === 'single' ? (
        <input
          value={name}
          onChange={(event) => dispatch({ name: event.target.value })}
          placeholder="Client name"
          aria-label="Client name"
          required
          className={inputClass}
        />
      ) : (
        <BulkNamesInput
          value={bulkNames}
          onChange={(v) => dispatch({ bulkNames: v })}
        />
      )}
      <label className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => dispatch({ active: event.target.checked })}
        />
        Active (visible in timer)
      </label>
      <SubmitButton
        pending={pending}
        label={mode === 'single' ? 'Create client' : 'Create clients'}
      />
    </form>
  )
}

import { useReducer } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from '#/lib/toast'
import { createClientFn } from '#/lib/server/tracker'
import type { ClientStatus } from '#/db/schema'
import {
  BulkNamesInput,
  catalogFormClass,
  FormTitle,
  inputClass,
  ModeToggle,
  SubmitButton,
} from './CatalogFormParts'
import { parseBulkNames, runBulk } from './catalog-form.utils'
import { useTaskSyncPublisher } from '../TaskSyncCoordinator'

type ClientFormState = {
  mode: 'single' | 'bulk'
  name: string
  defaultBillableRate: string
  bulkNames: string
  status: ClientStatus
  pending: boolean
}

const initialClientFormState: ClientFormState = {
  mode: 'single',
  name: '',
  defaultBillableRate: '',
  bulkNames: '',
  status: 'ACTIVE',
  pending: false,
}

function clientFormReducer(
  state: ClientFormState,
  action: Partial<ClientFormState>,
): ClientFormState {
  return { ...state, ...action }
}

export function ClientForm({
  currency,
  onSuccess,
}: {
  currency: string
  onSuccess?: () => void
}) {
  const router = useRouter()
  const publishTaskChange = useTaskSyncPublisher()
  const [state, dispatch] = useReducer(
    clientFormReducer,
    initialClientFormState,
  )
  const { mode, name, defaultBillableRate, bulkNames, status, pending } = state

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const rateInput = defaultBillableRate.trim()
    const parsedRate = rateInput === '' ? null : Number(rateInput)
    if (
      parsedRate != null &&
      (!Number.isFinite(parsedRate) || parsedRate < 0)
    ) {
      gooeyToast.error('Enter a valid default billable rate')
      return
    }
    dispatch({ pending: true })
    try {
      if (mode === 'single') {
        await createClientFn({
          data: {
            name,
            clientStatus: status,
            defaultBillableRate: parsedRate,
          },
        })
        await router.invalidate()
        gooeyToast.success('Client created')
        dispatch({ name: '', defaultBillableRate: '', status: 'ACTIVE' })
        publishTaskChange()
        onSuccess?.()
      } else {
        const names = parseBulkNames(bulkNames)
        await runBulk(
          names,
          (n) => createClientFn({ data: { name: n, clientStatus: status } }),
          'client',
          router,
          () => {
            publishTaskChange()
            onSuccess?.()
          },
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
    <form onSubmit={handleSubmit} className={catalogFormClass}>
      <FormTitle
        title={mode === 'single' ? 'Create client' : 'Bulk create clients'}
      />
      <ModeToggle mode={mode} onChange={(m) => dispatch({ mode: m })} />
      {mode === 'single' ? (
        <>
          <input
            value={name}
            onChange={(event) => dispatch({ name: event.target.value })}
            placeholder="Client name"
            aria-label="Client name"
            required
            className={inputClass}
          />
          <input
            value={defaultBillableRate}
            onChange={(event) =>
              dispatch({ defaultBillableRate: event.target.value })
            }
            placeholder={`Default billable rate (${currency})`}
            aria-label="Default billable rate"
            inputMode="decimal"
            min="0"
            step="0.01"
            type="number"
            className={inputClass}
          />
        </>
      ) : (
        <BulkNamesInput
          value={bulkNames}
          onChange={(v) => dispatch({ bulkNames: v })}
        />
      )}
      <label className="grid gap-1.5 text-sm font-semibold text-foreground">
        Status
        <select
          value={status}
          onChange={(event) =>
            dispatch({ status: event.target.value as ClientStatus })
          }
          className={inputClass}
        >
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </label>
      <SubmitButton
        pending={pending}
        label={mode === 'single' ? 'Create client' : 'Create clients'}
      />
    </form>
  )
}

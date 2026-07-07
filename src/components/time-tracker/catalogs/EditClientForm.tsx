import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from '#/lib/toast'
import { updateClientFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import type { ClientStatus } from '#/db/schema'
import { CancelButton, inputClass, SubmitButton } from './CatalogFormParts'

export function EditClientForm({
  client,
  currency,
  onDone,
}: {
  client: TrackerState['clients'][number]
  currency: string
  onDone: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(client.name)
  const [defaultBillableRate, setDefaultBillableRate] = useState(
    client.defaultBillableRate == null
      ? ''
      : String(client.defaultBillableRate),
  )
  const [status, setStatus] = useState<ClientStatus>(client.clientStatus)
  const [pending, setPending] = useState(false)

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
    setPending(true)
    try {
      await updateClientFn({
        data: {
          id: client.id,
          name,
          clientStatus: status,
          defaultBillableRate: parsedRate,
        },
      })
      await router.invalidate()
      gooeyToast.success('Client updated')
      onDone()
    } catch (err) {
      gooeyToast.error('Could not update client', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Client name"
        aria-label="Client name"
        required
        className={inputClass}
      />
      <input
        value={defaultBillableRate}
        onChange={(e) => setDefaultBillableRate(e.target.value)}
        placeholder={`Default billable rate (${currency})`}
        aria-label="Default billable rate"
        inputMode="decimal"
        min="0"
        step="0.01"
        type="number"
        className={inputClass}
      />
      <label className="grid gap-1.5 text-sm font-semibold text-foreground">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ClientStatus)}
          className={inputClass}
        >
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </label>
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

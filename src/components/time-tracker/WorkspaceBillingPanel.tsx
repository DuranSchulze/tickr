import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  getCurrencyOptionsFn,
  updateWorkspaceBillingFn,
} from '#/lib/server/tracker'
import { normalizeCurrency } from '#/lib/time-tracker/billing'
import type { TrackerState } from '#/lib/time-tracker/types'

type CurrencyOption = {
  code: string
  name: string
}

export function WorkspaceBillingPanel({
  workspace,
}: {
  workspace: TrackerState['workspace']
}) {
  const router = useRouter()
  const [defaultRate, setDefaultRate] = useState(
    String(workspace.defaultBillableRate),
  )
  const [currency, setCurrency] = useState(
    normalizeCurrency(workspace.billableCurrency),
  )
  const [pending, setPending] = useState(false)
  const { data: currencyOptions = [] } = useQuery<CurrencyOption[]>({
    queryKey: ['currency-options'],
    queryFn: () => getCurrencyOptionsFn(),
    staleTime: 24 * 60 * 60 * 1000,
  })

  const parsedDefaultRate = Number(defaultRate)
  const defaultRateInvalid =
    defaultRate.trim() === '' ||
    !Number.isFinite(parsedDefaultRate) ||
    parsedDefaultRate < 0
  const normalizedCurrency = normalizeCurrency(currency)
  const currencyInvalid =
    currency.trim().length < 3 || currency.trim().length > 8
  const selectedCurrency = currencyOptions.find(
    (option) => option.code === normalizedCurrency,
  )

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (defaultRateInvalid || currencyInvalid) {
      gooeyToast.error('Enter valid billing settings', {
        description:
          'Use a positive hourly rate and a 3 to 8 character currency code.',
      })
      return
    }

    setPending(true)
    try {
      await updateWorkspaceBillingFn({
        data: {
          defaultBillableRate: parsedDefaultRate,
          billableCurrency: normalizedCurrency,
        },
      })
      await router.invalidate()
      setCurrency(normalizedCurrency)
      gooeyToast.success('Workspace billing updated')
    } catch (err) {
      gooeyToast.error('Could not update billing', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="m-0 text-lg font-bold text-foreground">
            Workspace default rate
          </h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            Members without an override are billed at this hourly rate.
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="grid gap-3 sm:grid-cols-[160px_180px_auto]"
        >
          <Label className="grid gap-2 text-xs">
            Default hourly rate
            <Input
              type="number"
              min="0"
              step="0.01"
              value={defaultRate}
              onChange={(event) => setDefaultRate(event.target.value)}
              aria-invalid={defaultRateInvalid}
            />
          </Label>
          <Label className="grid gap-2 text-xs">
            Currency
            <Input
              list="workspace-currency-options"
              value={currency}
              maxLength={8}
              onChange={(event) =>
                setCurrency(event.target.value.toUpperCase())
              }
              aria-invalid={currencyInvalid}
            />
            <datalist id="workspace-currency-options">
              {currencyOptions.map((option) => (
                <option
                  key={option.code}
                  value={option.code}
                  label={`${option.code} - ${option.name}`}
                />
              ))}
            </datalist>
            <span className="text-[11px] font-normal text-muted-foreground">
              {selectedCurrency
                ? selectedCurrency.name
                : 'Type a currency code or choose a suggestion.'}
            </span>
          </Label>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={pending || defaultRateInvalid || currencyInvalid}
            >
              {pending ? 'Saving...' : 'Save rate'}
            </Button>
          </div>
        </form>
      </div>
    </section>
  )
}

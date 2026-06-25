import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from '#/lib/toast'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
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
    currencyOptions.length > 0 &&
    !currencyOptions.some((option) => option.code === normalizedCurrency)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (defaultRateInvalid || currencyInvalid) {
      gooeyToast.error('Enter valid billing settings', {
        description:
          'Use a positive hourly rate and select a currency from the list.',
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
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-base font-bold text-foreground">
          Workspace default rate
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Members without an override are billed at this hourly rate.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <label className="space-y-1.5 text-xs font-semibold text-foreground">
            <span>Default hourly rate</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={defaultRate}
              onChange={(event) => setDefaultRate(event.target.value)}
              aria-invalid={defaultRateInvalid}
              className="h-10"
              placeholder="0.00"
            />
          </label>

          <label className="space-y-1.5 text-xs font-semibold text-foreground">
            <span>Currency</span>
            <Select
              value={normalizedCurrency}
              onValueChange={(code) => setCurrency(code)}
            >
              <SelectTrigger className="h-10" aria-invalid={currencyInvalid}>
                <SelectValue placeholder="Select currency…" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {currencyOptions.map((option) => (
                  <SelectItem key={option.code} value={option.code}>
                    {option.code} — {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <Button
            type="submit"
            disabled={pending || defaultRateInvalid || currencyInvalid}
            className="h-10 w-full lg:w-auto"
          >
            {pending ? 'Saving...' : 'Save rate'}
          </Button>
        </div>
      </form>
    </section>
  )
}

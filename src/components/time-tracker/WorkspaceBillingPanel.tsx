import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Info, Pencil } from 'lucide-react'
import { gooeyToast } from '#/lib/toast'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
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
import { formatCurrency, normalizeCurrency } from '#/lib/time-tracker/billing'
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
  const [open, setOpen] = useState(false)
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

  const formattedDefaultRate = formatCurrency(
    workspace.defaultBillableRate,
    workspace.billableCurrency,
  )

  function openDialog() {
    // Re-seed the form from the workspace so the dialog always shows the
    // current saved values, even if they changed since the last open.
    setDefaultRate(String(workspace.defaultBillableRate))
    setCurrency(normalizeCurrency(workspace.billableCurrency))
    setOpen(true)
  }

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
      setOpen(false)
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground">
            Workspace default rate
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The fallback hourly rate used when a member has no rate of their
            own.
          </p>
        </div>

        <Button type="button" variant="outline" onClick={openDialog}>
          <Pencil className="size-4" />
          Change
        </Button>
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-foreground">
          {formattedDefaultRate}
        </span>
        <span className="text-sm text-muted-foreground">/hr</span>
      </div>

      <p className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          This is a default — a fallback value only. When a member doesn&apos;t
          have a rate of their own, they are billed at this hourly rate.
        </span>
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit default rate</DialogTitle>
            <DialogDescription>
              This default rate is only a fallback. A member who has their own
              rate always uses theirs instead.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
                  <SelectTrigger
                    className="h-10"
                    aria-invalid={currencyInvalid}
                  >
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
            </div>

            <DialogFooter className="mt-2">
              <DialogClose asChild>
                <Button variant="outline" type="button" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={pending || defaultRateInvalid || currencyInvalid}
              >
                {pending ? 'Saving...' : 'Save rate'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}

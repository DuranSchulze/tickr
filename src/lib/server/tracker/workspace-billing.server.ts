import type { z } from 'zod'
import { db } from '#/db'
import { workspaces } from '#/db/schema'
import { eq } from 'drizzle-orm'
import { normalizeCurrency, toFiniteRate } from '#/lib/time-tracker/billing'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { assertOwnerOrAdmin } from './shared/role-gates.server'
import type { updateWorkspaceBillingSchema } from './shared/schemas'

type CurrencyOption = {
  code: string
  name: string
}

const FALLBACK_CURRENCIES: CurrencyOption[] = [
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'USD', name: 'United States Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'INR', name: 'Indian Rupee' },
]

let currencyCache: {
  expiresAt: number
  options: CurrencyOption[]
} | null = null

function normalizeCurrencyOptions(options: CurrencyOption[]) {
  const unique = new Map<string, CurrencyOption>()
  for (const option of options) {
    const code = normalizeCurrency(option.code)
    unique.set(code, { code, name: option.name.trim() || code })
  }
  return [...unique.values()].sort((a, b) => a.code.localeCompare(b.code))
}

export async function updateWorkspaceBilling(
  data: z.infer<typeof updateWorkspaceBillingSchema>,
) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  await db
    .update(workspaces)
    .set({
      defaultBillableRate: String(toFiniteRate(data.defaultBillableRate)),
      billableCurrency: normalizeCurrency(data.billableCurrency),
    })
    .where(eq(workspaces.id, access.workspace.id))
}

export async function getCurrencyOptions() {
  if (currencyCache && currencyCache.expiresAt > Date.now()) {
    return currencyCache.options
  }

  try {
    const response = await fetch('https://api.frankfurter.dev/v2/currencies')
    if (!response.ok) throw new Error('Currency list request failed.')

    const data = (await response.json()) as unknown
    const parsed = Array.isArray(data)
      ? data
          .filter(
            (item): item is { iso_code: string; name: string } =>
              item != null &&
              typeof item === 'object' &&
              typeof item.iso_code === 'string' &&
              typeof item.name === 'string',
          )
          .map((item) => ({ code: item.iso_code, name: item.name }))
      : data && typeof data === 'object'
        ? Object.entries(data as Record<string, unknown>)
            .filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === 'string',
            )
            .map(([code, name]) => ({ code, name }))
        : []

    const options = normalizeCurrencyOptions([
      ...FALLBACK_CURRENCIES,
      ...parsed,
    ])
    currencyCache = {
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      options,
    }
    return options
  } catch {
    return normalizeCurrencyOptions(FALLBACK_CURRENCIES)
  }
}

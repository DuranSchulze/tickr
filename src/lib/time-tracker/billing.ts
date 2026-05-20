export const DEFAULT_BILLABLE_CURRENCY = 'PHP'

export function toFiniteRate(value: number | null | undefined, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback
}

export function normalizeCurrency(currency: string | null | undefined) {
  const normalized = currency?.trim().toUpperCase()
  return normalized && normalized.length >= 3
    ? normalized
    : DEFAULT_BILLABLE_CURRENCY
}

export function computeEffectiveRate(
  memberRate: number | null | undefined,
  defaultRate: number,
) {
  const safeDefault = toFiniteRate(defaultRate)
  return memberRate == null
    ? safeDefault
    : toFiniteRate(memberRate, safeDefault)
}

export function formatCurrency(
  amount: number | null | undefined,
  currency: string | null | undefined,
) {
  const safeAmount = toFiniteRate(amount)
  const safeCurrency = normalizeCurrency(currency)

  try {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: safeCurrency,
      maximumFractionDigits: 2,
    }).format(safeAmount)
  } catch {
    return `${safeCurrency} ${safeAmount.toFixed(2)}`
  }
}

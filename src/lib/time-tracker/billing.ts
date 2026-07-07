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

export function computeMemberEffectiveRate(
  memberRate: number | null | undefined,
  defaultRate: number,
) {
  const safeDefault = toFiniteRate(defaultRate)
  return memberRate == null
    ? safeDefault
    : toFiniteRate(memberRate, safeDefault)
}

export function computeBillableRate({
  memberClientRate,
  clientDefaultRate,
  memberRate,
  workspaceDefaultRate,
}: {
  memberClientRate?: number | null
  clientDefaultRate?: number | null
  memberRate?: number | null
  workspaceDefaultRate: number
}) {
  const safeWorkspaceDefault = toFiniteRate(workspaceDefaultRate)
  const safeMemberRate =
    memberRate == null
      ? safeWorkspaceDefault
      : toFiniteRate(memberRate, safeWorkspaceDefault)
  const safeClientRate =
    clientDefaultRate == null
      ? safeMemberRate
      : toFiniteRate(clientDefaultRate, safeMemberRate)
  return memberClientRate == null
    ? safeClientRate
    : toFiniteRate(memberClientRate, safeClientRate)
}

export function computeEffectiveRate(
  memberRate: number | null | undefined,
  defaultRate: number,
): number
export function computeEffectiveRate(
  clientRate: number | null | undefined,
  memberRate: number | null | undefined,
  defaultRate: number,
): number
export function computeEffectiveRate(
  firstRate: number | null | undefined,
  secondRate: number | null | undefined,
  thirdRate?: number,
) {
  if (thirdRate === undefined) {
    return computeMemberEffectiveRate(firstRate, secondRate ?? 0)
  }

  return computeBillableRate({
    memberClientRate: firstRate,
    clientDefaultRate: null,
    memberRate: secondRate,
    workspaceDefaultRate: thirdRate,
  })
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

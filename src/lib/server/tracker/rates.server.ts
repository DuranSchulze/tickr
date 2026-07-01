import { db } from '#/db'
import { memberClientBillableRates } from '#/db/schema'
import { and, eq, inArray, isNull, lte, or, gte } from 'drizzle-orm'
import { computeEffectiveRate } from '#/lib/time-tracker/billing'
import { toDateKey } from './shared/dates'

export type RateLookupEntry = {
  id: string
  workspaceMemberId: string
  clientId: string | null
  date: Date
}

export type EntryRateResolution = {
  clientRate: number | null
  effectiveRate: number
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function matchesDate(
  rate: { effectiveFrom: string; effectiveTo: string | null },
  dateKey: string,
) {
  return (
    rate.effectiveFrom <= dateKey &&
    (rate.effectiveTo == null || rate.effectiveTo >= dateKey)
  )
}

export async function resolveEntryRateMap({
  workspaceId,
  entries,
  memberRateById,
  defaultRate,
}: {
  workspaceId: string
  entries: RateLookupEntry[]
  memberRateById: Map<string, number | null>
  defaultRate: number
}): Promise<Map<string, EntryRateResolution>> {
  const result = new Map<string, EntryRateResolution>()
  const entriesWithClient = entries.filter((entry) => entry.clientId)

  if (entriesWithClient.length === 0) {
    for (const entry of entries) {
      const memberRate = memberRateById.get(entry.workspaceMemberId) ?? null
      result.set(entry.id, {
        clientRate: null,
        effectiveRate: computeEffectiveRate(null, memberRate, defaultRate),
      })
    }
    return result
  }

  const dateKeys = entriesWithClient.map((entry) => toDateKey(entry.date))
  const minDate = dateKeys.reduce((min, date) => (date < min ? date : min))
  const maxDate = dateKeys.reduce((max, date) => (date > max ? date : max))
  const memberIds = unique(entriesWithClient.map((entry) => entry.workspaceMemberId))
  const clientIds = unique(
    entriesWithClient.flatMap((entry) => (entry.clientId ? [entry.clientId] : [])),
  )

  const rates =
    memberIds.length > 0 && clientIds.length > 0
      ? await db
          .select({
            workspaceMemberId: memberClientBillableRates.workspaceMemberId,
            clientId: memberClientBillableRates.clientId,
            billableRate: memberClientBillableRates.billableRate,
            effectiveFrom: memberClientBillableRates.effectiveFrom,
            effectiveTo: memberClientBillableRates.effectiveTo,
          })
          .from(memberClientBillableRates)
          .where(
            and(
              eq(memberClientBillableRates.workspaceId, workspaceId),
              inArray(memberClientBillableRates.workspaceMemberId, memberIds),
              inArray(memberClientBillableRates.clientId, clientIds),
              lte(memberClientBillableRates.effectiveFrom, maxDate),
              or(
                isNull(memberClientBillableRates.effectiveTo),
                gte(memberClientBillableRates.effectiveTo, minDate),
              ),
            ),
          )
      : []

  const ratesByMemberClient = new Map<string, typeof rates>()
  for (const rate of rates) {
    const key = `${rate.workspaceMemberId}:${rate.clientId}`
    const list = ratesByMemberClient.get(key) ?? []
    list.push(rate)
    ratesByMemberClient.set(key, list)
  }

  for (const entry of entries) {
    const memberRate = memberRateById.get(entry.workspaceMemberId) ?? null
    const dateKey = toDateKey(entry.date)
    const key = `${entry.workspaceMemberId}:${entry.clientId ?? ''}`
    const clientRateRow = (ratesByMemberClient.get(key) ?? [])
      .filter((rate) => matchesDate(rate, dateKey))
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
    const clientRate = clientRateRow ? Number(clientRateRow.billableRate) : null

    result.set(entry.id, {
      clientRate,
      effectiveRate: computeEffectiveRate(clientRate, memberRate, defaultRate),
    })
  }

  return result
}

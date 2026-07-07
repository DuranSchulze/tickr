import { db } from '#/db'
import { clients, memberClientBillableRates } from '#/db/schema'
import { and, eq, inArray, isNull, lte, or, gte } from 'drizzle-orm'
import { computeBillableRate } from '#/lib/time-tracker/billing'
import { toDateKey } from './shared/dates'

export type RateLookupEntry = {
  id: string
  workspaceMemberId: string
  clientId: string | null
  date: Date
}

export type EntryRateResolution = {
  memberClientRate: number | null
  clientDefaultRate: number | null
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
        memberClientRate: null,
        clientDefaultRate: null,
        effectiveRate: computeBillableRate({
          memberClientRate: null,
          clientDefaultRate: null,
          memberRate,
          workspaceDefaultRate: defaultRate,
        }),
      })
    }
    return result
  }

  const dateKeys = entriesWithClient.map((entry) => toDateKey(entry.date))
  const minDate = dateKeys.reduce((min, date) => (date < min ? date : min))
  const maxDate = dateKeys.reduce((max, date) => (date > max ? date : max))
  const memberIds = unique(
    entriesWithClient.map((entry) => entry.workspaceMemberId),
  )
  const clientIds = unique(
    entriesWithClient.flatMap((entry) =>
      entry.clientId ? [entry.clientId] : [],
    ),
  )

  const [rates, clientRows] = await Promise.all([
    memberIds.length > 0 && clientIds.length > 0
      ? db
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
      : Promise.resolve([]),
    clientIds.length > 0
      ? db
          .select({
            id: clients.id,
            defaultBillableRate: clients.defaultBillableRate,
          })
          .from(clients)
          .where(
            and(
              eq(clients.workspaceId, workspaceId),
              inArray(clients.id, clientIds),
            ),
          )
      : Promise.resolve([]),
  ])

  const ratesByMemberClient = new Map<string, typeof rates>()
  for (const rate of rates) {
    const key = `${rate.workspaceMemberId}:${rate.clientId}`
    const list = ratesByMemberClient.get(key) ?? []
    list.push(rate)
    ratesByMemberClient.set(key, list)
  }
  const clientDefaultRateById = new Map(
    clientRows.map((client) => [
      client.id,
      client.defaultBillableRate == null
        ? null
        : Number(client.defaultBillableRate),
    ]),
  )

  for (const entry of entries) {
    const memberRate = memberRateById.get(entry.workspaceMemberId) ?? null
    const dateKey = toDateKey(entry.date)
    const key = `${entry.workspaceMemberId}:${entry.clientId ?? ''}`
    const clientRateRow = (ratesByMemberClient.get(key) ?? [])
      .filter((rate) => matchesDate(rate, dateKey))
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
    const memberClientRate = clientRateRow
      ? Number(clientRateRow.billableRate)
      : null
    const clientDefaultRate = entry.clientId
      ? (clientDefaultRateById.get(entry.clientId) ?? null)
      : null

    result.set(entry.id, {
      memberClientRate,
      clientDefaultRate,
      effectiveRate: computeBillableRate({
        memberClientRate,
        clientDefaultRate,
        memberRate,
        workspaceDefaultRate: defaultRate,
      }),
    })
  }

  return result
}

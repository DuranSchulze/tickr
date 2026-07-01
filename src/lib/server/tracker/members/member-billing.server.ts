import type { z } from 'zod'
import { db } from '#/db'
import {
  clients,
  memberClientBillableRates,
  workspaceMembers,
} from '#/db/schema'
import { and, asc, eq, gte, isNull, lt, lte } from 'drizzle-orm'
import { toFiniteRate } from '#/lib/time-tracker/billing'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import { assertOwnerOrAdmin } from '../shared/role-gates.server'
import { createAuditLog } from '../audit/audit-logger.server'
import { formatDateInTimeZone, parseDateOnly, toDateKey } from '../shared/dates'
import type {
  memberIdSchema,
  setMemberClientBillableRateSchema,
  unsetMemberClientBillableRateSchema,
  updateMemberBillableRateSchema,
} from '../shared/schemas'

function previousDateKey(dateKey: string) {
  const date = parseDateOnly(dateKey)
  date.setUTCDate(date.getUTCDate() - 1)
  return toDateKey(date)
}

function todayInWorkspace(timeZone: string) {
  return formatDateInTimeZone(new Date(), timeZone || 'UTC')
}

function assertFutureEffectiveDate(effectiveFrom: string, timeZone: string) {
  if (effectiveFrom < todayInWorkspace(timeZone)) {
    throw new Error('Effective date must be today or a future date.')
  }
}

async function requireManagedMember(workspaceId: string, memberId: string) {
  const [target] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.id, memberId),
        eq(workspaceMembers.workspaceId, workspaceId),
      ),
    )
    .limit(1)
  if (!target) throw new Error('Member not found in this workspace.')
  return target
}

async function requireWorkspaceClient(workspaceId: string, clientId: string) {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
    .limit(1)
  if (!client) throw new Error('Client not found in this workspace.')
  return client
}

export async function updateMemberBillableRate(
  data: z.infer<typeof updateMemberBillableRateSchema>,
) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [target] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.id, data.memberId),
        eq(workspaceMembers.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)
  if (!target) throw new Error('Member not found in this workspace.')

  await db
    .update(workspaceMembers)
    .set({
      billableRate:
        data.billableRate == null
          ? null
          : String(toFiniteRate(data.billableRate)),
    })
    .where(eq(workspaceMembers.id, data.memberId))
}

export async function getMemberClientBillableRates(
  data: z.infer<typeof memberIdSchema>,
) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)
  const member = await requireManagedMember(access.workspace.id, data.memberId)

  const [clientRows, rateRows] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        clientStatus: clients.clientStatus,
      })
      .from(clients)
      .where(eq(clients.workspaceId, access.workspace.id))
      .orderBy(asc(clients.name)),
    db
      .select({
        id: memberClientBillableRates.id,
        clientId: memberClientBillableRates.clientId,
        billableRate: memberClientBillableRates.billableRate,
        effectiveFrom: memberClientBillableRates.effectiveFrom,
        effectiveTo: memberClientBillableRates.effectiveTo,
      })
      .from(memberClientBillableRates)
      .where(
        and(
          eq(memberClientBillableRates.workspaceId, access.workspace.id),
          eq(memberClientBillableRates.workspaceMemberId, data.memberId),
          isNull(memberClientBillableRates.effectiveTo),
        ),
      )
      .orderBy(asc(memberClientBillableRates.effectiveFrom)),
  ])

  const activeRateByClient = new Map(
    rateRows.map((rate) => [rate.clientId, rate]),
  )

  return {
    memberId: member.id,
    clients: clientRows.map((client) => {
      const rate = activeRateByClient.get(client.id)
      return {
        clientId: client.id,
        clientName: client.name,
        clientStatus: client.clientStatus,
        billableRate: rate ? Number(rate.billableRate) : null,
        effectiveFrom: rate?.effectiveFrom ?? null,
        effectiveTo: rate?.effectiveTo ?? null,
      }
    }),
  }
}

export async function setMemberClientBillableRate(
  data: z.infer<typeof setMemberClientBillableRateSchema>,
) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)
  assertFutureEffectiveDate(data.effectiveFrom, access.workspace.timezone)

  await requireManagedMember(access.workspace.id, data.memberId)
  const client = await requireWorkspaceClient(
    access.workspace.id,
    data.clientId,
  )
  const closeDate = previousDateKey(data.effectiveFrom)

  await db
    .delete(memberClientBillableRates)
    .where(
      and(
        eq(memberClientBillableRates.workspaceId, access.workspace.id),
        eq(memberClientBillableRates.workspaceMemberId, data.memberId),
        eq(memberClientBillableRates.clientId, data.clientId),
        isNull(memberClientBillableRates.effectiveTo),
        gte(memberClientBillableRates.effectiveFrom, data.effectiveFrom),
      ),
    )

  await db
    .update(memberClientBillableRates)
    .set({
      effectiveTo: closeDate,
    })
    .where(
      and(
        eq(memberClientBillableRates.workspaceId, access.workspace.id),
        eq(memberClientBillableRates.workspaceMemberId, data.memberId),
        eq(memberClientBillableRates.clientId, data.clientId),
        isNull(memberClientBillableRates.effectiveTo),
        lt(memberClientBillableRates.effectiveFrom, data.effectiveFrom),
      ),
    )

  await db
    .insert(memberClientBillableRates)
    .values({
      workspaceId: access.workspace.id,
      workspaceMemberId: data.memberId,
      clientId: data.clientId,
      billableRate: String(toFiniteRate(data.billableRate)),
      effectiveFrom: data.effectiveFrom,
      effectiveTo: null,
    })
    .onConflictDoUpdate({
      target: [
        memberClientBillableRates.workspaceMemberId,
        memberClientBillableRates.clientId,
        memberClientBillableRates.effectiveFrom,
      ],
      set: {
        billableRate: String(toFiniteRate(data.billableRate)),
        effectiveTo: null,
      },
    })

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'MEMBER_CLIENT_RATE_SET',
    targetType: 'member',
    targetId: data.memberId,
    details: `${client.name}: ${data.billableRate} from ${data.effectiveFrom}`,
  })
}

export async function unsetMemberClientBillableRate(
  data: z.infer<typeof unsetMemberClientBillableRateSchema>,
) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  await requireManagedMember(access.workspace.id, data.memberId)
  const client = await requireWorkspaceClient(
    access.workspace.id,
    data.clientId,
  )
  const closeDate = previousDateKey(data.effectiveFrom)

  await db
    .delete(memberClientBillableRates)
    .where(
      and(
        eq(memberClientBillableRates.workspaceId, access.workspace.id),
        eq(memberClientBillableRates.workspaceMemberId, data.memberId),
        eq(memberClientBillableRates.clientId, data.clientId),
        isNull(memberClientBillableRates.effectiveTo),
        gte(memberClientBillableRates.effectiveFrom, data.effectiveFrom),
      ),
    )

  await db
    .update(memberClientBillableRates)
    .set({
      effectiveTo: closeDate,
    })
    .where(
      and(
        eq(memberClientBillableRates.workspaceId, access.workspace.id),
        eq(memberClientBillableRates.workspaceMemberId, data.memberId),
        eq(memberClientBillableRates.clientId, data.clientId),
        isNull(memberClientBillableRates.effectiveTo),
        lte(memberClientBillableRates.effectiveFrom, closeDate),
      ),
    )

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'MEMBER_CLIENT_RATE_UNSET',
    targetType: 'member',
    targetId: data.memberId,
    details: `${client.name}: fallback from ${data.effectiveFrom}`,
  })
}

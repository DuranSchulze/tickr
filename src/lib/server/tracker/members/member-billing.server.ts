import type { z } from 'zod'
import { db } from '#/db'
import { workspaceMembers } from '#/db/schema'
import { and, eq } from 'drizzle-orm'
import { toFiniteRate } from '#/lib/time-tracker/billing'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import { assertOwnerOrAdmin } from '../shared/role-gates.server'
import type { updateMemberBillableRateSchema } from '../shared/schemas'

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

import type { z } from 'zod'
import { db } from '#/db'
import {
  workspaceMembers,
  workspaceRoles,
  departments,
  cohorts,
  cohortMembers,
} from '#/db/schema'
import { and, eq, ilike, inArray } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import { assertOwnerOrAdmin } from '../shared/role-gates.server'
import { createAuditLog } from '../audit/audit-logger.server'
import type {
  inviteMemberSchema,
  setMemberStatusSchema,
  updateWorkspaceMemberSchema,
} from '../shared/schemas'

export async function createWorkspaceMember(
  data: z.infer<typeof inviteMemberSchema>,
) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const email = data.email.toLowerCase()

  const [existing] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, access.workspace.id),
        ilike(workspaceMembers.email, email),
      ),
    )
    .limit(1)

  if (existing) {
    throw new Error(`${data.email} is already a member of this workspace.`)
  }

  const [roleExists] = await db
    .select()
    .from(workspaceRoles)
    .where(
      and(
        eq(workspaceRoles.id, data.workspaceRoleId),
        eq(workspaceRoles.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)

  if (!roleExists) {
    throw new Error('Selected role does not exist in this workspace.')
  }

  await db.insert(workspaceMembers).values({
    workspaceId: access.workspace.id,
    email,
    workspaceRoleId: data.workspaceRoleId,
    status: 'INVITED',
    departmentId: data.departmentId || null,
    invitedById: access.member.id,
  })
}

export async function updateWorkspaceMember(
  data: z.infer<typeof updateWorkspaceMemberSchema>,
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

  if (data.workspaceRoleId) {
    const [roleExists] = await db
      .select()
      .from(workspaceRoles)
      .where(
        and(
          eq(workspaceRoles.id, data.workspaceRoleId),
          eq(workspaceRoles.workspaceId, access.workspace.id),
        ),
      )
      .limit(1)
    if (!roleExists)
      throw new Error('Selected role does not exist in this workspace.')
  }

  const effectiveDepartmentId =
    data.departmentId !== undefined ? data.departmentId : target.departmentId

  if (effectiveDepartmentId) {
    const [departmentExists] = await db
      .select()
      .from(departments)
      .where(
        and(
          eq(departments.id, effectiveDepartmentId),
          eq(departments.workspaceId, access.workspace.id),
        ),
      )
      .limit(1)
    if (!departmentExists)
      throw new Error('Selected department does not exist in this workspace.')
  }

  if (data.cohortIds !== undefined && data.cohortIds.length > 0) {
    if (!effectiveDepartmentId) {
      throw new Error('Select a department before assigning cohorts.')
    }

    const validCohorts = await db
      .select({ id: cohorts.id })
      .from(cohorts)
      .where(
        and(
          inArray(cohorts.id, data.cohortIds),
          eq(cohorts.workspaceId, access.workspace.id),
          eq(cohorts.departmentId, effectiveDepartmentId),
        ),
      )
    if (validCohorts.length !== data.cohortIds.length) {
      throw new Error('Selected cohorts must belong to the member department.')
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(workspaceMembers)
      .set({
        ...(data.workspaceRoleId !== undefined && {
          workspaceRoleId: data.workspaceRoleId,
        }),
        ...(data.departmentId !== undefined && {
          departmentId: data.departmentId || null,
        }),
      })
      .where(eq(workspaceMembers.id, data.memberId))

    if (data.cohortIds !== undefined) {
      await tx
        .delete(cohortMembers)
        .where(eq(cohortMembers.memberId, data.memberId))
      if (data.cohortIds.length > 0) {
        await tx.insert(cohortMembers).values(
          data.cohortIds.map((cohortId) => ({
            cohortId,
            memberId: data.memberId,
          })),
        )
      }
    } else if (data.departmentId !== undefined) {
      await tx
        .delete(cohortMembers)
        .where(eq(cohortMembers.memberId, data.memberId))
    }
  })

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action:
      data.workspaceRoleId !== undefined
        ? 'MEMBER_ROLE_CHANGE'
        : 'MEMBER_DEPT_CHANGE',
    targetType: 'member',
    targetId: data.memberId,
    details: data.workspaceRoleId ?? data.departmentId ?? null,
  })
}

export async function setMemberStatus(
  data: z.infer<typeof setMemberStatusSchema>,
) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  if (data.memberId === access.member.id) {
    throw new Error('You cannot change your own account status.')
  }

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
    .set({ status: data.status })
    .where(eq(workspaceMembers.id, data.memberId))

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'MEMBER_STATUS_CHANGE',
    targetType: 'member',
    targetId: data.memberId,
    details: data.status,
  })
}

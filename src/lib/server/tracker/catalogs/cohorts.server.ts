import type { z } from 'zod'
import { db } from '#/db'
import { cohorts, departments } from '#/db/schema'
import { and, eq, ilike, ne } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import { assertOwnerOrAdmin } from '../shared/role-gates.server'
import { createAuditLog } from '../audit/audit-logger.server'
import type {
  createCohortSchema,
  idSchema,
  updateCohortSchema,
} from '../shared/schemas'

export async function createCohort(data: z.infer<typeof createCohortSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [department] = await db
    .select()
    .from(departments)
    .where(
      and(
        eq(departments.id, data.departmentId),
        eq(departments.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)
  if (!department) throw new Error('Selected department does not exist.')

  const [existing] = await db
    .select()
    .from(cohorts)
    .where(
      and(
        eq(cohorts.workspaceId, access.workspace.id),
        eq(cohorts.departmentId, data.departmentId),
        ilike(cohorts.name, data.name),
      ),
    )
    .limit(1)
  if (existing)
    throw new Error(
      `A cohort named "${data.name}" already exists in ${department.name}.`,
    )

  const [created] = await db
    .insert(cohorts)
    .values({
      workspaceId: access.workspace.id,
      departmentId: data.departmentId,
      name: data.name,
    })
    .returning()

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'COHORT_CREATE',
    targetType: 'cohort',
    targetId: created.id,
    details: `${data.name} (${department.name})`,
  })
}

export async function updateCohort(data: z.infer<typeof updateCohortSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [department] = await db
    .select()
    .from(departments)
    .where(
      and(
        eq(departments.id, data.departmentId),
        eq(departments.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)
  if (!department) throw new Error('Selected department does not exist.')

  const [duplicate] = await db
    .select()
    .from(cohorts)
    .where(
      and(
        ne(cohorts.id, data.id),
        eq(cohorts.workspaceId, access.workspace.id),
        eq(cohorts.departmentId, data.departmentId),
        ilike(cohorts.name, data.name),
      ),
    )
    .limit(1)
  if (duplicate)
    throw new Error(
      `A cohort named "${data.name}" already exists in ${department.name}.`,
    )

  await db
    .update(cohorts)
    .set({ name: data.name, departmentId: data.departmentId })
    .where(
      and(
        eq(cohorts.id, data.id),
        eq(cohorts.workspaceId, access.workspace.id),
      ),
    )

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'COHORT_EDIT',
    targetType: 'cohort',
    targetId: data.id,
    details: `${data.name} (${department.name})`,
  })
}

export async function deleteCohort(data: z.infer<typeof idSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  await db
    .delete(cohorts)
    .where(
      and(
        eq(cohorts.id, data.id),
        eq(cohorts.workspaceId, access.workspace.id),
      ),
    )

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'COHORT_DELETE',
    targetType: 'cohort',
    targetId: data.id,
  })
}

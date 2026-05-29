import type { z } from 'zod'
import { db } from '#/db'
import {
  workspaceMembers,
  users,
  userProfiles,
  userAddresses,
  workspaceRoles,
  departments,
  cohortMembers,
  cohorts,
  employeeProfiles,
  employeeGovernmentIds,
  timeEntries,
} from '#/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  computeEffectiveRate,
  normalizeCurrency,
  toFiniteRate,
} from '#/lib/time-tracker/billing'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import {
  assertAtLeastManager,
  assertOwnerOrAdmin,
} from '../shared/role-gates.server'
import type {
  memberIdSchema,
  updateMemberDetailSchema,
} from '../shared/schemas'

function toDateOnly(value?: string | null) {
  return value ? new Date(value) : null
}

function fromDateOnly(value?: Date | string | null) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

function emptyToNull<T extends string | undefined>(v: T): string | null {
  if (v === undefined || v === '') return null
  return v
}

export async function getMemberDetail(data: z.infer<typeof memberIdSchema>) {
  const access = await requireWorkspaceAccess()
  assertAtLeastManager(access)
  const canManage =
    access.member.workspaceRole?.permissionLevel === 'OWNER' ||
    access.member.workspaceRole?.permissionLevel === 'ADMIN'

  // Fetch base member row
  const [memberRow] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.id, data.memberId),
        eq(workspaceMembers.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)

  if (!memberRow) throw new Error('Member not found in this workspace.')

  // Collect IDs for related fetches
  const roleId = memberRow.workspaceRoleId
  const deptId = memberRow.departmentId
  const userId = memberRow.userId

  const [
    usersData,
    rolesData,
    departmentsData,
    cohortData,
    empProfileData,
    billableEntriesData,
  ] = await Promise.all([
    userId
      ? db.select().from(users).where(eq(users.id, userId)).limit(1)
      : Promise.resolve([]),
    roleId
      ? db
          .select()
          .from(workspaceRoles)
          .where(eq(workspaceRoles.id, roleId))
          .limit(1)
      : Promise.resolve([]),
    deptId
      ? db.select().from(departments).where(eq(departments.id, deptId)).limit(1)
      : Promise.resolve([]),
    db
      .select({ cohortId: cohortMembers.cohortId, cohort: cohorts })
      .from(cohortMembers)
      .innerJoin(cohorts, eq(cohortMembers.cohortId, cohorts.id))
      .where(eq(cohortMembers.memberId, data.memberId)),
    db
      .select({ profile: employeeProfiles, govIds: employeeGovernmentIds })
      .from(employeeProfiles)
      .leftJoin(
        employeeGovernmentIds,
        eq(employeeProfiles.id, employeeGovernmentIds.employeeProfileId),
      )
      .where(eq(employeeProfiles.workspaceMemberId, data.memberId))
      .limit(1),
    db
      .select({ durationSeconds: timeEntries.durationSeconds })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, access.workspace.id),
          eq(timeEntries.workspaceMemberId, memberRow.id),
          eq(timeEntries.billable, true),
        ),
      ),
  ])

  const user = usersData[0] ?? null
  const role = rolesData[0] ?? null
  const department = departmentsData[0] ?? null
  const empData = empProfileData[0] ?? null
  const employeeProfile = empData
    ? { ...empData.profile, governmentIds: empData.govIds ?? null }
    : null

  // Fetch userProfile + address if user exists
  let profileRow: typeof userProfiles.$inferSelect | null = null
  let addressRow: typeof userAddresses.$inferSelect | null = null
  if (user) {
    const profileRows = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id))
      .limit(1)
    profileRow = profileRows[0] ?? null

    if (profileRow) {
      const addressRows = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.userProfileId, profileRow.id))
        .limit(1)
      addressRow = addressRows[0] ?? null
    }
  }

  const billableSeconds = billableEntriesData.reduce(
    (sum, entry) => sum + entry.durationSeconds,
    0,
  )

  const memberRate =
    memberRow.billableRate == null
      ? null
      : toFiniteRate(Number(memberRow.billableRate))
  const defaultRate = toFiniteRate(Number(access.workspace.defaultBillableRate))
  const effectiveRate = computeEffectiveRate(memberRate, defaultRate)
  const billableCurrency = normalizeCurrency(access.workspace.billableCurrency)

  return {
    canManage,
    workspace: {
      id: access.workspace.id,
      name: access.workspace.name,
      defaultBillableRate: defaultRate,
      billableCurrency,
    },
    member: {
      id: memberRow.id,
      name: user?.name ?? memberRow.email,
      email: memberRow.email,
      image: user?.image ?? null,
      status: memberRow.status,
      billableRate: canManage ? memberRate : null,
      effectiveRate: canManage ? effectiveRate : null,
      billableSeconds: canManage ? billableSeconds : 0,
      earningsPreview: canManage
        ? toFiniteRate((billableSeconds / 3600) * effectiveRate)
        : 0,
      role: role
        ? {
            id: role.id,
            name: role.name,
            permissionLevel: role.permissionLevel,
            color: role.color,
          }
        : null,
      department: department
        ? { id: department.id, name: department.name }
        : null,
      cohorts: cohortData.map((c) => ({
        id: c.cohort.id,
        name: c.cohort.name,
      })),
      personal: {
        firstName: profileRow?.firstName ?? '',
        middleName: profileRow?.middleName ?? '',
        lastName: profileRow?.lastName ?? '',
        contactNumber: profileRow?.contactNumber ?? '',
        birthDate: fromDateOnly(profileRow?.birthDate),
        gender: profileRow?.gender ?? '',
        maritalStatus: profileRow?.maritalStatus ?? '',
        address: addressRow
          ? {
              buildingNo: addressRow.buildingNo ?? '',
              street: addressRow.street ?? '',
              city: addressRow.city ?? '',
              province: addressRow.province ?? '',
              postalCode: addressRow.postalCode ?? '',
              country: addressRow.country,
            }
          : null,
      },
      employeeProfile:
        canManage && employeeProfile
          ? {
              employeeNumber: employeeProfile.employeeNumber ?? '',
              positionTitle: employeeProfile.positionTitle ?? '',
              employmentType: employeeProfile.employmentType,
              employmentStatus: employeeProfile.employmentStatus,
              hireDate: fromDateOnly(employeeProfile.hireDate),
              regularizationDate: fromDateOnly(
                employeeProfile.regularizationDate,
              ),
              separationDate: fromDateOnly(employeeProfile.separationDate),
            }
          : null,
      governmentIds:
        canManage && employeeProfile?.governmentIds
          ? {
              sssNumber: employeeProfile.governmentIds.sssNumber ?? '',
              philHealthNumber:
                employeeProfile.governmentIds.philHealthNumber ?? '',
              tinNumber: employeeProfile.governmentIds.tinNumber ?? '',
              pagIbigNumber: employeeProfile.governmentIds.pagIbigNumber ?? '',
            }
          : null,
    },
  }
}

export async function updateMemberDetail(
  data: z.infer<typeof updateMemberDetailSchema>,
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

  let employeeProfileId: string | null = null

  if (data.employeeProfile) {
    const e = data.employeeProfile
    const [profile] = await db
      .insert(employeeProfiles)
      .values({
        workspaceMemberId: data.memberId,
        employeeNumber: emptyToNull(e.employeeNumber),
        positionTitle: emptyToNull(e.positionTitle),
        employmentType: e.employmentType ?? 'FULL_TIME',
        employmentStatus: e.employmentStatus ?? 'ACTIVE',
        hireDate: toDateOnly(e.hireDate) as unknown as string,
        regularizationDate: toDateOnly(
          e.regularizationDate,
        ) as unknown as string,
        separationDate: toDateOnly(e.separationDate) as unknown as string,
      })
      .onConflictDoUpdate({
        target: employeeProfiles.workspaceMemberId,
        set: {
          employeeNumber: emptyToNull(e.employeeNumber),
          positionTitle: emptyToNull(e.positionTitle),
          employmentType: e.employmentType ?? 'FULL_TIME',
          employmentStatus: e.employmentStatus ?? 'ACTIVE',
          hireDate: toDateOnly(e.hireDate) as unknown as string,
          regularizationDate: toDateOnly(
            e.regularizationDate,
          ) as unknown as string,
          separationDate: toDateOnly(e.separationDate) as unknown as string,
        },
      })
      .returning()
    employeeProfileId = profile.id
  } else {
    const existing = await db
      .select({ id: employeeProfiles.id })
      .from(employeeProfiles)
      .where(eq(employeeProfiles.workspaceMemberId, data.memberId))
      .limit(1)
    employeeProfileId = existing[0]?.id ?? null
  }

  if (data.governmentIds) {
    if (!employeeProfileId) {
      const [profile] = await db
        .insert(employeeProfiles)
        .values({ workspaceMemberId: data.memberId })
        .returning()
      employeeProfileId = profile.id
    }

    const g = data.governmentIds
    await db
      .insert(employeeGovernmentIds)
      .values({
        employeeProfileId,
        sssNumber: emptyToNull(g.sssNumber),
        philHealthNumber: emptyToNull(g.philHealthNumber),
        tinNumber: emptyToNull(g.tinNumber),
        pagIbigNumber: emptyToNull(g.pagIbigNumber),
      })
      .onConflictDoUpdate({
        target: employeeGovernmentIds.employeeProfileId,
        set: {
          sssNumber: emptyToNull(g.sssNumber),
          philHealthNumber: emptyToNull(g.philHealthNumber),
          tinNumber: emptyToNull(g.tinNumber),
          pagIbigNumber: emptyToNull(g.pagIbigNumber),
        },
      })
  }
}

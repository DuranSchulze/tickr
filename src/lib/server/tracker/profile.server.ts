import type { z } from 'zod'
import { db } from '#/db'
import { users, userProfiles, userAddresses } from '#/db/schema'
import { eq } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import type { updateProfileSchema } from './shared/schemas'

function emptyToNull<T extends string | undefined>(v: T): string | null {
  if (v === undefined || v === '') return null
  return v
}

function fromDateOnly(value?: Date | string | null) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

export async function updateProfile(data: z.infer<typeof updateProfileSchema>) {
  const access = await requireWorkspaceAccess()

  const birthDate = data.birthDate ? new Date(data.birthDate) : null
  const gender = data.gender || null
  const maritalStatus = data.maritalStatus ? data.maritalStatus : null

  await db
    .update(users)
    .set({ name: data.name, image: data.avatarUrl || null })
    .where(eq(users.id, access.user.id))

  const [profile] = await db
    .insert(userProfiles)
    .values({
      userId: access.user.id,
      firstName: data.firstName,
      middleName: emptyToNull(data.middleName),
      lastName: data.lastName,
      contactNumber: emptyToNull(data.contactNumber),
      birthDate: birthDate as unknown as string,
      gender,
      maritalStatus,
    })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: {
        firstName: data.firstName,
        middleName: emptyToNull(data.middleName),
        lastName: data.lastName,
        contactNumber: emptyToNull(data.contactNumber),
        birthDate: birthDate as unknown as string,
        gender,
        maritalStatus,
      },
    })
    .returning()

  if (data.address) {
    const a = data.address
    await db
      .insert(userAddresses)
      .values({
        userProfileId: profile.id,
        buildingNo: emptyToNull(a.buildingNo),
        street: emptyToNull(a.street),
        city: emptyToNull(a.city),
        province: emptyToNull(a.province),
        postalCode: emptyToNull(a.postalCode),
        country: a.country || 'Philippines',
      })
      .onConflictDoUpdate({
        target: userAddresses.userProfileId,
        set: {
          buildingNo: emptyToNull(a.buildingNo),
          street: emptyToNull(a.street),
          city: emptyToNull(a.city),
          province: emptyToNull(a.province),
          postalCode: emptyToNull(a.postalCode),
          country: a.country || 'Philippines',
        },
      })
  }
}

export async function getSelfProfile() {
  const access = await requireWorkspaceAccess()

  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.id, access.user.id))
    .limit(1)

  let profileRow: typeof userProfiles.$inferSelect | null = null
  let addressRow: typeof userAddresses.$inferSelect | null = null

  if (userRow) {
    const profileRows = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userRow.id))
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

  return {
    user: {
      id: userRow?.id ?? access.user.id,
      name: userRow?.name ?? access.user.name,
      email: userRow?.email ?? access.user.email,
      image: userRow?.image ?? null,
    },
    profile: profileRow
      ? {
          firstName: profileRow.firstName,
          middleName: profileRow.middleName ?? '',
          lastName: profileRow.lastName,
          contactNumber: profileRow.contactNumber ?? '',
          birthDate: fromDateOnly(profileRow.birthDate),
          gender: profileRow.gender ?? '',
          maritalStatus: profileRow.maritalStatus ?? '',
        }
      : null,
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
  }
}

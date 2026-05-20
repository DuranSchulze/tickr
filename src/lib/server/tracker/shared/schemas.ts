import { z } from 'zod'

// ─── Entries ──────────────────────────────────────────────────────────────────

export const entryInputSchema = z.object({
  description: z.string().trim().min(1),
  projectId: z.string().min(1),
  tagIds: z.array(z.string().min(1)).default([]),
  billable: z.boolean().default(false),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  durationSeconds: z.number().int().min(0),
  notes: z.string().trim().default(''),
})

export const startTimerSchema = z.object({
  description: z.string().trim().default(''),
  projectId: z.string().default(''),
  tagIds: z.array(z.string().min(1)).default([]),
  billable: z.boolean().default(false),
})

export const updateActiveTimerSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().default(''),
  projectId: z.string().default(''),
  tagIds: z.array(z.string().min(1)).default([]),
  billable: z.boolean().default(false),
  startedAt: z.string().datetime().optional(),
})

export const entryIdSchema = z.object({
  id: z.string().min(1),
})

export const updateEntrySchema = entryInputSchema.extend({
  id: z.string().min(1),
})

// ─── Analytics ────────────────────────────────────────────────────────────────

export const analyticsRangeSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  scope: z.enum(['personal', 'organization', 'department']).optional(),
  projectId: z.string().optional(),
  clientId: z.string().optional(),
  tagIds: z.string().optional(), // comma-separated tag IDs
  memberIds: z.string().optional(), // comma-separated member IDs
  billable: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).optional(),
})

export const calendarMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
})

// ─── Roles + members ──────────────────────────────────────────────────────────

export const inviteMemberSchema = z.object({
  email: z.string().trim().email(),
  workspaceRoleId: z.string().min(1),
  departmentId: z.string().optional(),
})

export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  permissionLevel: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE']),
  color: z.string().default('#6366f1'),
})

export const updateWorkspaceMemberSchema = z.object({
  memberId: z.string().min(1),
  workspaceRoleId: z.string().optional(),
  departmentId: z.string().optional(),
  cohortIds: z.array(z.string().min(1)).optional(),
})

export const setMemberStatusSchema = z.object({
  memberId: z.string().min(1),
  status: z.enum(['ACTIVE', 'DISABLED']),
})

export const memberIdSchema = z.object({
  memberId: z.string().min(1),
})

// ─── Catalogs ─────────────────────────────────────────────────────────────────

export const idSchema = z.object({ id: z.string().min(1) })

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().default('#2563eb'),
  clientId: z.string().min(1),
})

export const updateProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  color: z.string(),
  clientId: z.string().min(1),
})

export const createClientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  clientStatus: z.enum(['ACTIVE', 'INACTIVE']).optional(),
})

export const updateClientSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  clientStatus: z.enum(['ACTIVE', 'INACTIVE']),
})

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().default('#14b8a6'),
})

export const updateTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  color: z.string(),
})

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().optional(),
  color: z.string().default('#6366f1'),
})

export const updateDepartmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().optional(),
  color: z.string().optional(),
  headMemberId: z.string().optional(),
})

export const createCohortSchema = z.object({
  name: z.string().trim().min(1).max(120),
  departmentId: z.string().min(1),
})

export const updateCohortSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  departmentId: z.string().min(1),
})

// ─── Billing ──────────────────────────────────────────────────────────────────

export const updateWorkspaceBillingSchema = z.object({
  defaultBillableRate: z.number().finite().min(0),
  billableCurrency: z.string().trim().min(3).max(8),
})

export const updateMemberBillableRateSchema = z.object({
  memberId: z.string().min(1),
  billableRate: z.number().finite().min(0).nullable(),
})

// ─── Member detail (employee profile + gov't IDs) ─────────────────────────────

export const employeeProfileSchema = z.object({
  employeeNumber: z.string().trim().max(50).optional().or(z.literal('')),
  positionTitle: z.string().trim().max(100).optional().or(z.literal('')),
  employmentType: z
    .enum(['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN', 'PROBATIONARY'])
    .optional(),
  employmentStatus: z
    .enum(['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED'])
    .optional(),
  hireDate: z.string().date().optional().or(z.literal('')),
  regularizationDate: z.string().date().optional().or(z.literal('')),
  separationDate: z.string().date().optional().or(z.literal('')),
})

export const governmentIdsSchema = z.object({
  sssNumber: z.string().trim().max(25).optional().or(z.literal('')),
  philHealthNumber: z.string().trim().max(25).optional().or(z.literal('')),
  tinNumber: z.string().trim().max(25).optional().or(z.literal('')),
  pagIbigNumber: z.string().trim().max(25).optional().or(z.literal('')),
})

export const updateMemberDetailSchema = z.object({
  memberId: z.string().min(1),
  employeeProfile: employeeProfileSchema.optional(),
  governmentIds: governmentIdsSchema.optional(),
})

// ─── User profile ─────────────────────────────────────────────────────────────

export const addressSchema = z.object({
  buildingNo: z.string().trim().max(50).optional().or(z.literal('')),
  street: z.string().trim().max(100).optional().or(z.literal('')),
  city: z.string().trim().max(100).optional().or(z.literal('')),
  province: z.string().trim().max(100).optional().or(z.literal('')),
  postalCode: z.string().trim().max(20).optional().or(z.literal('')),
  country: z.string().trim().max(100).default('Philippines'),
})

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(150),
  firstName: z.string().trim().min(1).max(50),
  middleName: z.string().trim().max(50).optional().or(z.literal('')),
  lastName: z.string().trim().min(1).max(50),
  contactNumber: z.string().trim().max(50).optional().or(z.literal('')),
  birthDate: z.string().date().optional().or(z.literal('')),
  gender: z
    .enum(['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'])
    .optional()
    .or(z.literal('')),
  maritalStatus: z
    .enum(['SINGLE', 'MARRIED', 'SEPARATED', 'WIDOWED', 'DIVORCED'])
    .optional()
    .or(z.literal('')),
  avatarUrl: z.string().url().max(500).optional().or(z.literal('')),
  address: addressSchema.optional(),
})

// ─── Workspace settings ───────────────────────────────────────────────────────

export const updateWorkspaceSettingsSchema = z.object({
  name: z.string().trim().min(1).max(150),
  timezone: z.string().trim().min(1).max(80),
})

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const inviteMemberSchema = z.object({
  email: z.string().trim().email(),
  workspaceRoleId: z.string().min(1),
  departmentId: z.string().optional(),
})

const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  permissionLevel: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE']),
  color: z.string().default('#6366f1'),
})

const entryInputSchema = z.object({
  description: z.string().trim().min(1),
  projectId: z.string().min(1),
  tagIds: z.array(z.string().min(1)).default([]),
  billable: z.boolean().default(false),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  durationSeconds: z.number().int().min(0),
  notes: z.string().trim().default(''),
})

const startTimerSchema = z.object({
  description: z.string().trim().default(''),
  projectId: z.string().default(''),
  tagIds: z.array(z.string().min(1)).default([]),
  billable: z.boolean().default(false),
})

const updateActiveTimerSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().default(''),
  projectId: z.string().default(''),
  tagIds: z.array(z.string().min(1)).default([]),
  billable: z.boolean().default(false),
  startedAt: z.string().datetime().optional(),
})

const entryIdSchema = z.object({
  id: z.string().min(1),
})

const stopTimerSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().optional(),
  projectId: z.string().optional(),
  tagIds: z.array(z.string().min(1)).optional(),
  billable: z.boolean().optional(),
})

const updateEntrySchema = entryInputSchema.extend({
  id: z.string().min(1),
})

const analyticsRangeSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  scope: z.enum(['personal', 'organization', 'department']).optional(),
  projectId: z.string().optional(),
  clientId: z.string().optional(),
  tagIds: z.string().optional(),
  memberIds: z.string().optional(),
  billable: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).optional(),
})

const calendarMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
})

const paginatedEntriesSchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const departmentDashboardSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
})

const memberMonthlyReportSchema = z.object({
  memberId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
})

const paginatedMembersSchema = z.object({
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
  search: z.string().optional(),
  roleId: z.string().optional(),
  departmentId: z.string().optional(),
  cohortId: z.string().optional(),
  status: z.string().optional(),
})

export const getTrackerStateFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getTrackerState } = await import('./tracker.server')
    return getTrackerState()
  },
)

/**
 * Lite version — skips the time-entry query entirely.
 * Use on every route that does NOT render the timer dashboard:
 * analytics, catalogs, members, settings, profile.
 */
export const getTrackerStateLiteFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getTrackerStateLite } = await import('./tracker/state-lite.server')
    return getTrackerStateLite()
  },
)

export const getMemberAnalyticsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getMemberAnalytics } = await import('./tracker.server')
    return getMemberAnalytics()
  },
)

export const getPaginatedMembersFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => paginatedMembersSchema.parse(input))
  .handler(async ({ data }) => {
    const { getPaginatedMembers } = await import('./tracker.server')
    return getPaginatedMembers(data)
  })

export const getAnalyticsFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => analyticsRangeSchema.parse(input))
  .handler(async ({ data }) => {
    const { getAnalytics } = await import('./tracker.server')
    return getAnalytics(data)
  })

export const getCalendarEntriesFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => calendarMonthSchema.parse(input))
  .handler(async ({ data }) => {
    const { getCalendarEntries } = await import('./tracker.server')
    return getCalendarEntries(data)
  })

export const getPaginatedEntriesFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => paginatedEntriesSchema.parse(input))
  .handler(async ({ data }) => {
    const { getPaginatedEntries } = await import('./tracker.server')
    return getPaginatedEntries(data)
  })

export const getDepartmentDashboardFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => departmentDashboardSchema.parse(input))
  .handler(async ({ data }) => {
    const { getDepartmentDashboard } = await import('./tracker.server')
    return getDepartmentDashboard(data)
  })

export const getMemberMonthlyReportFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => memberMonthlyReportSchema.parse(input))
  .handler(async ({ data }) => {
    const { getMemberMonthlyReport } = await import('./tracker.server')
    return getMemberMonthlyReport(data)
  })

export const exportMembersCsvFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    const { exportMembersCsv } = await import('./tracker/export.server')
    return exportMembersCsv()
  },
)

export const exportAnalyticsCsvFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => analyticsRangeSchema.parse(input))
  .handler(async ({ data }) => {
    const { exportAnalyticsCsv } = await import('./tracker/export.server')
    return exportAnalyticsCsv(data)
  })

export const startTimerFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => startTimerSchema.parse(input))
  .handler(async ({ data }) => {
    const { startTimer } = await import('./tracker.server')
    return startTimer(data)
  })

export const stopTimerFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => stopTimerSchema.parse(input))
  .handler(async ({ data }) => {
    const { stopTimer } = await import('./tracker.server')
    return stopTimer(data)
  })

export const updateActiveTimerFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateActiveTimerSchema.parse(input))
  .handler(async ({ data }) => {
    const { updateActiveTimer } = await import('./tracker.server')
    return updateActiveTimer(data)
  })

export const createManualEntryFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => entryInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { createManualEntry } = await import('./tracker.server')
    return createManualEntry(data)
  })

export const updateEntryFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateEntrySchema.parse(input))
  .handler(async ({ data }) => {
    const { updateEntry } = await import('./tracker.server')
    return updateEntry(data)
  })

export const deleteEntryFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => entryIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { deleteEntry } = await import('./tracker.server')
    return deleteEntry(data)
  })

export const duplicateEntryFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => entryIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { duplicateEntry } = await import('./tracker.server')
    return duplicateEntry(data)
  })

export const createWorkspaceMemberFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => inviteMemberSchema.parse(input))
  .handler(async ({ data }) => {
    const { createWorkspaceMember } = await import('./tracker.server')
    return createWorkspaceMember(data)
  })

export const createWorkspaceRoleFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => createRoleSchema.parse(input))
  .handler(async ({ data }) => {
    const { createWorkspaceRole } = await import('./tracker.server')
    return createWorkspaceRole(data)
  })

// ─── Projects ────────────────────────────────────────────────────────────────

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().default('#2563eb'),
  clientId: z.string().min(1),
})

const updateProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  color: z.string(),
  clientId: z.string().min(1),
})

const idSchema = z.object({ id: z.string().min(1) })
const bulkIdsSchema = z.object({ ids: z.array(z.string()).min(1) })

// ─── Clients ─────────────────────────────────────────────────────────────────

const createClientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  clientStatus: z.enum(['ACTIVE', 'INACTIVE']).optional(),
})

const updateClientSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  clientStatus: z.enum(['ACTIVE', 'INACTIVE']),
})

export const createClientFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => createClientSchema.parse(input))
  .handler(async ({ data }) => {
    const { createClient } = await import('./tracker.server')
    return createClient(data)
  })

export const updateClientFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateClientSchema.parse(input))
  .handler(async ({ data }) => {
    const { updateClient } = await import('./tracker.server')
    return updateClient(data)
  })

export const archiveClientFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data }) => {
    const { archiveClient } = await import('./tracker.server')
    return archiveClient(data)
  })

export const activateClientFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data }) => {
    const { activateClient } = await import('./tracker.server')
    return activateClient(data)
  })

export const bulkArchiveClientsFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => bulkIdsSchema.parse(input))
  .handler(async ({ data }) => {
    const { bulkArchiveClients } = await import('./tracker.server')
    return bulkArchiveClients(data)
  })

export const bulkActivateClientsFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => bulkIdsSchema.parse(input))
  .handler(async ({ data }) => {
    const { bulkActivateClients } = await import('./tracker.server')
    return bulkActivateClients(data)
  })

export const createProjectFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => createProjectSchema.parse(input))
  .handler(async ({ data }) => {
    const { createProject } = await import('./tracker.server')
    return createProject(data)
  })

export const updateProjectFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateProjectSchema.parse(input))
  .handler(async ({ data }) => {
    const { updateProject } = await import('./tracker.server')
    return updateProject(data)
  })

export const archiveProjectFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data }) => {
    const { archiveProject } = await import('./tracker.server')
    return archiveProject(data)
  })

export const activateProjectFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data }) => {
    const { activateProject } = await import('./tracker.server')
    return activateProject(data)
  })

export const bulkArchiveProjectsFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => bulkIdsSchema.parse(input))
  .handler(async ({ data }) => {
    const { bulkArchiveProjects } = await import('./tracker.server')
    return bulkArchiveProjects(data)
  })

export const bulkActivateProjectsFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => bulkIdsSchema.parse(input))
  .handler(async ({ data }) => {
    const { bulkActivateProjects } = await import('./tracker.server')
    return bulkActivateProjects(data)
  })

// ─── Tags ─────────────────────────────────────────────────────────────────────

const createTagSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().default('#14b8a6'),
})

const updateTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  color: z.string(),
})

export const createTagFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => createTagSchema.parse(input))
  .handler(async ({ data }) => {
    const { createTag } = await import('./tracker.server')
    return createTag(data)
  })

export const updateTagFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateTagSchema.parse(input))
  .handler(async ({ data }) => {
    const { updateTag } = await import('./tracker.server')
    return updateTag(data)
  })

export const archiveTagFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data }) => {
    const { archiveTag } = await import('./tracker.server')
    return archiveTag(data)
  })

export const activateTagFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data }) => {
    const { activateTag } = await import('./tracker.server')
    return activateTag(data)
  })

export const bulkArchiveTagsFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => bulkIdsSchema.parse(input))
  .handler(async ({ data }) => {
    const { bulkArchiveTags } = await import('./tracker.server')
    return bulkArchiveTags(data)
  })

export const bulkActivateTagsFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => bulkIdsSchema.parse(input))
  .handler(async ({ data }) => {
    const { bulkActivateTags } = await import('./tracker.server')
    return bulkActivateTags(data)
  })

// ─── Departments ──────────────────────────────────────────────────────────────

const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().optional(),
  color: z.string().default('#6366f1'),
})

const updateDepartmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().optional(),
  color: z.string().optional(),
  headMemberId: z.string().optional(),
})

export const createDepartmentFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => createDepartmentSchema.parse(input))
  .handler(async ({ data }) => {
    const { createDepartment } = await import('./tracker.server')
    return createDepartment(data)
  })

export const updateDepartmentFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateDepartmentSchema.parse(input))
  .handler(async ({ data }) => {
    const { updateDepartment } = await import('./tracker.server')
    return updateDepartment(data)
  })

export const deleteDepartmentFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data }) => {
    const { deleteDepartment } = await import('./tracker.server')
    return deleteDepartment(data)
  })

// ─── Cohorts ──────────────────────────────────────────────────────────────────

const createCohortSchema = z.object({
  name: z.string().trim().min(1).max(120),
  departmentId: z.string().min(1),
})

const updateCohortSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  departmentId: z.string().min(1),
})

export const createCohortFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => createCohortSchema.parse(input))
  .handler(async ({ data }) => {
    const { createCohort } = await import('./tracker.server')
    return createCohort(data)
  })

export const updateCohortFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateCohortSchema.parse(input))
  .handler(async ({ data }) => {
    const { updateCohort } = await import('./tracker.server')
    return updateCohort(data)
  })

export const deleteCohortFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data }) => {
    const { deleteCohort } = await import('./tracker.server')
    return deleteCohort(data)
  })

// ─── Member management ────────────────────────────────────────────────────────

const updateWorkspaceMemberSchema = z.object({
  memberId: z.string().min(1),
  workspaceRoleId: z.string().optional(),
  departmentId: z.string().optional(),
  cohortIds: z.array(z.string().min(1)).optional(),
})

const setMemberStatusSchema = z.object({
  memberId: z.string().min(1),
  status: z.enum(['ACTIVE', 'DISABLED']),
})

const updateWorkspaceBillingSchema = z.object({
  defaultBillableRate: z.number().finite().min(0),
  billableCurrency: z.string().trim().min(3).max(8),
})

const updateMemberBillableRateSchema = z.object({
  memberId: z.string().min(1),
  billableRate: z.number().finite().min(0).nullable(),
})

const memberIdSchema = z.object({
  memberId: z.string().min(1),
})

const employeeProfileSchema = z.object({
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

const governmentIdsSchema = z.object({
  sssNumber: z.string().trim().max(25).optional().or(z.literal('')),
  philHealthNumber: z.string().trim().max(25).optional().or(z.literal('')),
  tinNumber: z.string().trim().max(25).optional().or(z.literal('')),
  pagIbigNumber: z.string().trim().max(25).optional().or(z.literal('')),
})

const updateMemberDetailSchema = z.object({
  memberId: z.string().min(1),
  employeeProfile: employeeProfileSchema.optional(),
  governmentIds: governmentIdsSchema.optional(),
})

export const updateWorkspaceMemberFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateWorkspaceMemberSchema.parse(input))
  .handler(async ({ data }) => {
    const { updateWorkspaceMember } = await import('./tracker.server')
    return updateWorkspaceMember(data)
  })

export const setMemberStatusFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => setMemberStatusSchema.parse(input))
  .handler(async ({ data }) => {
    const { setMemberStatus } = await import('./tracker.server')
    return setMemberStatus(data)
  })

export const updateWorkspaceBillingFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateWorkspaceBillingSchema.parse(input))
  .handler(async ({ data }) => {
    const { updateWorkspaceBilling } = await import('./tracker.server')
    return updateWorkspaceBilling(data)
  })

export const updateMemberBillableRateFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateMemberBillableRateSchema.parse(input))
  .handler(async ({ data }) => {
    const { updateMemberBillableRate } = await import('./tracker.server')
    return updateMemberBillableRate(data)
  })

export const getMemberDetailFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => memberIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { getMemberDetail } = await import('./tracker.server')
    return getMemberDetail(data)
  })

export const getCurrencyOptionsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getCurrencyOptions } = await import('./tracker.server')
    return getCurrencyOptions()
  },
)

export const updateMemberDetailFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateMemberDetailSchema.parse(input))
  .handler(async ({ data }) => {
    const { updateMemberDetail } = await import('./tracker.server')
    return updateMemberDetail(data)
  })

// ─── Profile update ───────────────────────────────────────────────────────────

const addressSchema = z.object({
  buildingNo: z.string().trim().max(50).optional().or(z.literal('')),
  street: z.string().trim().max(100).optional().or(z.literal('')),
  city: z.string().trim().max(100).optional().or(z.literal('')),
  province: z.string().trim().max(100).optional().or(z.literal('')),
  postalCode: z.string().trim().max(20).optional().or(z.literal('')),
  country: z.string().trim().max(100).default('Philippines'),
})

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(150),
  firstName: z.string().trim().min(1).max(50),
  middleName: z.string().trim().max(50).optional().or(z.literal('')),
  lastName: z.string().trim().min(1).max(50),
  contactNumber: z.string().trim().max(50).optional(),
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

export const updateProfileFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateProfileSchema.parse(input))
  .handler(async ({ data }) => {
    const { updateProfile } = await import('./tracker.server')
    return updateProfile(data)
  })

export const getSelfProfileFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getSelfProfile } = await import('./tracker.server')
    return getSelfProfile()
  },
)

export const isImageKitConfiguredFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  return !!(
    process.env.IMAGEKIT_PRIVATE_KEY &&
    process.env.IMAGEKIT_PUBLIC_KEY &&
    process.env.IMAGEKIT_URL_ENDPOINT
  )
})

export const getImageKitTokenFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { requireWorkspaceAccess } = await import('./workspace-access.server')
  await requireWorkspaceAccess()

  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY!
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY!
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT!

  const { createHmac, randomUUID } = await import('node:crypto')
  const token = randomUUID()
  const expire = Math.floor(Date.now() / 1000) + 30 * 60
  const signature = createHmac('sha1', privateKey)
    .update(token + expire)
    .digest('hex')

  return { token, expire, signature, publicKey, urlEndpoint }
})

// ─── Workspace settings ───────────────────────────────────────────────────────

const updateWorkspaceSettingsSchema = z.object({
  name: z.string().trim().min(1).max(150),
  timezone: z.string().trim().min(1).max(80),
})

export const updateWorkspaceSettingsFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateWorkspaceSettingsSchema.parse(input))
  .handler(async ({ data }) => {
    const { updateWorkspaceSettings } = await import('./tracker.server')
    return updateWorkspaceSettings(data)
  })

// ─── My Performance ───────────────────────────────────────────────────────────

const shareTokenSchema = z.object({ token: z.string().min(64).max(64) })

export const getMyPerformanceFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getMyPerformance } = await import('./tracker/performance.server')
    return getMyPerformance()
  },
)

export const generateShareTokenFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    const { generateShareToken } = await import('./tracker/performance.server')
    return generateShareToken()
  },
)

export const revokeShareTokenFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    const { revokeShareToken } = await import('./tracker/performance.server')
    return revokeShareToken()
  },
)

export const getPublicPerformanceFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => shareTokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { getPublicPerformance } =
      await import('./tracker/performance.server')
    return getPublicPerformance(data.token)
  })

// ─── Workspace Activity ───────────────────────────────────────────────────────

export const getWorkspaceActivityFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getWorkspaceActivity } = await import('./tracker/activity.server')
    return getWorkspaceActivity()
  },
)

// ─── Audit Logs ───────────────────────────────────────────────────────────────

const auditLogFiltersSchema = z.object({
  action: z.string().optional(),
  actorEmail: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  page: z.number().optional(),
})

export const getAuditLogsFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => auditLogFiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const { getWorkspaceAuditLogs } =
      await import('./tracker/audit/audit-logger.server')
    return getWorkspaceAuditLogs(data)
  })

// ─── Paginated Catalogs ───────────────────────────────────────────────────────

const paginatedCatalogBaseSchema = z.object({
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1).max(100),
  search: z.string().optional(),
})

export const getPaginatedClientsFn = createServerFn({ method: 'GET' })
  .inputValidator((input) =>
    paginatedCatalogBaseSchema
      .extend({ status: z.string().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getPaginatedClients } =
      await import('./tracker/catalogs/paginated.server')
    return getPaginatedClients(data)
  })

export const getPaginatedProjectsFn = createServerFn({ method: 'GET' })
  .inputValidator((input) =>
    paginatedCatalogBaseSchema
      .extend({
        clientId: z.string().optional(),
        includeArchived: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getPaginatedProjects } =
      await import('./tracker/catalogs/paginated.server')
    return getPaginatedProjects(data)
  })

export const getPaginatedTagsFn = createServerFn({ method: 'GET' })
  .inputValidator((input) =>
    paginatedCatalogBaseSchema
      .extend({ includeArchived: z.boolean().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getPaginatedTags } =
      await import('./tracker/catalogs/paginated.server')
    return getPaginatedTags(data)
  })

export const getPaginatedDepartmentsFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => paginatedCatalogBaseSchema.parse(input))
  .handler(async ({ data }) => {
    const { getPaginatedDepartments } =
      await import('./tracker/catalogs/paginated.server')
    return getPaginatedDepartments(data)
  })

export const getPaginatedCohortsFn = createServerFn({ method: 'GET' })
  .inputValidator((input) =>
    paginatedCatalogBaseSchema
      .extend({ departmentId: z.string().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getPaginatedCohorts } =
      await import('./tracker/catalogs/paginated.server')
    return getPaginatedCohorts(data)
  })

export const getPaginatedRolesFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => paginatedCatalogBaseSchema.parse(input))
  .handler(async ({ data }) => {
    const { getPaginatedRoles } =
      await import('./tracker/catalogs/paginated.server')
    return getPaginatedRoles(data)
  })

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  entryIdSchema,
  entryInputSchema,
  bulkEntryIdsSchema,
  overlapCheckSchema,
  startTimerSchema,
  stopTimerSchema,
  updateActiveTimerSchema,
  updateEntrySchema,
} from './tracker/shared/schemas'
import {
  exportSortByValues,
  exportSortOrderValues,
} from '#/lib/time-tracker/export-sort'

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
  pageSize: z.coerce.number().int().min(10).max(100).optional(),
})

const analyticsOverviewSchema = z.object({
  scope: z.enum(['personal', 'organization', 'department']).optional(),
  asOfDate: z.string().date().optional(),
})

const calendarMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
})

const departmentMemberCalendarSchema = calendarMonthSchema.extend({
  memberId: z.string().min(1),
})

const paginatedEntriesSchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
})

const departmentDashboardSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  departmentId: z.string().optional(),
  q: z.string().trim().max(120).optional(),
  projectPage: z.coerce.number().int().min(1).optional(),
})

const departmentMemberActivitySchema = z.object({
  memberId: z.string().min(1),
})

const departmentMemberDetailSchema = z.object({
  memberId: z.string().min(1),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  page: z.coerce.number().int().min(1).optional(),
})

const workspaceActivitySchema = z.object({
  departmentId: z.string().optional(),
  q: z.string().trim().max(120).optional(),
})

const reportSortSchema = z.object({
  sortBy: z.enum(exportSortByValues).optional(),
  sortOrder: z.enum(exportSortOrderValues).optional(),
})

const memberMonthlyReportSchema = z
  .object({
    memberId: z.string().min(1),
    startDate: z.string().date(), // YYYY-MM-DD
    endDate: z.string().date(), // YYYY-MM-DD
  })
  .merge(reportSortSchema)

const bulkReportSchema = z
  .object({
    startDate: z.string().date(), // YYYY-MM-DD
    endDate: z.string().date(), // YYYY-MM-DD
    scopeType: z.enum(['all', 'client', 'department', 'tag']),
    scopeId: z.string().optional(),
    memberId: z.string().optional(),
    clientId: z.string().optional(),
  })
  .merge(reportSortSchema)

export const timerPresetInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  clientId: z.string().min(1),
  projectId: z.string().min(1),
  taskId: z.string().nullable().default(null),
  tagIds: z.array(z.string().min(1)).default([]),
  billable: z.boolean().default(false),
})

export const timerPresetIdSchema = z.object({
  id: z.string().min(1),
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

export const getAnalyticsOverviewFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => analyticsOverviewSchema.parse(input))
  .handler(async ({ data }) => {
    const { getAnalyticsOverview } = await import('./tracker.server')
    return getAnalyticsOverview(data)
  })

export const getCalendarEntriesFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => calendarMonthSchema.parse(input))
  .handler(async ({ data }) => {
    const { getCalendarEntries } = await import('./tracker.server')
    return getCalendarEntries(data)
  })

export const getDepartmentMemberCalendarEntriesFn = createServerFn({
  method: 'GET',
})
  .inputValidator((input) => departmentMemberCalendarSchema.parse(input))
  .handler(async ({ data }) => {
    const { getDepartmentMemberCalendarEntries } =
      await import('./tracker.server')
    return getDepartmentMemberCalendarEntries(data)
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

export const getDepartmentMemberTodayActivityFn = createServerFn({
  method: 'GET',
})
  .inputValidator((input) => departmentMemberActivitySchema.parse(input))
  .handler(async ({ data }) => {
    const { getDepartmentMemberTodayActivity } =
      await import('./tracker.server')
    return getDepartmentMemberTodayActivity(data)
  })

export const getDepartmentMemberDetailFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => departmentMemberDetailSchema.parse(input))
  .handler(async ({ data }) => {
    const { getDepartmentMemberDetail } = await import('./tracker.server')
    return getDepartmentMemberDetail(data)
  })

export const getMemberMonthlyReportFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => memberMonthlyReportSchema.parse(input))
  .handler(async ({ data }) => {
    const { getMemberMonthlyReport } = await import('./tracker.server')
    return getMemberMonthlyReport(data)
  })

export const getMemberReportOngoingTaskSummaryFn = createServerFn({
  method: 'GET',
})
  .inputValidator((input) => memberMonthlyReportSchema.parse(input))
  .handler(async ({ data }) => {
    const { getMemberReportOngoingTaskSummary } =
      await import('./tracker.server')
    return getMemberReportOngoingTaskSummary(data)
  })

export const getBulkReportFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => bulkReportSchema.parse(input))
  .handler(async ({ data }) => {
    const { getBulkReport } = await import('./tracker.server')
    return getBulkReport(data)
  })

export const getBulkReportOngoingTaskSummaryFn = createServerFn({
  method: 'GET',
})
  .inputValidator((input) => bulkReportSchema.parse(input))
  .handler(async ({ data }) => {
    const { getBulkReportOngoingTaskSummary } = await import('./tracker.server')
    return getBulkReportOngoingTaskSummary(data)
  })

export const exportAnalyticsCsvFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => analyticsRangeSchema.parse(input))
  .handler(async ({ data }) => {
    const { exportAnalyticsCsv } = await import('./tracker/export.server')
    return exportAnalyticsCsv(data)
  })

export const checkTimeEntryOverlapFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => overlapCheckSchema.parse(input))
  .handler(async ({ data }) => {
    const { checkTimeEntryOverlap } = await import('./tracker.server')
    return checkTimeEntryOverlap(data)
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

export const updateWorkspaceMemberEntryFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateEntrySchema.parse(input))
  .handler(async ({ data }) => {
    const { updateWorkspaceMemberEntry } = await import('./tracker.server')
    return updateWorkspaceMemberEntry(data)
  })

export const deleteEntryFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => entryIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { deleteEntry } = await import('./tracker.server')
    return deleteEntry(data)
  })

export const deleteWorkspaceMemberEntryFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => entryIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { deleteWorkspaceMemberEntry } = await import('./tracker.server')
    return deleteWorkspaceMemberEntry(data)
  })

export const bulkDeleteWorkspaceMemberEntriesFn = createServerFn({
  method: 'POST',
})
  .inputValidator((input) => bulkEntryIdsSchema.parse(input))
  .handler(async ({ data }) => {
    const { bulkDeleteWorkspaceMemberEntries } =
      await import('./tracker.server')
    return bulkDeleteWorkspaceMemberEntries(data)
  })

export const duplicateEntryFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => entryIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { duplicateEntry } = await import('./tracker.server')
    return duplicateEntry(data)
  })

export const listTimerPresetsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { listTimerPresets } = await import('./tracker/presets.server')
    return listTimerPresets()
  },
)

export const saveTimerPresetFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => timerPresetInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { saveTimerPreset } = await import('./tracker/presets.server')
    return saveTimerPreset(data)
  })

export const deleteTimerPresetFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => timerPresetIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { deleteTimerPreset } = await import('./tracker/presets.server')
    return deleteTimerPreset(data)
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
  clientStatus: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  defaultBillableRate: z.number().finite().min(0).nullable().optional(),
})

const updateClientSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  clientStatus: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  defaultBillableRate: z.number().finite().min(0).nullable(),
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

export const suspendClientFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data }) => {
    const { suspendClient } = await import('./tracker.server')
    return suspendClient(data)
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

export const bulkSuspendClientsFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => bulkIdsSchema.parse(input))
  .handler(async ({ data }) => {
    const { bulkSuspendClients } = await import('./tracker.server')
    return bulkSuspendClients(data)
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

const setMemberClientBillableRateSchema = z.object({
  memberId: z.string().min(1),
  clientId: z.string().min(1),
  billableRate: z.number().finite().min(0),
  effectiveFrom: z.string().date(),
})

const unsetMemberClientBillableRateSchema = z.object({
  memberId: z.string().min(1),
  clientId: z.string().min(1),
  effectiveFrom: z.string().date(),
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

export const getMemberClientBillableRatesFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => memberIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { getMemberClientBillableRates } = await import('./tracker.server')
    return getMemberClientBillableRates(data)
  })

export const setMemberClientBillableRateFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => setMemberClientBillableRateSchema.parse(input))
  .handler(async ({ data }) => {
    const { setMemberClientBillableRate } = await import('./tracker.server')
    return setMemberClientBillableRate(data)
  })

export const unsetMemberClientBillableRateFn = createServerFn({
  method: 'POST',
})
  .inputValidator((input) => unsetMemberClientBillableRateSchema.parse(input))
  .handler(async ({ data }) => {
    const { unsetMemberClientBillableRate } = await import('./tracker.server')
    return unsetMemberClientBillableRate(data)
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
  positionTitle: z.string().trim().max(100).optional().or(z.literal('')),
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

export const getWorkspaceActivityFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => workspaceActivitySchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { getWorkspaceActivity } = await import('./tracker/activity.server')
    return getWorkspaceActivity(data)
  })

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

const nameSortSchema = z.enum(['name_asc', 'name_desc']).optional()

export const getPaginatedClientsFn = createServerFn({ method: 'GET' })
  .inputValidator((input) =>
    paginatedCatalogBaseSchema
      .extend({ status: z.string().optional(), sort: nameSortSchema })
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
        sort: nameSortSchema,
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
      .extend({ includeArchived: z.boolean().optional(), sort: nameSortSchema })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getPaginatedTags } =
      await import('./tracker/catalogs/paginated.server')
    return getPaginatedTags(data)
  })

export const getPaginatedDepartmentsFn = createServerFn({ method: 'GET' })
  .inputValidator((input) =>
    paginatedCatalogBaseSchema
      .extend({
        hasDescription: z.enum(['yes', 'no']).optional(),
        hasMembers: z.enum(['yes', 'no']).optional(),
        sort: z
          .enum(['name_asc', 'name_desc', 'members_desc', 'members_asc'])
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getPaginatedDepartments } =
      await import('./tracker/catalogs/paginated.server')
    return getPaginatedDepartments(data)
  })

export const getPaginatedCohortsFn = createServerFn({ method: 'GET' })
  .inputValidator((input) =>
    paginatedCatalogBaseSchema
      .extend({ departmentId: z.string().optional(), sort: nameSortSchema })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getPaginatedCohorts } =
      await import('./tracker/catalogs/paginated.server')
    return getPaginatedCohorts(data)
  })

export const getPaginatedRolesFn = createServerFn({ method: 'GET' })
  .inputValidator((input) =>
    paginatedCatalogBaseSchema
      .extend({
        permissionLevel: z
          .enum(['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE'])
          .optional(),
        sort: z.enum(['permission', 'name_asc', 'name_desc']).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getPaginatedRoles } =
      await import('./tracker/catalogs/paginated.server')
    return getPaginatedRoles(data)
  })

// ─── Project Tasks ─────────────────────────────────────────────────────────────

const createTaskSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
})

const updateTaskSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
})

export const createTaskFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => createTaskSchema.parse(input))
  .handler(async ({ data }) => {
    const { createTask } = await import('./tracker.server')
    return createTask(data)
  })

export const updateTaskFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateTaskSchema.parse(input))
  .handler(async ({ data }) => {
    const { updateTask } = await import('./tracker.server')
    return updateTask(data)
  })

export const archiveTaskFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data }) => {
    const { archiveTask } = await import('./tracker.server')
    return archiveTask(data)
  })

export const activateTaskFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data }) => {
    const { activateTask } = await import('./tracker.server')
    return activateTask(data)
  })

export const deleteTaskFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data }) => {
    const { deleteTask } = await import('./tracker.server')
    return deleteTask(data)
  })

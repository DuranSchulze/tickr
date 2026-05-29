import '@tanstack/react-start/server-only'

// This file is the public surface for tracker server functions. The
// implementation lives in `./tracker/**`, organized by domain. Add new
// re-exports here when introducing new server-side handlers.

export { getTrackerState } from './tracker/state.server'
export {
  startTimer,
  stopTimer,
  duplicateEntry,
  updateActiveTimer,
} from './tracker/timer.server'
export {
  createManualEntry,
  updateEntry,
  deleteEntry,
} from './tracker/manual-entries.server'

// Catalogs
export {
  createProject,
  updateProject,
  archiveProject,
  activateProject,
  bulkArchiveProjects,
  bulkActivateProjects,
} from './tracker/catalogs/projects.server'
export {
  createClient,
  updateClient,
  archiveClient,
  activateClient,
  bulkArchiveClients,
  bulkActivateClients,
} from './tracker/catalogs/clients.server'
export {
  createTag,
  updateTag,
  archiveTag,
  activateTag,
  bulkArchiveTags,
  bulkActivateTags,
} from './tracker/catalogs/tags.server'
export {
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from './tracker/catalogs/departments.server'
export {
  createCohort,
  updateCohort,
  deleteCohort,
} from './tracker/catalogs/cohorts.server'

// Members
export {
  createWorkspaceMember,
  updateWorkspaceMember,
  setMemberStatus,
} from './tracker/members/members.server'
export {
  getMemberDetail,
  updateMemberDetail,
} from './tracker/members/member-detail.server'
export { updateMemberBillableRate } from './tracker/members/member-billing.server'
export {
  getMemberAnalytics,
  type MemberStat,
} from './tracker/members/member-analytics.server'
export {
  getPaginatedMembers,
  type PaginatedMembersResult,
  type GetPaginatedMembersInput,
} from './tracker/members/paginated-members.server'

// Roles, billing, settings, profile
export { createWorkspaceRole } from './tracker/roles.server'
export {
  updateWorkspaceBilling,
  getCurrencyOptions,
} from './tracker/workspace-billing.server'
export { updateProfile, getSelfProfile } from './tracker/profile.server'
export { updateWorkspaceSettings } from './tracker/workspace-settings.server'

// Analytics
export {
  getAnalytics,
  type AnalyticsScope,
  type AnalyticsSelectedScope,
  type AnalyticsPayload,
} from './tracker/analytics.server'
export {
  getCalendarEntries,
  type CalendarEntriesPayload,
  type CalendarEntry,
} from './tracker/calendar.server'
export {
  getPaginatedEntries,
  type PaginatedEntriesResult,
} from './tracker/entries-list.server'
export {
  getDepartmentDashboard,
  type DepartmentDashboard,
  type DepartmentMemberBreakdown,
  type DepartmentProjectBreakdown,
} from './tracker/department-dashboard.server'
export {
  getMemberMonthlyReport,
  type MemberMonthlyReport,
  type MemberMonthlyReportEntry,
} from './tracker/member-report.server'

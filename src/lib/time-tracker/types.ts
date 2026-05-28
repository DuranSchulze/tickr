export type RolePermission = 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE'

export type ViewMode = 'day' | 'week' | 'month' | 'all'

export type Workspace = {
  id: string
  name: string
  timezone: string
  defaultBillableRate: number
  billableCurrency: string
  googleSheetUrl: string | null
  googleSheetSyncedAt: string | null
}

export type WorkspaceRole = {
  id: string
  name: string
  permissionLevel: RolePermission
  color: string
}

export type Department = {
  id: string
  name: string
  description: string
  color: string
}

export type Cohort = {
  id: string
  name: string
  departmentId: string
}

export type Project = {
  id: string
  name: string
  color: string
  clientId: string
}

export type Client = {
  id: string
  name: string
  clientStatus: 'ACTIVE' | 'INACTIVE'
}

export type Tag = {
  id: string
  name: string
  color: string
}

export type Member = {
  id: string
  name: string
  email: string
  image: string | null
  workspaceRoleId: string
  roleName: string
  permissionLevel: RolePermission
  departmentId: string
  cohortIds: string[]
  status: 'ACTIVE' | 'INVITED' | 'DISABLED'
  billableRate: number | null
}

export type TimeEntry = {
  id: string
  workspaceMemberId: string
  description: string
  projectId: string
  tagIds: string[]
  billable: boolean
  startedAt: string
  endedAt: string | null
  durationSeconds: number
  notes: string
}

export type TrackerState = {
  workspace: Workspace
  currentMemberId: string
  roles: WorkspaceRole[]
  departments: Department[]
  cohorts: Cohort[]
  projects: Project[]
  clients: Client[]
  tags: Tag[]
  members: Member[]
  entries: TimeEntry[]
}

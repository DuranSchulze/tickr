import {
  pgTable,
  pgEnum,
  varchar,
  boolean,
  timestamp,
  date,
  text,
  integer,
  numeric,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { createId } from '@paralleldrive/cuid2'

// ── Enums ────────────────────────────────────────────────────────────────────

export const genderEnum = pgEnum('Gender', [
  'MALE',
  'FEMALE',
  'NON_BINARY',
  'PREFER_NOT_TO_SAY',
])

export const maritalStatusEnum = pgEnum('MaritalStatus', [
  'SINGLE',
  'MARRIED',
  'SEPARATED',
  'WIDOWED',
  'DIVORCED',
])

export const rolePermissionEnum = pgEnum('RolePermission', [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'EMPLOYEE',
])

export const clientStatusEnum = pgEnum('ClientStatus', ['ACTIVE', 'INACTIVE'])

export const memberStatusEnum = pgEnum('MemberStatus', [
  'INVITED',
  'ACTIVE',
  'DISABLED',
])

export const employmentTypeEnum = pgEnum('EmploymentType', [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACTOR',
  'INTERN',
  'PROBATIONARY',
])

export const employmentStatusEnum = pgEnum('EmploymentStatus', [
  'ACTIVE',
  'ON_LEAVE',
  'RESIGNED',
  'TERMINATED',
])

// ── Auth tables ───────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: varchar('id', { length: 30 })
    .primaryKey()
    .$defaultFn(() => createId()),
  name: varchar('name', { length: 150 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: varchar('user_id', { length: 30 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
})

export const accounts = pgTable(
  'accounts',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    accountId: varchar('account_id', { length: 255 }).notNull(),
    providerId: varchar('provider_id', { length: 255 }).notNull(),
    userId: varchar('user_id', { length: 30 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)],
)

export const verifications = pgTable('verifications', {
  id: varchar('id', { length: 255 }).primaryKey(),
  identifier: varchar('identifier', { length: 255 }).notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date()),
})

// ── Profile tables ────────────────────────────────────────────────────────────

export const userProfiles = pgTable(
  'user_profiles',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: varchar('user_id', { length: 30 })
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    firstName: varchar('first_name', { length: 50 }).notNull(),
    middleName: varchar('middle_name', { length: 50 }),
    lastName: varchar('last_name', { length: 50 }).notNull(),
    birthDate: date('birth_date'),
    gender: genderEnum('gender'),
    maritalStatus: maritalStatusEnum('marital_status'),
    contactNumber: varchar('contact_number', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('user_profiles_last_first_idx').on(table.lastName, table.firstName),
  ],
)

export const userAddresses = pgTable(
  'user_addresses',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    userProfileId: varchar('user_profile_id', { length: 30 })
      .notNull()
      .unique()
      .references(() => userProfiles.id, { onDelete: 'cascade' }),
    buildingNo: varchar('building_no', { length: 50 }),
    street: varchar('street', { length: 100 }),
    city: varchar('city', { length: 100 }),
    province: varchar('province', { length: 100 }),
    postalCode: varchar('postal_code', { length: 20 }),
    country: varchar('country', { length: 100 })
      .notNull()
      .default('Philippines'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('user_addresses_city_province_idx').on(table.city, table.province),
  ],
)

// ── Workspace tables ──────────────────────────────────────────────────────────

export const workspaces = pgTable('workspaces', {
  id: varchar('id', { length: 30 })
    .primaryKey()
    .$defaultFn(() => createId()),
  name: varchar('name', { length: 150 }).notNull(),
  slug: varchar('slug', { length: 120 }).notNull().unique(),
  timezone: varchar('timezone', { length: 80 })
    .notNull()
    .default('Asia/Manila'),
  defaultBillableRate: numeric('default_billable_rate', {
    precision: 12,
    scale: 2,
  })
    .notNull()
    .default('0'),
  billableCurrency: varchar('billable_currency', { length: 8 })
    .notNull()
    .default('PHP'),
  googleSheetUrl: varchar('google_sheet_url', { length: 500 }),
  googleSheetSyncedAt: timestamp('google_sheet_synced_at', {
    withTimezone: true,
  }),
  googleSheetSyncedBy: varchar('google_sheet_synced_by', { length: 30 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const workspaceRoles = pgTable(
  'workspace_roles',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: varchar('workspace_id', { length: 30 })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    permissionLevel: rolePermissionEnum('permission_level')
      .notNull()
      .default('EMPLOYEE'),
    color: varchar('color', { length: 20 }).notNull().default('#6366f1'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('workspace_roles_workspace_id_name_unique').on(
      table.workspaceId,
      table.name,
    ),
    index('workspace_roles_workspace_permission_idx').on(
      table.workspaceId,
      table.permissionLevel,
    ),
  ],
)

export const departments = pgTable(
  'departments',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: varchar('workspace_id', { length: 30 })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    color: varchar('color', { length: 20 }).notNull().default('#6366f1'),
    headMemberId: varchar('head_member_id', { length: 30 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('departments_workspace_id_name_unique').on(
      table.workspaceId,
      table.name,
    ),
    index('departments_head_member_idx').on(table.headMemberId),
  ],
)

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: varchar('workspace_id', { length: 30 })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 30 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    email: varchar('email', { length: 255 }).notNull(),
    workspaceRoleId: varchar('workspace_role_id', { length: 30 }).references(
      () => workspaceRoles.id,
      { onDelete: 'set null' },
    ),
    status: memberStatusEnum('status').notNull().default('INVITED'),
    billableRate: numeric('billable_rate', { precision: 12, scale: 2 }),
    departmentId: varchar('department_id', { length: 30 }).references(
      () => departments.id,
      { onDelete: 'set null' },
    ),
    invitedById: varchar('invited_by_id', { length: 30 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('workspace_members_workspace_id_email_unique').on(
      table.workspaceId,
      table.email,
    ),
    index('workspace_members_workspace_role_idx').on(
      table.workspaceId,
      table.workspaceRoleId,
    ),
    index('workspace_members_user_id_idx').on(table.userId),
    index('workspace_members_department_id_idx').on(table.departmentId),
    index('workspace_members_invited_by_idx').on(table.invitedById),
  ],
)

export const workspaceInvites = pgTable(
  'workspace_invites',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: varchar('workspace_id', { length: 30 })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    workspaceRoleId: varchar('workspace_role_id', { length: 30 }).references(
      () => workspaceRoles.id,
      { onDelete: 'set null' },
    ),
    departmentId: varchar('department_id', { length: 30 }).references(
      () => departments.id,
      { onDelete: 'set null' },
    ),
    invitedById: varchar('invited_by_id', { length: 30 }).references(
      () => workspaceMembers.id,
      { onDelete: 'set null' },
    ),
    tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
    joinCode: varchar('join_code', { length: 10 }).unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('workspace_invites_workspace_id_email_unique').on(
      table.workspaceId,
      table.email,
    ),
    index('workspace_invites_workspace_id_idx').on(table.workspaceId),
    index('workspace_invites_invited_by_idx').on(table.invitedById),
    index('workspace_invites_department_id_idx').on(table.departmentId),
  ],
)

export const cohorts = pgTable(
  'cohorts',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: varchar('workspace_id', { length: 30 })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    departmentId: varchar('department_id', { length: 30 }).references(
      () => departments.id,
      { onDelete: 'set null' },
    ),
    name: varchar('name', { length: 120 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('cohorts_workspace_dept_name_unique').on(
      table.workspaceId,
      table.departmentId,
      table.name,
    ),
    index('cohorts_department_id_idx').on(table.departmentId),
  ],
)

export const cohortMembers = pgTable(
  'cohort_members',
  {
    cohortId: varchar('cohort_id', { length: 30 })
      .notNull()
      .references(() => cohorts.id, { onDelete: 'cascade' }),
    memberId: varchar('member_id', { length: 30 })
      .notNull()
      .references(() => workspaceMembers.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.cohortId, table.memberId] }),
    index('cohort_members_member_id_idx').on(table.memberId),
  ],
)

// ── Catalog tables ────────────────────────────────────────────────────────────

export const clients = pgTable(
  'clients',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: varchar('workspace_id', { length: 30 })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    clientStatus: clientStatusEnum('client_status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('clients_workspace_id_name_unique').on(
      table.workspaceId,
      table.name,
    ),
  ],
)

export const projects = pgTable(
  'projects',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: varchar('workspace_id', { length: 30 })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: varchar('client_id', { length: 30 })
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 120 }).notNull(),
    color: varchar('color', { length: 20 }).notNull().default('#2563eb'),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('projects_workspace_id_client_id_name_unique').on(
      table.workspaceId,
      table.clientId,
      table.name,
    ),
    index('projects_client_id_idx').on(table.clientId),
  ],
)

export const tags = pgTable(
  'tags',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: varchar('workspace_id', { length: 30 })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    color: varchar('color', { length: 20 }).notNull().default('#14b8a6'),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('tags_workspace_id_name_unique').on(
      table.workspaceId,
      table.name,
    ),
  ],
)

// ── Time tracking ─────────────────────────────────────────────────────────────

export const timeEntries = pgTable(
  'time_entries',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: varchar('workspace_id', { length: 30 })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    workspaceMemberId: varchar('workspace_member_id', { length: 30 })
      .notNull()
      .references(() => workspaceMembers.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    projectId: varchar('project_id', { length: 30 }).references(
      () => projects.id,
      { onDelete: 'set null' },
    ),
    billable: boolean('billable').notNull().default(false),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('time_entries_workspace_member_started_idx').on(
      table.workspaceId,
      table.workspaceMemberId,
      table.startedAt,
    ),
    index('time_entries_workspace_started_idx').on(
      table.workspaceId,
      table.startedAt,
    ),
    index('time_entries_workspace_ended_idx').on(
      table.workspaceId,
      table.endedAt,
    ),
    index('time_entries_project_id_idx').on(table.projectId),
  ],
)

export const timeEntryTags = pgTable(
  'time_entry_tags',
  {
    timeEntryId: varchar('time_entry_id', { length: 30 })
      .notNull()
      .references(() => timeEntries.id, { onDelete: 'cascade' }),
    tagId: varchar('tag_id', { length: 30 })
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.timeEntryId, table.tagId] }),
    index('time_entry_tags_tag_id_idx').on(table.tagId),
  ],
)

// ── Employee HR tables ────────────────────────────────────────────────────────

export const employeeProfiles = pgTable(
  'employee_profiles',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceMemberId: varchar('workspace_member_id', { length: 30 })
      .notNull()
      .unique()
      .references(() => workspaceMembers.id, { onDelete: 'cascade' }),
    employeeNumber: varchar('employee_number', { length: 50 }),
    positionTitle: varchar('position_title', { length: 100 }),
    employmentType: employmentTypeEnum('employment_type')
      .notNull()
      .default('FULL_TIME'),
    employmentStatus: employmentStatusEnum('employment_status')
      .notNull()
      .default('ACTIVE'),
    hireDate: date('hire_date'),
    regularizationDate: date('regularization_date'),
    separationDate: date('separation_date'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('employee_profiles_employee_number_unique').on(
      table.employeeNumber,
    ),
    index('employee_profiles_employment_status_idx').on(table.employmentStatus),
  ],
)

export const employeeGovernmentIds = pgTable('employee_government_ids', {
  id: varchar('id', { length: 30 })
    .primaryKey()
    .$defaultFn(() => createId()),
  employeeProfileId: varchar('employee_profile_id', { length: 30 })
    .notNull()
    .unique()
    .references(() => employeeProfiles.id, { onDelete: 'cascade' }),
  sssNumber: varchar('sss', { length: 25 }).unique(),
  philHealthNumber: varchar('phic', { length: 25 }).unique(),
  tinNumber: varchar('tin', { length: 25 }).unique(),
  pagIbigNumber: varchar('phmd', { length: 25 }).unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

// ── Misc tables ───────────────────────────────────────────────────────────────

export const performanceShareLinks = pgTable(
  'performance_share_links',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    memberId: varchar('member_id', { length: 30 })
      .notNull()
      .unique()
      .references(() => workspaceMembers.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 64 }).notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('performance_share_links_token_idx').on(table.token)],
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: varchar('workspace_id', { length: 30 })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    actorId: varchar('actor_id', { length: 30 }),
    actorEmail: varchar('actor_email', { length: 255 }),
    action: varchar('action', { length: 50 }).notNull(),
    targetType: varchar('target_type', { length: 50 }),
    targetId: varchar('target_id', { length: 30 }),
    details: text('details'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('audit_logs_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
    index('audit_logs_workspace_action_idx').on(
      table.workspaceId,
      table.action,
    ),
  ],
)

export const pendingGsheetsSyncs = pgTable('pending_gsheets_syncs', {
  workspaceId: varchar('workspace_id', { length: 30 })
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// ── Exported types ────────────────────────────────────────────────────────────

export type RolePermission = (typeof rolePermissionEnum.enumValues)[number]
export type MemberStatus = (typeof memberStatusEnum.enumValues)[number]
export type ClientStatus = (typeof clientStatusEnum.enumValues)[number]
export type EmploymentType = (typeof employmentTypeEnum.enumValues)[number]
export type EmploymentStatus = (typeof employmentStatusEnum.enumValues)[number]
export type Gender = (typeof genderEnum.enumValues)[number]
export type MaritalStatus = (typeof maritalStatusEnum.enumValues)[number]

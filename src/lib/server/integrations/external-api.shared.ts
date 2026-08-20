import { z } from 'zod'

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).default(1),
  updatedSince: z.string().datetime().optional(),
})

const searchQuerySchema = z.string().trim().max(255).optional()
const sortDirQuerySchema = z.enum(['asc', 'desc']).default('asc')
const booleanQuerySchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional()
const idQuerySchema = z.string().trim().max(30).optional()

export const membersListQuerySchema = listQuerySchema.extend({
  search: searchQuerySchema,
  status: z.enum(['ACTIVE', 'INVITED', 'DISABLED']).optional(),
  roleId: idQuerySchema,
  departmentId: idQuerySchema,
  sortBy: z
    .enum(['name', 'email', 'status', 'createdAt', 'updatedAt'])
    .default('createdAt'),
  sortDir: sortDirQuerySchema,
})

export const clientsListQuerySchema = listQuerySchema.extend({
  search: searchQuerySchema,
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  sortBy: z.enum(['name', 'status', 'createdAt', 'updatedAt']).default('name'),
  sortDir: sortDirQuerySchema,
})

export const projectsListQuerySchema = listQuerySchema.extend({
  search: searchQuerySchema,
  clientId: idQuerySchema,
  archived: booleanQuerySchema,
  sortBy: z
    .enum(['name', 'clientId', 'archived', 'createdAt', 'updatedAt'])
    .default('name'),
  sortDir: sortDirQuerySchema,
})

export const tasksListQuerySchema = listQuerySchema.extend({
  search: searchQuerySchema,
  projectId: idQuerySchema,
  archived: booleanQuerySchema,
  sortBy: z
    .enum(['name', 'projectId', 'archived', 'createdAt', 'updatedAt'])
    .default('name'),
  sortDir: sortDirQuerySchema,
})

export const tagsListQuerySchema = listQuerySchema.extend({
  search: searchQuerySchema,
  archived: booleanQuerySchema,
  sortBy: z
    .enum(['name', 'archived', 'createdAt', 'updatedAt'])
    .default('name'),
  sortDir: sortDirQuerySchema,
})

export const departmentsListQuerySchema = listQuerySchema.extend({
  search: searchQuerySchema,
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  sortDir: sortDirQuerySchema,
})

export const timeEntriesQuerySchema = listQuerySchema.extend({
  search: searchQuerySchema,
  memberId: idQuerySchema,
  projectId: idQuerySchema,
  taskId: idQuerySchema,
  billable: booleanQuerySchema,
  running: booleanQuerySchema,
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sortBy: z
    .enum(['startedAt', 'createdAt', 'updatedAt', 'durationSeconds'])
    .default('startedAt'),
  sortDir: sortDirQuerySchema,
})

export const memberDayActivityQuerySchema = z.object({
  user: z.string().trim().min(1).max(255),
  date: z.string().date().optional(),
})

export const dtrIntegrationQuerySchema = memberDayActivityQuerySchema

export const externalApiSignInSchema = z.object({
  apiKey: z.string().trim().min(10).max(500),
})

export type ListQuery = z.infer<typeof listQuerySchema>
export type MembersListQuery = z.infer<typeof membersListQuerySchema>
export type ClientsListQuery = z.infer<typeof clientsListQuerySchema>
export type ProjectsListQuery = z.infer<typeof projectsListQuerySchema>
export type TasksListQuery = z.infer<typeof tasksListQuerySchema>
export type TagsListQuery = z.infer<typeof tagsListQuerySchema>
export type DepartmentsListQuery = z.infer<typeof departmentsListQuerySchema>
export type TimeEntriesQuery = z.infer<typeof timeEntriesQuerySchema>
export type MemberDayActivityQuery = z.infer<
  typeof memberDayActivityQuerySchema
>
export type DtrIntegrationQuery = z.infer<typeof dtrIntegrationQuerySchema>
export type ExternalApiSignInInput = z.infer<typeof externalApiSignInSchema>

export function listPayload<T>(data: T[], query: ListQuery, total: number) {
  const totalPages = Math.ceil(total / query.limit)
  return {
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasMore: query.page < totalPages,
    },
  }
}

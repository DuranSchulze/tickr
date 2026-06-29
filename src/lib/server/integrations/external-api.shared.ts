import { z } from 'zod'

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).default(1),
  updatedSince: z.string().datetime().optional(),
})

export const timeEntriesQuerySchema = listQuerySchema.extend({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
})

export const memberDayActivityQuerySchema = z.object({
  user: z.string().trim().min(1).max(255),
  date: z.string().date().optional(),
})

export type ListQuery = z.infer<typeof listQuerySchema>
export type TimeEntriesQuery = z.infer<typeof timeEntriesQuerySchema>
export type MemberDayActivityQuery = z.infer<
  typeof memberDayActivityQuerySchema
>

export function listPayload<T>(data: T[], query: ListQuery) {
  return {
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      hasMore: data.length === query.limit,
    },
  }
}

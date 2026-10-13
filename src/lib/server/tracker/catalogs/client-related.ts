import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const clientRelatedSchema = z.object({
  clientId: z.string().min(1).max(30),
  kind: z.enum(['projects', 'tasks', 'tags']),
  cursor: z
    .object({ name: z.string().max(200), id: z.string().min(1).max(30) })
    .optional(),
})

export const getClientRelatedFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => clientRelatedSchema.parse(input))
  .handler(async ({ data }) => {
    const { getClientRelated } = await import('./client-related.server')
    return getClientRelated(data)
  })

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const projectDetailSchema = z.object({
  projectId: z.string().min(1).max(30),
})
export const projectTasksPageSchema = projectDetailSchema.extend({
  cursor: z
    .object({ name: z.string().max(200), id: z.string().min(1).max(30) })
    .optional(),
})

export const getProjectDetailFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => projectDetailSchema.parse(input))
  .handler(async ({ data }) => {
    const { getProjectDetail } = await import('./project-detail.server')
    return getProjectDetail(data)
  })

export const getProjectTasksPageFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => projectTasksPageSchema.parse(input))
  .handler(async ({ data }) => {
    const { getProjectTasksPage } = await import('./project-detail.server')
    return getProjectTasksPage(data)
  })

export const createCatalogProjectTaskFn = createServerFn({ method: 'POST' })
  .inputValidator((input) =>
    projectDetailSchema
      .extend({ name: z.string().trim().min(1).max(200) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { createCatalogProjectTask } = await import('./project-detail.server')
    return createCatalogProjectTask(data)
  })

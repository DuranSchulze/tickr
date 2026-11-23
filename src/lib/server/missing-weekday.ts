import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { isValidDateKey } from '#/lib/time-tracker/timesheet'

const workspace = z.strictObject({ workspaceId: z.string().min(1).max(30) })
const confirmation = workspace.extend({
  date: z.string().refine(isValidDateKey),
  userId: z.string().min(1).max(30),
})

export const getMissingWeekdayFn = createServerFn({ method: 'GET' })
  .inputValidator(workspace)
  .handler(async ({ data }) => {
    const { getMissingWeekday } =
      await import('./tracker/missing-weekday.server')
    return getMissingWeekday(data.workspaceId)
  })

export const confirmMissingWeekdayFn = createServerFn({ method: 'POST' })
  .inputValidator(confirmation)
  .handler(async ({ data }) => {
    const { confirmMissingWeekday } =
      await import('./tracker/missing-weekday.server')
    return confirmMissingWeekday(data.workspaceId, data.date, data.userId)
  })

export const undoMissingWeekdayFn = createServerFn({ method: 'POST' })
  .inputValidator(confirmation)
  .handler(async ({ data }) => {
    const { undoMissingWeekday } =
      await import('./tracker/missing-weekday.server')
    await undoMissingWeekday(data.workspaceId, data.date, data.userId)
  })

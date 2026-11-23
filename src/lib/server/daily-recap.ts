import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { isValidDateKey } from '#/lib/time-tracker/timesheet'

const workspace = z.strictObject({ workspaceId: z.string().min(1).max(30) })
const leaveAnswer = workspace.extend({
  userId: z.string().min(1).max(30),
  date: z.string().refine(isValidDateKey),
  onLeave: z.boolean(),
})

export const getDailyRecapFn = createServerFn({ method: 'GET' })
  .inputValidator(workspace)
  .handler(async ({ data }) => {
    const { getDailyRecap } = await import('./tracker/daily-recap.server')
    return getDailyRecap(data.workspaceId)
  })

export const setDailyLeaveFn = createServerFn({ method: 'POST' })
  .inputValidator(leaveAnswer)
  .handler(async ({ data }) => {
    const { setDailyLeave } = await import('./tracker/daily-recap.server')
    return setDailyLeave(data)
  })

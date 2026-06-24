import { z } from 'zod'

export const TimerPresetSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  clientId: z.string(),
  projectId: z.string(),
  taskId: z.string().nullable().default(null),
  tagIds: z.array(z.string()),
  billable: z.boolean(),
})

export type TimerPreset = z.infer<typeof TimerPresetSchema>

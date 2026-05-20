import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const updateGoogleSheetSchema = z.object({
  url: z.string().trim().max(500),
})

export const getServiceAccountEmailFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { getServiceAccountEmail } = await import('./settings.server')
  return getServiceAccountEmail()
})

export const updateWorkspaceGoogleSheetFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => updateGoogleSheetSchema.parse(input))
  .handler(async ({ data }) => {
    const { updateWorkspaceGoogleSheet } = await import('./settings.server')
    return updateWorkspaceGoogleSheet(data)
  })

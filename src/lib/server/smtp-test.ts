import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const sendTestEmailSchema = z.object({
  to: z.string().trim().email(),
})

export const sendTestEmailFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => sendTestEmailSchema.parse(input))
  .handler(async ({ data }) => {
    const { sendTestEmail } = await import('./smtp-test.server')
    return sendTestEmail(data)
  })

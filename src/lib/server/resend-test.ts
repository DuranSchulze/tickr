import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const sendResendTestSchema = z.object({
  to: z.string().trim().email(),
})

export const sendResendTestFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => sendResendTestSchema.parse(input))
  .handler(async ({ data }) => {
    const { sendResendTest } = await import('./resend-test.server')
    return sendResendTest(data)
  })

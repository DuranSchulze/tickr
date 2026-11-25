import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { parseOAuthQuery } from '#/lib/oauth-query'

const oauthInput = z.object({
  oauth: z.string().transform((value, ctx) => {
    const parsed = parseOAuthQuery(value)
    if (!parsed) {
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid authorization request.',
      })
      return z.NEVER
    }
    return parsed
  }),
})

export const getMcpConsentContextFn = createServerFn({ method: 'GET' })
  .inputValidator(oauthInput)
  .handler(async ({ data }) => {
    const { getMcpConsentContext } = await import('./mcp-connections.server')
    return getMcpConsentContext(data.oauth)
  })

export const listConnectedAppsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { listConnectedApps } = await import('./mcp-connections.server')
    return listConnectedApps()
  },
)

export const disconnectAppFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ clientId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { disconnectApp } = await import('./mcp-connections.server')
    await disconnectApp(data.clientId)
    return { ok: true as const }
  })

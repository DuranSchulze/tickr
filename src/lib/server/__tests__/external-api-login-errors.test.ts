import { describe, expect, it, vi } from 'vitest'

import {
  handleLoginRequest,
  handleSignInRequest,
  handleDeveloperSignInRequest,
} from '../integrations/external-api-routes.server'

const { sign, handleError } = vi.hoisted(() => ({
  sign: vi
    .fn()
    .mockRejectedValue(new Error('EXTERNAL_API_JWT_SECRET is not configured')),
  handleError: vi.fn(() =>
    Response.json({ error: { code: 'internal_error' } }, { status: 500 }),
  ),
}))
vi.mock('../integrations/external-api-auth.server', () => {
  const context = {
    workspaceId: 'workspace',
    workspace: { id: 'workspace', name: 'Workspace', slug: 'workspace' },
    keyId: 'key',
    developerId: 'developer',
    permissionLevel: 'OWNER',
  }
  return {
    ExternalApiError: class extends Error {},
    authenticateApiKeyCredential: vi.fn().mockResolvedValue(context),
    authenticateDeveloperCredentials: vi.fn().mockResolvedValue(context),
    authenticateUserCredentials: vi.fn().mockResolvedValue({
      context,
      user: { id: 'user', name: 'User', email: 'user@example.com' },
    }),
    externalApiErrorResponse: handleError,
    jsonResponse: Response.json,
    requireExternalApiKey: vi.fn(),
    resolveUserContext: vi.fn(),
  }
})
vi.mock('../integrations/external-api-user-auth.server', () => ({
  registerTracklyUserAccount: vi.fn(),
}))
vi.mock('../integrations/external-api-jwt.server', () => ({
  signApiKeyJwt: sign,
  signDeveloperJwt: sign,
  signUserJwt: sign,
}))

describe('API login token issuance failures', () => {
  it.each([
    [
      handleLoginRequest,
      { email: 'user@example.com', password: 'password123' },
    ],
    [handleSignInRequest, { apiKey: 'test-api-key' }],
    [
      handleDeveloperSignInRequest,
      { email: 'user@example.com', password: 'password123' },
    ],
  ])(
    'returns a handled error when token signing rejects',
    async (handler, body) => {
      const response = await handler(
        new Request('http://localhost/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({
        error: { code: 'internal_error' },
      })
      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'EXTERNAL_API_JWT_SECRET is not configured',
        }),
      )
    },
  )
})

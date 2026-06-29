import { describe, expect, it } from 'vitest'
import {
  createWorkspaceApiKeySchema,
  revokeWorkspaceApiKeySchema,
} from '../integrations/api-keys.shared'

describe('workspace API key validation', () => {
  it('accepts a valid key creation request', () => {
    const result = createWorkspaceApiKeySchema.parse({
      name: 'Production sync',
      expiresAt: '2026-07-01T00:00:00.000Z',
    })

    expect(result).toEqual({
      name: 'Production sync',
      expiresAt: '2026-07-01T00:00:00.000Z',
    })
  })

  it('trims names and rejects empty key names', () => {
    expect(() =>
      createWorkspaceApiKeySchema.parse({ name: '   ', expiresAt: null }),
    ).toThrow()
  })

  it('rejects malformed expiration dates', () => {
    expect(() =>
      createWorkspaceApiKeySchema.parse({
        name: 'Bad date',
        expiresAt: 'tomorrow',
      }),
    ).toThrow()
  })

  it('requires an id when revoking a key', () => {
    expect(() => revokeWorkspaceApiKeySchema.parse({ id: '' })).toThrow()
    expect(revokeWorkspaceApiKeySchema.parse({ id: 'key_123' })).toEqual({
      id: 'key_123',
    })
  })
})

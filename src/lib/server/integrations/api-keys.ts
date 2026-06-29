import { createServerFn } from '@tanstack/react-start'
import {
  createWorkspaceApiKeySchema,
  revokeWorkspaceApiKeySchema,
} from './api-keys.shared'
import type {
  CreatedWorkspaceApiKey,
  WorkspaceApiKeyMetadata,
} from './api-keys.shared'

export type { CreatedWorkspaceApiKey, WorkspaceApiKeyMetadata }

export const listWorkspaceApiKeysFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { listWorkspaceApiKeys } = await import('./api-keys.server')
  return listWorkspaceApiKeys()
})

export const createWorkspaceApiKeyFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => createWorkspaceApiKeySchema.parse(input))
  .handler(async ({ data }) => {
    const { createWorkspaceApiKey } = await import('./api-keys.server')
    return createWorkspaceApiKey(data)
  })

export const revokeWorkspaceApiKeyFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => revokeWorkspaceApiKeySchema.parse(input))
  .handler(async ({ data }) => {
    const { revokeWorkspaceApiKey } = await import('./api-keys.server')
    return revokeWorkspaceApiKey(data)
  })

import { z } from 'zod'

export const createWorkspaceApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  expiresAt: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .transform((value) => value ?? null),
})

export const revokeWorkspaceApiKeySchema = z.object({
  id: z.string().min(1),
})

export type WorkspaceApiKeyMetadata = {
  id: string
  name: string
  tokenPrefix: string
  lastFour: string
  createdByUserId: string | null
  createdByName: string | null
  createdByEmail: string | null
  expiresAt: string | null
  lastUsedAt: string | null
  lastUsedIp: string | null
  revokedAt: string | null
  createdAt: string
}

export type CreatedWorkspaceApiKey = {
  apiKey: string
  key: WorkspaceApiKeyMetadata
}

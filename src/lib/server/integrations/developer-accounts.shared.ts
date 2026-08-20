import { z } from 'zod'

export const createDeveloperAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .email()
    .max(255)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128),
  permissionLevel: z.enum(['OWNER', 'ADMIN']).default('OWNER'),
})

export const revokeDeveloperAccountSchema = z.object({
  id: z.string().min(1),
})

export const developerSignInSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(255)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
})

export type DeveloperAccountMetadata = {
  id: string
  name: string
  email: string
  permissionLevel: 'OWNER' | 'ADMIN'
  isActive: boolean
  lastSignedInAt: string | null
  createdAt: string
}

export type CreateDeveloperAccountInput = z.infer<
  typeof createDeveloperAccountSchema
>
export type DeveloperSignInInput = z.infer<typeof developerSignInSchema>

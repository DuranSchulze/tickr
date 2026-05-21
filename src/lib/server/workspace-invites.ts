import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const createWorkspaceInviteSchema = z.object({
  email: z.string().trim().email(),
  workspaceRoleId: z.string().min(1),
  departmentId: z.string().optional().nullable(),
})

const inviteIdSchema = z.object({
  inviteId: z.string().min(1),
})

export const createWorkspaceInviteFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => createWorkspaceInviteSchema.parse(input))
  .handler(async ({ data }) => {
    const { createWorkspaceInvite } = await import('./workspace-invites.server')
    return createWorkspaceInvite(data)
  })

export const resendWorkspaceInviteFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => inviteIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { resendWorkspaceInvite } = await import('./workspace-invites.server')
    return resendWorkspaceInvite(data)
  })

export const revokeWorkspaceInviteFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => inviteIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { revokeWorkspaceInvite } = await import('./workspace-invites.server')
    return revokeWorkspaceInvite(data)
  })

export const listWorkspaceInvitesFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { listWorkspaceInvites } = await import('./workspace-invites.server')
    const rows = await listWorkspaceInvites()
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      roleName: r.workspaceRole?.name ?? null,
      roleColor: r.workspaceRole?.color ?? null,
      departmentName: r.department?.name ?? null,
      joinCode: r.joinCode ?? null,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }))
  },
)

export const previewInviteFn = createServerFn({ method: 'GET' })
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { previewInvite } = await import('./workspace-invites.server')
    return previewInvite(data.token)
  })

export const acceptInviteFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { acceptInvite } = await import('./workspace-invites.server')
    return acceptInvite(data.token)
  })

export const redeemInviteByCodeFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { code: string }) => input)
  .handler(async ({ data }) => {
    const { redeemInviteByCode } = await import('./workspace-invites.server')
    return redeemInviteByCode(data.code)
  })

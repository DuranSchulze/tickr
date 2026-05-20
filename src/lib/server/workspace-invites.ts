import { createServerFn } from '@tanstack/react-start'

export const createWorkspaceInviteFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (input: {
      email: string
      workspaceRoleId: string
      departmentId?: string | null
    }) => input,
  )
  .handler(async ({ data }) => {
    const { createWorkspaceInvite } = await import('./workspace-invites.server')
    return createWorkspaceInvite(data)
  })

export const resendWorkspaceInviteFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { inviteId: string }) => input)
  .handler(async ({ data }) => {
    const { resendWorkspaceInvite } = await import('./workspace-invites.server')
    return resendWorkspaceInvite(data)
  })

export const revokeWorkspaceInviteFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { inviteId: string }) => input)
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

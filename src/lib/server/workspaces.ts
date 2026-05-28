import { createServerFn } from '@tanstack/react-start'

export const deleteWorkspaceFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { workspaceId: string }) => input)
  .handler(async ({ data }) => {
    const { deleteWorkspaceForCurrentUser } =
      await import('./workspaces.server')
    await deleteWorkspaceForCurrentUser(data.workspaceId)
  })

export const leaveWorkspaceFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { workspaceId: string }) => input)
  .handler(async ({ data }) => {
    const { leaveWorkspaceForCurrentUser } = await import('./workspaces.server')
    await leaveWorkspaceForCurrentUser(data.workspaceId)
  })

export const createWorkspaceFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (
      input: { name?: unknown; timezone?: unknown; slug?: unknown } | undefined,
    ) => {
      if (!input || typeof input.name !== 'string') {
        throw new Error('Workspace name is required.')
      }
      return {
        name: input.name,
        timezone:
          typeof input.timezone === 'string' ? input.timezone : undefined,
        slug: typeof input.slug === 'string' ? input.slug : undefined,
      }
    },
  )
  .handler(async ({ data }) => {
    const { createWorkspaceForCurrentUser } =
      await import('./workspaces.server')
    return createWorkspaceForCurrentUser(data)
  })

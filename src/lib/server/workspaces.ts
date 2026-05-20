import { createServerFn } from '@tanstack/react-start'

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

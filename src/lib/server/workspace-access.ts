import { createServerFn } from '@tanstack/react-start'

export const getWorkspaceAccessFn = createServerFn({ method: 'GET' })
  .inputValidator((input: { slug?: string } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const { requireWorkspaceAccess } = await import('./workspace-access.server')
    const access = await requireWorkspaceAccess(data.slug ?? null)
    return {
      workspace: {
        id: access.workspace.id,
        name: access.workspace.name,
        slug: access.workspace.slug,
        timezone: access.workspace.timezone,
        defaultBillableRate: Number(access.workspace.defaultBillableRate),
        billableCurrency: access.workspace.billableCurrency,
        googleSheetUrl: access.workspace.googleSheetUrl,
      },
      user: {
        id: access.user.id,
        name: access.user.name,
        email: access.user.email,
        image: access.user.image ?? null,
      },
      member: {
        id: access.member.id,
        permissionLevel:
          access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE',
      },
    }
  })

export const listUserWorkspacesFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getAuthSession, listUserWorkspaces } =
      await import('./workspace-access.server')
    const session = await getAuthSession()
    if (!session?.user) return []
    const members = await listUserWorkspaces(
      session.user.id,
      session.user.email,
    )
    return members.map((m) => ({
      workspaceId: m.workspace.id,
      slug: m.workspace.slug,
      name: m.workspace.name,
      role: m.workspaceRole
        ? {
            name: m.workspaceRole.name,
            permissionLevel: m.workspaceRole.permissionLevel,
            color: m.workspaceRole.color,
          }
        : null,
      status: m.status,
    }))
  },
)

export const setActiveWorkspaceFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { slug: string }) => input)
  .handler(async ({ data }) => {
    const { requireWorkspaceAccess, setActiveWorkspaceCookie } =
      await import('./workspace-access.server')
    const access = await requireWorkspaceAccess(data.slug)
    setActiveWorkspaceCookie(access.workspace.slug)
    return { slug: access.workspace.slug }
  })

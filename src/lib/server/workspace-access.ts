import { createServerFn } from '@tanstack/react-start'
import { getEffectivePermissions } from '#/lib/rbac/permissions'

export const getWorkspaceAccessFn = createServerFn({ method: 'GET' })
  .inputValidator((input: { slug?: string } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const { requireWorkspaceAuthorization } =
      await import('./workspace-access.server')
    const access = await requireWorkspaceAuthorization(data.slug ?? null)
    const permissionLevel =
      access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
    const permissionOverrides =
      access.member.workspaceRole?.permissionOverrides ?? {}
    const permissions = getEffectivePermissions(
      permissionLevel,
      permissionOverrides,
    )
    return {
      workspace: {
        id: access.workspace.id,
        name: access.workspace.name,
        slug: access.workspace.slug,
        timezone: access.workspace.timezone,
        defaultBillableRate: Number(access.workspace.defaultBillableRate),
        billableCurrency: access.workspace.billableCurrency,
        googleSheetUrl:
          permissions['workspace.settings.view'] ||
          permissions['catalogs.import']
            ? access.workspace.googleSheetUrl
            : null,
      },
      user: {
        id: access.user.id,
        name: access.user.name,
        email: access.user.email,
        image: access.user.image ?? null,
      },
      member: {
        id: access.member.id,
        roleId: access.member.workspaceRoleId,
        departmentId: access.member.departmentId,
        permissionLevel,
        permissions,
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

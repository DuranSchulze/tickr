type WorkspaceAccess = {
  workspace: {
    id: string
    name: string
    slug: string
    timezone: string
    defaultBillableRate: number
    billableCurrency: string
    googleSheetUrl: string | null
  }
  user: {
    id: string
    name: string
    email: string
    image: string | null
  }
  member: {
    id: string
    permissionLevel: 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
    permissions: Record<string, boolean>
  }
}

type NavigateFn = (opts: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>
}) => void

export function useCatalogPermissions(access: WorkspaceAccess) {
  const canManage = access.member.permissions['catalogs.manage'] ?? false

  const canImportSheet = access.member.permissions['catalogs.import'] ?? false

  const canViewBillable = canImportSheet

  return { canManage, canImportSheet, canViewBillable }
}

export function getCatalogCurrency(access: WorkspaceAccess) {
  return access.workspace.billableCurrency
}

export function getCatalogGoogleSheetUrl(access: WorkspaceAccess) {
  return access.workspace.googleSheetUrl
}

export function createCatalogNavigate(navigate: NavigateFn) {
  const onFilterChange = (updates: Record<string, unknown>) => {
    void navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        ...updates,
        page: 0,
      }),
    })
  }

  const onPageChange = (page: number) => {
    void navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, page }),
    })
  }

  return { onFilterChange, onPageChange }
}

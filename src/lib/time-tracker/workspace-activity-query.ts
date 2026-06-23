import { getWorkspaceActivityFn } from '#/lib/server/tracker'

export type WorkspaceActivityFilters = {
  departmentId?: string
  q?: string
}

export function normalizeWorkspaceActivityFilters(
  filters: WorkspaceActivityFilters,
): WorkspaceActivityFilters {
  return {
    departmentId: filters.departmentId?.trim() || undefined,
    q: filters.q?.trim() || undefined,
  }
}

export function getWorkspaceActivityQueryKey(
  filters: WorkspaceActivityFilters,
) {
  const normalized = normalizeWorkspaceActivityFilters(filters)
  return [
    'workspace-activity',
    normalized.departmentId ?? '',
    normalized.q ?? '',
  ] as const
}

export function fetchWorkspaceActivity(filters: WorkspaceActivityFilters) {
  const data = normalizeWorkspaceActivityFilters(filters)
  if (!data.departmentId && !data.q) return getWorkspaceActivityFn()
  return getWorkspaceActivityFn({ data })
}

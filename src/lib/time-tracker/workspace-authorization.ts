import type { QueryClient } from '@tanstack/react-query'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'

export const workspaceAuthorizationKeys = {
  all: ['workspace-authorization'] as const,
  current: () => [...workspaceAuthorizationKeys.all, 'current'] as const,
}

export function fetchFreshWorkspaceAuthorization(queryClient: QueryClient) {
  return queryClient.fetchQuery({
    queryKey: workspaceAuthorizationKeys.current(),
    queryFn: () => getWorkspaceAccessFn(),
    staleTime: 0,
  })
}

export function ensureWorkspaceAuthorization(queryClient: QueryClient) {
  return queryClient.ensureQueryData({
    queryKey: workspaceAuthorizationKeys.current(),
    queryFn: () => getWorkspaceAccessFn(),
    staleTime: 30_000,
    revalidateIfStale: true,
  })
}

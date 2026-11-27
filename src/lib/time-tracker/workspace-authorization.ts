import type { QueryClient } from '@tanstack/react-query'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'
import { isNetworkError } from './connectivity'

export const workspaceAuthorizationKeys = {
  all: ['workspace-authorization'] as const,
  current: () => [...workspaceAuthorizationKeys.all, 'current'] as const,
}

export async function fetchFreshWorkspaceAuthorization(
  queryClient: QueryClient,
) {
  try {
    return await queryClient.fetchQuery({
      queryKey: workspaceAuthorizationKeys.current(),
      queryFn: () => getWorkspaceAccessFn(),
      staleTime: 0,
    })
  } catch (err) {
    // Offline (offline-mode REQ-6): fall back to the copy restored from this
    // member's encrypted cache. A server answer (e.g. access revoked) is
    // never masked: only requests that did not reach the server fall back.
    const cached = queryClient.getQueryData<
      Awaited<ReturnType<typeof getWorkspaceAccessFn>>
    >(workspaceAuthorizationKeys.current())
    if (cached && typeof window !== 'undefined' && isNetworkError(err)) {
      return cached
    }
    throw err
  }
}

export function ensureWorkspaceAuthorization(queryClient: QueryClient) {
  return queryClient.ensureQueryData({
    queryKey: workspaceAuthorizationKeys.current(),
    queryFn: () => getWorkspaceAccessFn(),
    staleTime: 30_000,
    revalidateIfStale: true,
  })
}

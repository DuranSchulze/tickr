import { useEffect, useRef } from 'react'
import { useRouter } from '@tanstack/react-router'
import { CloudOff } from 'lucide-react'
import { useNetworkStatus } from '#/lib/time-tracker/useNetworkStatus'
import {
  getCatalogSavedAt,
  isCatalogStale,
} from '#/lib/time-tracker/offline-cache'

/**
 * Offline notice for `/app` (offline-mode REQ-6, REQ-7). When the app was
 * opened from the offline snapshot, it reloads its route data once the
 * server is reachable again.
 */
export function OfflineBanner({ bootedOffline }: { bootedOffline: boolean }) {
  const { isOnline } = useNetworkStatus()
  const router = useRouter()
  const reloadedRef = useRef(false)

  useEffect(() => {
    if (!bootedOffline || !isOnline || reloadedRef.current) return
    reloadedRef.current = true
    void router.invalidate()
  }, [bootedOffline, isOnline, router])

  if (isOnline && !bootedOffline) return null
  const catalogSavedAt = getCatalogSavedAt()
  const stale = !isOnline && isCatalogStale(catalogSavedAt)
  return (
    <div
      role="status"
      className="grid justify-items-center gap-0.5 border-b border-stone bg-warm-taupe px-4 py-2 text-center text-sm font-semibold text-foreground"
    >
      <span className="flex items-center gap-2">
        <CloudOff className="size-4 shrink-0" aria-hidden="true" />
        {isOnline
          ? 'Back online. Refreshing your workspace…'
          : 'You are offline. You can track time and view your recent entries; changes sync when you reconnect.'}
      </span>
      {stale && catalogSavedAt ? (
        <span className="text-xs font-medium text-smoke">
          Clients, projects and tags were last updated on{' '}
          {new Date(catalogSavedAt).toLocaleDateString()} and may be out of
          date.
        </span>
      ) : null}
    </div>
  )
}

import { MapPin, RefreshCw } from 'lucide-react'
import { useMyLocation } from '#/hooks/useMyLocation'
import { formatCoordinates } from '#/lib/time-tracker/my-location-query'
import { cn } from '#/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'

/**
 * Badge showing the current user's approximate location, resolved from
 * their request IP — the same source recorded on time-entry origins. The
 * clickable popover exposes the resolved source and a manual refresh.
 */
export function LocationBadge() {
  const { data, isLoading, isFetching, dataUpdatedAt, refetch } =
    useMyLocation()

  const label = isLoading
    ? 'Locating…'
    : (data?.location ?? 'Location unavailable')

  const hasCoords = data
    ? data.latitude != null && data.longitude != null
    : false

  const checkedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full bg-muted/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`View approximate location details: ${label}`}
        >
          <MapPin className="size-3.5 shrink-0" />
          <span className="max-w-32 truncate">{label}</span>
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              data?.location ? 'bg-emerald-500' : 'bg-amber-500',
              isFetching && 'animate-pulse',
            )}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={8} className="w-72 gap-0 p-3">
        <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Your location
        </p>
        <p className="m-0 mt-1 text-sm font-medium">
          {isLoading
            ? 'Resolving your location…'
            : (data?.location ?? 'Unknown')}
        </p>
        {hasCoords && (
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            {formatCoordinates(data!.latitude!, data!.longitude!)}
          </p>
        )}
        {data?.ipAddress && (
          <p className="m-0 mt-1 font-mono text-[11px] text-muted-foreground">
            Network IP: {data.ipAddress}
          </p>
        )}
        <p className="m-0 mt-2 text-[11px] leading-snug text-muted-foreground">
          This is checked automatically every minute. The same public IP,
          location, and coordinates are recorded on new time entries when
          workspace location tracking is on.
        </p>

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
          <span className="text-[11px] text-muted-foreground">
            {isFetching
              ? 'Updating…'
              : checkedAt
                ? `Checked at ${checkedAt}`
                : 'Not resolved yet'}
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3', isFetching && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

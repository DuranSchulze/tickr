import type { TimeEntry } from '#/lib/time-tracker/types'
import { EntryLocationMap } from './EntryLocationMap'

/**
 * Read-only origin details for a time entry: where it was logged from.
 * Renders nothing unless the entry carries at least one origin field —
 * legacy entries and tracking-disabled workspaces show no section.
 */
export function EntryOriginSection({ entry }: { entry: TimeEntry }) {
  const {
    ipAddress,
    location,
    latitude,
    longitude,
    locationSource,
    locationAccuracyM,
    userAgent,
  } = entry

  if (
    !ipAddress &&
    !location &&
    latitude == null &&
    longitude == null &&
    !userAgent
  ) {
    return null
  }

  const hasCoords = latitude != null && longitude != null
  const isDevice = locationSource === 'device'

  return (
    <div className="grid gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Logged from
      </span>

      <div className="grid gap-1 text-sm">
        {location ? (
          <span className="font-semibold text-foreground">{location}</span>
        ) : (
          <span className="italic text-muted-foreground">
            Location unavailable
          </span>
        )}

        {hasCoords && (
          <span className="font-mono text-xs text-muted-foreground">
            {latitude.toFixed(4)}, {longitude.toFixed(4)}{' '}
            <span className="not-italic">
              {isDevice
                ? locationAccuracyM != null
                  ? `(device GPS, ±${locationAccuracyM.toLocaleString('en-US')} m)`
                  : '(device GPS)'
                : '(city-level, approximate)'}
            </span>
          </span>
        )}

        {ipAddress && (
          <span className="font-mono text-xs text-muted-foreground">
            {ipAddress}
          </span>
        )}

        {userAgent && (
          <span
            className="block truncate text-xs text-muted-foreground"
            title={userAgent}
          >
            {userAgent}
          </span>
        )}
      </div>

      {hasCoords && (
        <EntryLocationMap
          latitude={latitude}
          longitude={longitude}
          location={location}
          source={locationSource}
          accuracyMeters={locationAccuracyM}
        />
      )}
    </div>
  )
}

import { Map, MapControls, MapMarker, MarkerContent, MarkerPopup } from '#/components/ui/map'
import { useAppTheme } from '#/hooks/useAppTheme'
import type { WorkspaceMemberActivity } from '#/lib/server/tracker/activity.server'

/**
 * Workspace-wide activity map: one pin per member at their latest
 * geo-resolved entry. City-level precision — pins show where entries were
 * logged from, not exact device positions.
 */
export function MemberActivityMap({ members }: { members: WorkspaceMemberActivity[] }) {
  const theme = useAppTheme()

  const pinned = members.filter((m) => m.latestOrigin !== null)
  const center = pinned.length
    ? averagePosition(pinned.map((m) => m.latestOrigin!))
    : { latitude: 12.8797, longitude: 121.774 } // Philippines fallback
  const zoom = pinned.length > 1 ? 4 : 8

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">Where work is logged from</h2>
          <p className="text-xs text-muted-foreground">
            Latest known location per member · city-level, approximate
          </p>
        </div>
        <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {pinned.length} of {members.length} located
        </span>
      </div>

      {pinned.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No location data yet. Pins appear once entries are logged with
          location tracking enabled.
        </p>
      ) : (
        <Map
          theme={theme}
          center={[center.longitude, center.latitude]}
          zoom={zoom}
          className="h-[360px] w-full"
        >
          <MapControls />
          {pinned.map((member) => {
            const origin = member.latestOrigin!
            return (
              <MapMarker
                key={member.memberId}
                longitude={origin.longitude}
                latitude={origin.latitude}
              >
                <MarkerContent>
                  <div
                    className={`size-4 rounded-full border-2 border-white shadow-lg ${
                      member.activeEntry ? 'bg-emerald-500' : 'bg-primary'
                    }`}
                    title={member.activeEntry ? 'Timer running' : 'Latest entry'}
                  />
                </MarkerContent>
                <MarkerPopup className="w-56">
                  <div className="rounded-lg border border-border bg-background p-3 shadow-md">
                    <p className="m-0 text-sm font-semibold text-foreground">
                      {member.name}
                    </p>
                    <p className="m-0 mt-0.5 truncate text-xs text-muted-foreground">
                      {origin.description || 'No description'}
                    </p>
                    <p className="m-0 mt-1.5 text-xs font-medium text-foreground">
                      {origin.location ?? 'Location unavailable'}
                    </p>
                    <p className="m-0 text-[11px] text-muted-foreground">
                      {new Date(origin.startedAt).toLocaleString()}
                    </p>
                  </div>
                </MarkerPopup>
              </MapMarker>
            )
          })}
        </Map>
      )}
    </section>
  )
}

function averagePosition(
  origins: Array<{ latitude: number; longitude: number }>,
): { latitude: number; longitude: number } {
  const sum = origins.reduce(
    (acc, o) => ({ latitude: acc.latitude + o.latitude, longitude: acc.longitude + o.longitude }),
    { latitude: 0, longitude: 0 },
  )
  return {
    latitude: sum.latitude / origins.length,
    longitude: sum.longitude / origins.length,
  }
}

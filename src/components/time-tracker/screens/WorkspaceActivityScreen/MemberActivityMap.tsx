import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerPopup,
} from '#/components/ui/map'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { useAppTheme } from '#/hooks/useAppTheme'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useState } from 'react'
import type { WorkspaceMemberActivity } from '#/lib/server/tracker/activity.server'

/**
 * Workspace-wide activity map: one pin per member at their latest
 * geo-resolved entry. City-level precision — pins show where entries were
 * logged from, not exact device positions.
 */
export function MemberActivityMap({
  members,
}: {
  members: WorkspaceMemberActivity[]
}) {
  const theme = useAppTheme()
  const [expanded, setExpanded] = useState(false)

  const pinned = members.filter((m) => m.latestOrigin !== null)
  const activeLocatedCount = pinned.filter((m) => m.activeEntry !== null).length
  const inactiveLocatedCount = pinned.length - activeLocatedCount
  const center = pinned.length
    ? averagePosition(pinned.map((m) => m.latestOrigin!))
    : { latitude: 12.8797, longitude: 121.774 } // Philippines fallback
  const zoom = pinned.length > 1 ? 4 : 8

  return (
    <>
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground">
              Member locations
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              Active members and each member&apos;s last known location ·
              approximate
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs font-medium">
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span
                  className="size-2 rounded-full bg-emerald-500"
                  aria-hidden="true"
                />
                {activeLocatedCount} active
              </span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="size-2 rounded-full bg-muted-foreground/50"
                  aria-hidden="true"
                />
                {inactiveLocatedCount} inactive
              </span>
            </div>
            {pinned.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                title="Expand member map"
                aria-label="Expand member map"
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <Maximize2 className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {pinned.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No location data yet. Pins appear once entries are logged with
            location tracking enabled.
          </p>
        ) : (
          <MemberMapCanvas
            members={pinned}
            theme={theme}
            center={center}
            zoom={zoom}
            className="h-[240px] w-full"
          />
        )}
      </section>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          showCloseButton={false}
          className="grid h-[92dvh] w-[96vw] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-none"
        >
          <DialogHeader className="flex-row items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold text-foreground">
                Member locations
              </DialogTitle>
              <DialogDescription className="truncate">
                {activeLocatedCount} active · {inactiveLocatedCount} inactive
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              title="Minimize member map"
              aria-label="Minimize member map"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <Minimize2 className="size-4" aria-hidden="true" />
            </button>
          </DialogHeader>
          <MemberMapCanvas
            members={pinned}
            theme={theme}
            center={center}
            zoom={zoom}
            className="size-full min-h-0"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

function MemberMapCanvas({
  members,
  theme,
  center,
  zoom,
  className,
}: {
  members: WorkspaceMemberActivity[]
  theme: 'light' | 'dark'
  center: { latitude: number; longitude: number }
  zoom: number
  className: string
}) {
  return (
    <Map
      theme={theme}
      center={[center.longitude, center.latitude]}
      zoom={zoom}
      className={className}
    >
      <MapControls />
      {members.map((member) => {
        const origin = member.latestOrigin!
        const isActive = member.activeEntry !== null
        const initials = getInitials(member.name)
        return (
          <MapMarker
            key={member.memberId}
            longitude={origin.longitude}
            latitude={origin.latitude}
          >
            <MarkerContent>
              <div
                className={`relative flex size-9 items-center justify-center rounded-full border-2 bg-card text-[10px] font-bold shadow-lg transition-transform hover:scale-110 ${
                  isActive
                    ? 'border-emerald-500 text-emerald-700 ring-4 ring-emerald-500/20 dark:text-emerald-300'
                    : 'border-muted-foreground/50 text-muted-foreground'
                }`}
                title={`${member.name} · ${isActive ? 'Active now' : 'Inactive'}`}
                aria-label={`${member.name}, ${isActive ? 'active now' : 'inactive'}`}
              >
                {member.avatarUrl ? (
                  <img
                    src={member.avatarUrl}
                    alt=""
                    className="size-full rounded-full object-cover"
                  />
                ) : (
                  initials
                )}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card ${
                    isActive ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                  }`}
                  aria-hidden="true"
                />
              </div>
            </MarkerContent>
            <MarkerPopup className="w-40 p-2">
              <div className="flex items-center gap-2">
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    isActive ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="m-0 truncate text-sm font-semibold text-foreground">
                    {member.name}
                  </p>
                  <p className="m-0 text-[11px] text-muted-foreground">
                    {isActive ? 'Active now' : 'Inactive'}
                  </p>
                </div>
              </div>
            </MarkerPopup>
          </MapMarker>
        )
      })}
    </Map>
  )
}

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('') || '?'
  )
}

function averagePosition(
  origins: Array<{ latitude: number; longitude: number }>,
): { latitude: number; longitude: number } {
  const sum = origins.reduce(
    (acc, o) => ({
      latitude: acc.latitude + o.latitude,
      longitude: acc.longitude + o.longitude,
    }),
    { latitude: 0, longitude: 0 },
  )
  return {
    latitude: sum.latitude / origins.length,
    longitude: sum.longitude / origins.length,
  }
}

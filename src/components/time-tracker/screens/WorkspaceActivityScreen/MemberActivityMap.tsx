import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerPopup,
  useMap,
} from '#/components/ui/map'
import { useAppTheme } from '#/hooks/useAppTheme'
import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { LngLatBounds } from 'maplibre-gl'
import {
  countRunningTimers,
  getTimerStatusLabel,
  hasRunningTimer,
} from './member-timer-status'
import type { WorkspaceMemberActivity } from '#/lib/server/tracker/activity.server'

/**
 * Workspace-wide activity map: one pin per member at the coordinates stored
 * for their latest geo-resolved entry. The coordinates are network-derived,
 * so they represent the entry's approximate area rather than device GPS.
 */
export function MemberActivityMap({
  members,
  filters,
}: {
  members: WorkspaceMemberActivity[]
  filters: { departmentId?: string; q?: string }
}) {
  const pinned = members.filter((m) => m.latestOrigin !== null)
  const runningLocatedCount = countRunningTimers(pinned)
  const idleLocatedCount = pinned.length - runningLocatedCount

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-col items-start justify-between gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">
            Member locations
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            Fixed overview of approximate locations · mapped members only
          </p>
        </div>
        <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:shrink-0 sm:items-end">
          <div className="flex flex-wrap justify-start gap-x-3 gap-y-1 text-xs font-medium sm:justify-end">
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span
                className="size-2 rounded-full bg-emerald-500"
                aria-hidden="true"
              />
              {runningLocatedCount} with running timers
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2 rounded-full bg-muted-foreground/50"
                aria-hidden="true"
              />
              {idleLocatedCount} without running timers
            </span>
          </div>
          {pinned.length > 0 && (
            <Link
              to="/app/workspace/activity/map"
              search={{
                departmentId: filters.departmentId,
                q: filters.q,
              }}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground no-underline transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              View maps full screen
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      {pinned.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No location data yet. Pins appear once entries are logged with
          location tracking enabled.
        </p>
      ) : (
        <MemberLocationMap members={pinned} className="h-[240px] w-full" />
      )}
    </section>
  )
}

type MemberFit = {
  /** Initial paint center/zoom (first pin) so the map never opens empty. */
  center: { latitude: number; longitude: number }
  zoom: number
  /** Tightest bounds containing every pin; null while there are none. */
  bounds: LngLatBounds | null
  /** True when every pin shares one location — zoom to it instead of fitting. */
  singlePoint: boolean
  /** Coarse coordinate fingerprint; refit only when the pin set changes. */
  signature: string
}

const PH_FALLBACK = { latitude: 12.8797, longitude: 121.774 }
const SINGLE_POINT_ZOOM = 10
const FIT_PADDING = 48
const FIT_MAX_ZOOM = 13

function computeMemberFit(members: WorkspaceMemberActivity[]): MemberFit {
  const origins = members
    .map((m) => m.latestOrigin)
    .filter((o): o is NonNullable<typeof o> => o !== null)
  if (origins.length === 0) {
    return {
      center: PH_FALLBACK,
      zoom: 5,
      bounds: null,
      singlePoint: false,
      signature: '',
    }
  }

  const signature = origins
    .map((o) => `${o.longitude.toFixed(3)},${o.latitude.toFixed(3)}`)
    .sort()
    .join('|')

  // Unwrap longitudes relative to the first pin so sets straddling the
  // antimeridian bound the short way around instead of spanning the globe.
  const anchorLng = origins[0].longitude
  const unwrap = (lng: number) => {
    let delta = lng - anchorLng
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    return anchorLng + delta
  }

  const bounds = origins.reduce(
    (acc, o) => acc.extend([unwrap(o.longitude), o.latitude]),
    new LngLatBounds(
      [unwrap(origins[0].longitude), origins[0].latitude],
      [unwrap(origins[0].longitude), origins[0].latitude],
    ),
  )
  const singlePoint =
    bounds.getWest() === bounds.getEast() &&
    bounds.getSouth() === bounds.getNorth()

  return {
    center: {
      latitude: origins[0].latitude,
      longitude: origins[0].longitude,
    },
    zoom: SINGLE_POINT_ZOOM,
    bounds,
    singlePoint,
    signature,
  }
}

/**
 * Frames every plotted pin once the map has loaded, and refits when the pin
 * set changes (filters, live activity updates).
 * Unrelated parent re-renders never refit: the
 * coordinate fingerprint gates the effect.
 * Renders nothing itself.
 */
function MapFitAllPoints({ fit }: { fit: MemberFit }) {
  const { map, isLoaded } = useMap()
  const lastSignature = useRef<string | null>(null)

  useEffect(() => {
    if (!map || !isLoaded || !fit.bounds || !fit.signature) return
    if (lastSignature.current === fit.signature) return
    lastSignature.current = fit.signature
    if (fit.singlePoint) {
      map.jumpTo({
        center: [fit.center.longitude, fit.center.latitude],
        zoom: SINGLE_POINT_ZOOM,
      })
      return
    }
    map.fitBounds(fit.bounds, {
      padding: FIT_PADDING,
      maxZoom: FIT_MAX_ZOOM,
      duration: 500,
    })
  }, [map, isLoaded, fit])

  return null
}

export function MemberLocationMap({
  members,
  className,
  interactive = false,
  onSelectMember,
}: {
  members: WorkspaceMemberActivity[]
  className: string
  interactive?: boolean
  onSelectMember?: (member: WorkspaceMemberActivity) => void
}) {
  const theme = useAppTheme()
  // Frame every pin instead of centering on a geographic average at a fixed
  // zoom — the viewport locks to the tightest view containing all members.
  const fit = useMemo(() => computeMemberFit(members), [members])

  return (
    <Map
      theme={theme}
      center={[fit.center.longitude, fit.center.latitude]}
      zoom={fit.zoom}
      className={className}
      interactive={interactive}
    >
      {interactive && <MapControls showCompass />}
      <MapFitAllPoints fit={fit} />
      {members.map((member) => {
        const origin = member.latestOrigin!
        const isTimerRunning = hasRunningTimer(member)
        const timerStatus = getTimerStatusLabel(member)
        const initials = getInitials(member.name)
        return (
          <MapMarker
            key={member.memberId}
            longitude={origin.longitude}
            latitude={origin.latitude}
          >
            <MarkerContent>
              <button
                type="button"
                onClick={() => onSelectMember?.(member)}
                className={`relative flex size-9 items-center justify-center rounded-full border-2 bg-card text-[10px] font-bold shadow-lg transition-transform hover:scale-110 ${
                  isTimerRunning
                    ? 'border-emerald-500 text-emerald-700 ring-4 ring-emerald-500/20 dark:text-emerald-300'
                    : 'border-muted-foreground/50 text-muted-foreground'
                }`}
                title={`${onSelectMember ? 'View activity for' : 'View'} ${member.name} · ${timerStatus}`}
                aria-label={`${onSelectMember ? 'View activity for' : 'View'} ${member.name}, ${timerStatus.toLowerCase()}`}
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
                    isTimerRunning ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                  }`}
                  aria-hidden="true"
                />
              </button>
            </MarkerContent>
            {!onSelectMember && (
              <MarkerPopup className="w-56 p-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`size-2 shrink-0 rounded-full ${
                      isTimerRunning
                        ? 'bg-emerald-500'
                        : 'bg-muted-foreground/50'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="m-0 break-words text-sm font-semibold text-foreground">
                      {member.name}
                    </p>
                    <p className="m-0 text-[11px] text-muted-foreground">
                      {timerStatus}
                    </p>
                  </div>
                </div>
              </MarkerPopup>
            )}
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

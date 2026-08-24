import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock3, MapPin, Navigation, X } from 'lucide-react'
import { Combobox } from '#/components/ui/combobox'
import { LocationBadge } from '#/components/time-tracker/LocationBadge'
import {
  Map as LocationMap,
  MapControls,
  MapMarker,
  MarkerContent,
} from '#/components/ui/map'
import { useAppTheme } from '#/hooks/useAppTheme'
import { formatDuration } from '#/lib/time-tracker/store'
import {
  fetchLocationHistory,
  getLocationHistoryQueryKey,
} from '#/lib/time-tracker/location-history-query'
import { captureDeviceLocation } from '#/lib/time-tracker/device-location'
import { refreshEntryLocationFn } from '#/lib/server/tracker'
import { gooeyToast } from '#/lib/toast'
import {
  closeLocationPanel,
  getLocationHistoryViewState,
  openLocationPanel,
} from './location-history-view'
import { EntryLocationRefreshButton } from './EntryLocationRefreshButton'
import type { MapRef } from '#/components/ui/map'
import type {
  LocationHistoryEntry,
  LocationHistoryPayload,
} from '#/lib/server/tracker/location-history.server'

type LocationHistoryFilters = {
  memberId?: string
}

type LocationGroup = {
  key: string
  latitude: number
  longitude: number
  location: string | null
  entries: LocationHistoryEntry[]
}

export function LocationHistoryScreen({
  initialData,
  currentFilters,
  onChangeMember,
}: {
  initialData: LocationHistoryPayload
  currentFilters: LocationHistoryFilters
  onChangeMember: (memberId: string) => void
}) {
  const theme = useAppTheme()
  const queryClient = useQueryClient()
  const mapRef = useRef<MapRef>(null)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [panelState, setPanelState] = useState({
    groupKey: null as string | null,
    open: false,
  })
  const locationHistoryQueryKey = getLocationHistoryQueryKey(currentFilters)
  const { data = initialData, isFetching } = useQuery({
    queryKey: locationHistoryQueryKey,
    queryFn: () => fetchLocationHistory(currentFilters),
    initialData,
    staleTime: 30_000,
  })
  const refreshEntryLocation = useMutation({
    mutationKey: ['refresh-entry-location'],
    mutationFn: async (entryId: string) => {
      const deviceLocation = await captureDeviceLocation()
      if (!deviceLocation) {
        throw new Error(
          'Allow precise location access in your browser, then try again.',
        )
      }
      return refreshEntryLocationFn({ data: { id: entryId, deviceLocation } })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: locationHistoryQueryKey,
        exact: true,
      })
      gooeyToast.success('Entry location updated')
    },
    onError: (error) => {
      gooeyToast.error('Location refresh failed', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      })
    },
  })

  const groups = useMemo(() => groupEntries(data.entries), [data.entries])
  const viewport = useMemo(() => getViewport(groups), [groups])
  const { selectedMember, hasSelectedMember, showEmptyState } =
    getLocationHistoryViewState(data)
  const selectedGroup = groups.find(
    (group) => group.key === panelState.groupKey,
  )

  useEffect(() => {
    setSelectedEntryId(null)
    setPanelState({ groupKey: null, open: false })
  }, [data.selectedMemberId])

  function selectGroup(group: LocationGroup) {
    setSelectedEntryId(null)
    setPanelState(openLocationPanel(group.key))
  }

  function focusEntry(entry: LocationHistoryEntry) {
    setSelectedEntryId(entry.id)
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    mapRef.current?.flyTo({
      center: [entry.longitude, entry.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 10),
      duration: reduceMotion ? 0 : 500,
    })
  }

  return (
    <section className="relative h-full min-h-0 min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <LocationMap
        key={data.selectedMemberId || 'all-members'}
        ref={mapRef}
        theme={theme}
        center={viewport.center}
        zoom={viewport.zoom}
        loading={isFetching}
        className="absolute inset-0 h-full w-full"
      >
        <MapControls />
        {groups.map((group) => {
          const selected = panelState.open && group.key === panelState.groupKey
          return (
            <MapMarker
              key={group.key}
              longitude={group.longitude}
              latitude={group.latitude}
              onClick={() => selectGroup(group)}
            >
              <MarkerContent>
                <button
                  type="button"
                  className={`flex size-9 items-center justify-center rounded-full border-[3px] border-white text-xs font-black shadow-lg transition-transform ${
                    selected
                      ? 'scale-110 bg-amber-500 text-white'
                      : 'bg-primary text-primary-foreground'
                  }`}
                  aria-label={`${group.entries.length} tasks at ${group.location ?? 'this location'}`}
                >
                  {group.entries.length}
                </button>
              </MarkerContent>
            </MapMarker>
          )
        })}
      </LocationMap>

      <div className="absolute left-3 top-3 z-10 w-[min(22rem,calc(100%-1.5rem))] rounded-lg border border-border/80 bg-background/95 p-3 shadow-lg backdrop-blur-sm">
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-1.5 block text-xs font-bold text-foreground">
            Team member
          </legend>
          {hasSelectedMember && (
            <button
              type="button"
              onClick={() => onChangeMember('')}
              className="absolute right-3 top-2.5 inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Clear member filter and show all members"
            >
              <X className="size-3" />
              Clear
            </button>
          )}
          <Combobox
            value={data.selectedMemberId}
            onValueChange={onChangeMember}
            options={[
              {
                value: '',
                label: 'All members',
                description: `${data.members.length} active members`,
              },
              ...data.members.map((member) => ({
                value: member.id,
                label: member.name,
                description: member.departmentName ?? member.email,
              })),
            ]}
            placeholder="All members"
            searchPlaceholder="Search members..."
            emptyText="No members found."
            className="h-10 bg-background"
          />
        </fieldset>
        <p className="m-0 mt-2 text-[11px] leading-4 text-muted-foreground">
          {selectedMember
            ? `${data.entries.length} located task ${data.entries.length === 1 ? 'entry' : 'entries'} for ${selectedMember.name}`
            : `${data.entries.length} located task ${data.entries.length === 1 ? 'entry' : 'entries'} across all members`}
        </p>
        <div className="mt-2 border-t border-border/70 pt-2">
          <LocationBadge />
        </div>
      </div>

      {showEmptyState && !isFetching && (
        <MapMessage
          icon={MapPin}
          title="No task locations yet"
          description={
            selectedMember
              ? `${selectedMember.name} has no time entries with resolved location data.`
              : 'No members have time entries with resolved location data.'
          }
        />
      )}

      {data.entries.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border/80 bg-background/90 px-2.5 py-1.5 shadow-sm backdrop-blur">
          <p className="m-0 flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Navigation className="size-3.5 text-primary" />
            Select a pinpoint to review its tasks
          </p>
        </div>
      )}

      <aside
        className="t-panel-slide absolute inset-y-3 right-3 z-20 flex w-[min(24rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl border border-border/80 bg-background/95 shadow-xl backdrop-blur-md"
        data-open={panelState.open && Boolean(selectedGroup)}
        aria-hidden={!panelState.open}
        inert={!panelState.open}
        aria-label="Location task details"
      >
        {selectedGroup && (
          <>
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3.5">
              <div className="min-w-0">
                <p className="m-0 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
                  <MapPin className="size-3.5" />
                  Selected location
                </p>
                <h2 className="m-0 mt-1 truncate text-base font-bold text-foreground">
                  {selectedGroup.location ?? 'Resolved map point'}
                </h2>
                <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                  {selectedGroup.entries.length}{' '}
                  {selectedGroup.entries.length === 1
                    ? 'task entry'
                    : 'task entries'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPanelState(closeLocationPanel)}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close location details"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {selectedGroup.entries.map((entry) => {
                const entryName =
                  entry.taskName || entry.description || 'Untitled task'
                const entryLocation =
                  entry.location ??
                  `${entry.latitude.toFixed(5)}, ${entry.longitude.toFixed(5)}`
                const canRefreshLocation =
                  entry.memberId === data.currentMemberId
                const isRefreshingLocation =
                  refreshEntryLocation.isPending &&
                  refreshEntryLocation.variables === entry.id

                return (
                  <div
                    key={entry.id}
                    className={`relative transition-colors hover:bg-muted/70 ${
                      selectedEntryId === entry.id ? 'bg-primary/8' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => focusEntry(entry)}
                      className={`w-full px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                        canRefreshLocation ? 'pr-32' : ''
                      }`}
                    >
                      <span className="block truncate text-sm font-bold text-foreground">
                        {entryName}
                      </span>
                      {entry.projectName && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {entry.projectName}
                        </span>
                      )}
                      <span
                        className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground"
                        title={entryLocation}
                      >
                        <MapPin
                          className="size-3 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span className="truncate">{entryLocation}</span>
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="min-w-0 truncate font-medium text-foreground/80">
                          {entry.memberName}
                        </span>
                        <span className="shrink-0">
                          {formatEntryTime(entry.startedAt, data.timezone)}
                        </span>
                      </span>
                      <span className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                        <Clock3 className="size-3" />
                        {entry.endedAt
                          ? formatDuration(entry.durationSeconds)
                          : 'Running'}
                      </span>
                    </button>
                    {canRefreshLocation && (
                      <EntryLocationRefreshButton
                        entryName={entryName}
                        refreshing={isRefreshingLocation}
                        onRefresh={() => refreshEntryLocation.mutate(entry.id)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </aside>
    </section>
  )
}

function MapMessage({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof MapPin
  title: string
  description: string
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 pt-24">
      <div className="max-w-sm rounded-xl border border-border/80 bg-background/95 px-6 py-5 text-center shadow-lg backdrop-blur-sm">
        <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <h2 className="m-0 mt-3 text-sm font-bold text-foreground">{title}</h2>
        <p className="m-0 mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  )
}

/*
 * Entries with the same rounded coordinate share one pinpoint. This keeps
 * repeated work from the same network legible without hiding individual tasks
 * in the marker popup.
 */
function groupEntries(entries: LocationHistoryEntry[]): LocationGroup[] {
  const groups = new Map<string, LocationGroup>()
  for (const entry of entries) {
    const key = `${entry.latitude.toFixed(5)}:${entry.longitude.toFixed(5)}`
    const existing = groups.get(key)
    if (existing) {
      existing.entries.push(entry)
    } else {
      groups.set(key, {
        key,
        latitude: entry.latitude,
        longitude: entry.longitude,
        location: entry.location,
        entries: [entry],
      })
    }
  }
  return [...groups.values()]
}

function getViewport(groups: LocationGroup[]) {
  if (groups.length === 0) {
    return { center: [121.774, 12.8797] as [number, number], zoom: 4 }
  }
  const latitudes = groups.map((group) => group.latitude)
  const longitudes = groups.map((group) => group.longitude)
  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLng = Math.min(...longitudes)
  const maxLng = Math.max(...longitudes)
  const span = Math.max(maxLat - minLat, maxLng - minLng)
  const zoom =
    groups.length === 1
      ? 10
      : span > 100
        ? 2
        : span > 40
          ? 3
          : span > 15
            ? 4
            : span > 5
              ? 5
              : span > 1
                ? 7
                : 9

  return {
    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2] as [number, number],
    zoom,
  }
}

function formatEntryTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

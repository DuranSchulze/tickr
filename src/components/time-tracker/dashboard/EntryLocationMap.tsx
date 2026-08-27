import { Map, MapMarker, MarkerContent } from '#/components/ui/map'
import { useAppTheme } from '#/hooks/useAppTheme'

type EntryLocationMapProps = {
  latitude: number
  longitude: number
  /** Optional label shown in the corner (e.g. resolved place or city name). */
  location?: string | null
  /** Where the coordinates came from — device fixes zoom in, network ones stay city-level. */
  source?: 'device' | 'network' | null
  /** Accuracy radius in meters for device fixes. */
  accuracyMeters?: number | null
}

/**
 * Non-interactive mini map showing a single entry origin pin. Sized for the
 * edit drawer's preview panel; interaction is disabled so map gestures never
 * hijack the drawer's scrolling.
 */
export function EntryLocationMap({
  latitude,
  longitude,
  location,
  source,
  accuracyMeters,
}: EntryLocationMapProps) {
  const theme = useAppTheme()
  const isDevice = source === 'device'

  return (
    <div className="relative mt-2 overflow-hidden rounded-md border border-border">
      <Map
        theme={theme}
        center={[longitude, latitude]}
        zoom={isDevice ? 14 : 10}
        interactive={false}
        attributionControl={false}
        className="h-[160px] w-full"
      >
        <MapMarker longitude={longitude} latitude={latitude}>
          <MarkerContent>
            <div className="bg-primary size-4 rounded-full border-2 border-white shadow-lg" />
          </MarkerContent>
        </MapMarker>
      </Map>
      {location && (
        <span className="bg-background/80 text-muted-foreground pointer-events-none absolute bottom-1.5 left-1.5 max-w-[calc(100%-3rem)] truncate rounded px-1.5 py-0.5 text-[10px] font-medium">
          {location}
        </span>
      )}
      {isDevice && accuracyMeters != null && (
        <span className="bg-background/80 text-muted-foreground pointer-events-none absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium">
          GPS ±{accuracyMeters.toLocaleString('en-US')} m
        </span>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { MapPin } from 'lucide-react'
import { gooeyToast } from '#/lib/toast'
import { updateWorkspaceSettingsFn } from '#/lib/server/tracker'

/**
 * Owner/Admin control for entry origin tracking. Toggling off stops all new
 * captures immediately; previously stored origin data is retained.
 */
export function LocationTrackingPanel({
  locationTrackingEnabled,
  canEdit,
}: {
  locationTrackingEnabled: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(locationTrackingEnabled)
  const [pending, setPending] = useState(false)

  async function toggle(next: boolean) {
    setPending(true)
    try {
      await updateWorkspaceSettingsFn({
        data: { locationTrackingEnabled: next },
      })
      setEnabled(next)
      await router.invalidate()
      gooeyToast.success(
        next ? 'Location tracking enabled' : 'Location tracking disabled',
      )
    } catch (err) {
      gooeyToast.error('Could not update setting', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="m-0 flex items-center gap-2 text-base font-bold text-foreground">
            <MapPin className="size-4 text-primary" />
            Location tracking
          </h2>
          <p className="m-0 mt-1 max-w-2xl text-sm text-muted-foreground">
            Records the IP address and approximate city-level location on each
            new time entry, shown on the Team Activity map and in entry
            details. Disabling stops new captures — existing data is kept.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle location tracking"
          disabled={pending || !canEdit}
          onClick={() => toggle(!enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            enabled ? 'bg-primary' : 'bg-muted-foreground/30'
          }`}
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
              enabled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>
      {!canEdit && (
        <p className="m-0 mt-3 text-xs text-muted-foreground">
          Only the workspace Owner can change this setting.
        </p>
      )}
    </section>
  )
}

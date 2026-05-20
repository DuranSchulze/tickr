import { useCallback, useEffect, useState } from 'react'
import type { FeatureManifest, ChangelogEntry } from './types'
import { STORAGE_KEYS } from './types'
import manifestData from './manifest.json'

const manifest = manifestData as FeatureManifest

/**
 * The type of announcement dialog currently visible.
 * `'none'` means nothing is shown; `'onboarding'` / `'changelog'` are shown.
 * A `changelog` state always carries the matching entry.
 */
export type AnnouncementState =
  | { type: 'none' }
  | { type: 'onboarding' }
  | { type: 'changelog'; entry: ChangelogEntry }

/**
 * Determines which announcement dialog (if any) should be shown to the user.
 *
 * Priority:
 *  1. Onboarding — shown once for new users
 *  2. Changelog  — shown when `appVersion` is newer than the last seen version
 *  3. None       — nothing to show
 */
export function useAnnouncements() {
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState<AnnouncementState>({ type: 'none' })

  // ── Deterministic decision helpers ──────────────────────────────────────

  const shouldShowOnboarding = useCallback(() => {
    const dismissed =
      localStorage.getItem(STORAGE_KEYS.ONBOARDING_DISMISSED) === 'true'
    return (
      manifest.onboarding.enabled &&
      !dismissed &&
      manifest.onboarding.steps.length > 0
    )
  }, [])

  const unseenChangelog = useCallback((): ChangelogEntry | null => {
    const seenVersion = localStorage.getItem(STORAGE_KEYS.CHANGELOG_VERSION)
    return (
      manifest.updates.find((entry) => entry.version !== seenVersion) ?? null
    )
  }, [])

  // ── Auto-show on first load ─────────────────────────────────────────────

  useEffect(() => {
    if (shouldShowOnboarding()) {
      setState({ type: 'onboarding' })
    } else {
      const unseen = unseenChangelog()
      if (unseen) {
        setState({ type: 'changelog', entry: unseen })
      }
    }
    setLoading(false)
  }, [shouldShowOnboarding, unseenChangelog])

  // ── Dismissals ──────────────────────────────────────────────────────────

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_DISMISSED, 'true')
    // After dismissal, cascade to changelog check
    const unseen = unseenChangelog()
    if (unseen) {
      setState({ type: 'changelog', entry: unseen })
    } else {
      setState({ type: 'none' })
    }
  }, [unseenChangelog])

  const dismissChangelog = useCallback(() => {
    localStorage.setItem(STORAGE_KEYS.CHANGELOG_VERSION, manifest.appVersion)
    setState({ type: 'none' })
  }, [])

  // ── Manual re-open (called from the Navbar INFO button) ─────────────────

  const showOnboarding = useCallback(() => {
    setState({ type: 'onboarding' })
  }, [])

  const showChangelog = useCallback(() => {
    // Show the latest changelog entry
    const latest = manifest.updates.at(0)
    if (latest) {
      setState({ type: 'changelog', entry: latest })
    }
  }, [])

  const closeAll = useCallback(() => {
    setState({ type: 'none' })
  }, [])

  return {
    state,
    loading,
    dismissOnboarding,
    dismissChangelog,
    showOnboarding,
    showChangelog,
    closeAll,
  }
}

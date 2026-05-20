import { createContext, useContext } from 'react'
import { useAnnouncements } from './useAnnouncements'
import { OnboardingDialog } from './OnboardingDialog'
import { ChangelogDialog } from './ChangelogDialog'
import type { AnnouncementState } from './useAnnouncements'

// ── Context ────────────────────────────────────────────────────────────────

interface AnnouncementContextValue {
  /** Manually re-open the onboarding walkthrough at any time */
  showOnboarding: () => void
  /** Manually re-open the latest changelog */
  showChangelog: () => void
}

const AnnouncementContext = createContext<AnnouncementContextValue | null>(null)

export function useAnnouncementContext(): AnnouncementContextValue {
  const ctx = useContext(AnnouncementContext)
  if (!ctx) {
    throw new Error(
      'useAnnouncementContext must be used within <AnnouncementProvider>',
    )
  }
  return ctx
}

// ── Provider ────────────────────────────────────────────────────────────────

export function AnnouncementProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const {
    state,
    dismissOnboarding,
    dismissChangelog,
    showOnboarding,
    showChangelog,
    loading,
  } = useAnnouncements()

  return (
    <AnnouncementContext.Provider value={{ showOnboarding, showChangelog }}>
      {children}

      {/* Don't render dialogs until we've read localStorage to avoid flash */}
      {!loading && (
        <DialogRenderer
          state={state}
          onDismissOnboarding={dismissOnboarding}
          onDismissChangelog={dismissChangelog}
        />
      )}
    </AnnouncementContext.Provider>
  )
}

// ── Dialog renderer ─────────────────────────────────────────────────────────

function DialogRenderer({
  state,
  onDismissOnboarding,
  onDismissChangelog,
}: {
  state: AnnouncementState
  onDismissOnboarding: () => void
  onDismissChangelog: () => void
}) {
  if (state.type === 'onboarding') {
    return <OnboardingDialog open onComplete={onDismissOnboarding} />
  }

  if (state.type === 'changelog') {
    return (
      <ChangelogDialog
        open
        entry={state.entry}
        onComplete={onDismissChangelog}
      />
    )
  }

  return null
}

import { useSyncExternalStore } from 'react'

// Matches Tailwind's `sm:` breakpoint — the cutoff between the mobile card
// list and the desktop table in the entries views.
const QUERY = '(min-width: 640px)'

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

// SSR renders the desktop layout; the client corrects itself right after
// hydration if it's actually a phone.
function getServerSnapshot() {
  return true
}

/**
 * True at or above the `sm` breakpoint. Used to mount only one of the two
 * entry-list layouts instead of rendering both and hiding one with CSS —
 * halving the rendered rows and the DOM kept in memory.
 */
export function useIsDesktop() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

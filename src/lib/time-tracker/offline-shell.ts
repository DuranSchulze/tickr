/**
 * Offline boot shell (offline-mode REQ-6, decision Q2). `/app` routes requested
 * with this search param render without server loaders, so the HTML carries
 * no user data and the service worker may cache it as the offline document.
 */
export const OFFLINE_SHELL_PARAM = 'offline-shell'

/** The app pages that open offline, and the shell document cached for each. */
export const OFFLINE_SHELL_PAGES = [
  '/app/time-tracker',
  '/app/timesheet',
] as const

export function offlineShellUrl(pathname: string) {
  return `${pathname}?${OFFLINE_SHELL_PARAM}=1`
}

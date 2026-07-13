const RELOAD_ATTEMPT_PREFIX = 'trackly:preload-reload:'

type PreloadErrorEvent = Event & { payload?: unknown }

function errorMessage(payload: unknown): string {
  if (payload instanceof Error) return payload.message
  if (typeof payload === 'string') return payload
  return 'unknown-preload-error'
}

export function preloadErrorAsset(payload: unknown): string {
  const message = errorMessage(payload)
  const match = message.match(/https?:\/\/[^\s)'"`]+|\/assets\/[^\s)'"`]+/)
  return match?.[0] ?? message.slice(0, 500)
}

export function recoverFromPreloadError(
  event: PreloadErrorEvent,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  reload: () => void,
): boolean {
  const key = `${RELOAD_ATTEMPT_PREFIX}${preloadErrorAsset(event.payload)}`

  try {
    if (storage.getItem(key)) return false
    storage.setItem(key, '1')
  } catch {
    // Without session storage there is no safe way to prevent a reload loop.
    return false
  }

  // Vite throws the import error unless the recovery handler cancels it.
  event.preventDefault()
  reload()
  return true
}

export function installPreloadErrorRecovery(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('vite:preloadError', (event) => {
    recoverFromPreloadError(
      event as PreloadErrorEvent,
      window.sessionStorage,
      () => window.location.reload(),
    )
  })
}

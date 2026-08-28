import { useCallback, useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Drives the "Install app" entry point.
 *
 * Chrome/Edge expose the native install sheet through `beforeinstallprompt`,
 * which we capture and trigger on demand. iOS Safari has no such API, so
 * callers fall back to step-by-step "Add to Home Screen" instructions.
 *
 * Platform flags start as their SSR-safe defaults and settle on the client in
 * an effect, so server HTML and first client render always agree.
 */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIos, setIsIos] = useState(false)

  useEffect(() => {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)')

    // `navigator.standalone` is the legacy iOS property, absent from DOM types.
    const nav = navigator as Navigator & { standalone?: boolean }
    const checkInstalled = () =>
      setIsInstalled(standaloneQuery.matches || nav.standalone === true)

    checkInstalled()

    // iPadOS masquerades as desktop Safari; touch points are the giveaway.
    const ios =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /macintosh/i.test(navigator.userAgent))
    setIsIos(ios)

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }
    const onDisplayModeChange = () => checkInstalled()

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    standaloneQuery.addEventListener('change', onDisplayModeChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      standaloneQuery.removeEventListener('change', onDisplayModeChange)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable' as const
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    return outcome
  }, [deferredPrompt])

  return {
    /** Native install sheet is available (Chrome, Edge, Android). */
    canPrompt: deferredPrompt !== null,
    /** Running as an installed app rather than in a browser tab. */
    isInstalled,
    /** iOS/iPadOS Safari, which needs manual "Add to Home Screen" steps. */
    isIos,
    promptInstall,
  }
}

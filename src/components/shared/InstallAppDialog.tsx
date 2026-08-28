import { useState } from 'react'
import { Download, Plus, Share } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { AppLogo } from '#/components/ui/AppLogo'
import { BRAND } from '#/lib/brand'
import { gooeyToast } from '#/lib/toast'

/**
 * Guides the user through installing the PWA. Prefers the browser's native
 * install sheet when available and falls back to manual instructions for
 * iOS Safari, which has no programmatic install API. Install state comes
 * from the parent's `usePwaInstall` so there is a single listener.
 */
export function InstallAppDialog({
  open,
  onOpenChange,
  canPrompt,
  isIos,
  promptInstall,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  canPrompt: boolean
  isIos: boolean
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
}) {
  const [installing, setInstalling] = useState(false)

  async function handleInstall() {
    setInstalling(true)
    const outcome = await promptInstall()
    setInstalling(false)
    if (outcome === 'accepted') {
      onOpenChange(false)
      gooeyToast.success(`${BRAND.name} installed`, {
        description: 'Find it on your home screen or launcher.',
      })
    }
    // 'dismissed' keeps the dialog open in case the tap was accidental.
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl font-black tracking-tight text-foreground">
            <AppLogo size="sm" imgClassName="dark:invert" />
            Install {BRAND.name}
          </DialogTitle>
          <DialogDescription>
            Add {BRAND.name} to your home screen for a full-screen, app-like
            experience — no app store needed.
          </DialogDescription>
        </DialogHeader>

        {canPrompt ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm text-muted-foreground">
              Your browser supports one-tap install. The timer keeps running
              even when you switch apps.
            </p>
            <Button
              onClick={handleInstall}
              disabled={installing}
              className="w-full"
            >
              <Download className="size-4" />
              {installing ? 'Installing…' : `Install ${BRAND.name}`}
            </Button>
          </div>
        ) : isIos ? (
          <ol className="m-0 grid list-none gap-3 p-0">
            <li className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                1
              </span>
              <div className="flex flex-col gap-1 pt-0.5">
                <p className="m-0 text-sm font-semibold text-foreground">
                  Open the Share menu
                </p>
                <p className="m-0 flex items-center gap-1.5 text-sm text-muted-foreground">
                  Tap the
                  <Share className="inline size-4 shrink-0 text-foreground" />
                  icon in Safari's toolbar.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                2
              </span>
              <div className="flex flex-col gap-1 pt-0.5">
                <p className="m-0 text-sm font-semibold text-foreground">
                  Choose “Add to Home Screen”
                </p>
                <p className="m-0 flex items-center gap-1.5 text-sm text-muted-foreground">
                  Scroll down and tap
                  <Plus className="inline size-4 shrink-0 text-foreground" />
                  Add to Home Screen.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                3
              </span>
              <div className="flex flex-col gap-1 pt-0.5">
                <p className="m-0 text-sm font-semibold text-foreground">
                  Confirm
                </p>
                <p className="m-0 text-sm text-muted-foreground">
                  Tap “Add” — {BRAND.name} appears alongside your other apps.
                </p>
              </div>
            </li>
          </ol>
        ) : (
          <p className="m-0 text-sm text-muted-foreground">
            Open your browser's menu and look for “Install app” or “Add to Home
            Screen”. If it's not there, your browser doesn't support installing
            web apps yet.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

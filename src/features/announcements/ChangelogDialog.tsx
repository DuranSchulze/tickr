import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { format } from 'date-fns'
import { ArrowUpCircle, ExternalLink, Sparkles } from 'lucide-react'
import type { ChangelogEntry } from './types'

interface Props {
  open: boolean
  entry: ChangelogEntry
  onComplete: () => void
}

export function ChangelogDialog({ open, entry, onComplete }: Props) {
  const navigate = useNavigate()

  const handleAction = useCallback(
    (to: string) => {
      onComplete()
      navigate({ to } as any)
    },
    [navigate, onComplete],
  )

  const publishedLabel = entry.publishedAt
    ? (() => {
        try {
          return format(new Date(entry.publishedAt), 'MMM d, yyyy')
        } catch {
          return entry.publishedAt
        }
      })()
    : null

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onComplete()}>
      <DialogContent
        className="sm:max-w-lg gap-0! p-0! flex flex-col max-h-[85dvh]"
        showCloseButton
      >
        {/* ── Scrollable body ──────────────────────────────────────────── */}
        <div className="overflow-y-auto p-6 space-y-6">
          <DialogHeader>
            <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              What's New — v{entry.version}
            </div>

            <DialogTitle className="text-2xl font-black tracking-tight">
              {entry.title}
            </DialogTitle>

            {publishedLabel && (
              <p className="text-xs text-muted-foreground">{publishedLabel}</p>
            )}

            {entry.body && (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {entry.body}
              </p>
            )}
          </DialogHeader>

          {/* Feature list */}
          {entry.features.length > 0 && (
            <div className="space-y-3">
              {entry.features.map((feature, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-muted/50 p-4"
                >
                  <h4 className="m-0 flex items-center gap-2 text-sm font-bold">
                    <ArrowUpCircle className="h-4 w-4 shrink-0 text-primary" />
                    {feature.title}
                  </h4>
                  {feature.description && (
                    <p className="m-0 mt-1.5 text-sm leading-6 text-muted-foreground">
                      {feature.description}
                    </p>
                  )}

                  {feature.image && (
                    <div className="mt-3 overflow-hidden rounded-md border border-border bg-card">
                      <img
                        src={feature.image}
                        alt={feature.title}
                        className="h-auto w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          {(entry.actions ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {entry.actions!.map((action, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant={i === 0 ? 'default' : 'outline'}
                  onClick={() => handleAction(action.to)}
                >
                  {action.label}
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* ── Sticky dismiss footer ──────────────────────────────────── */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4 shrink-0 bg-popover">
          <Button variant="ghost" size="sm" onClick={onComplete}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

import { useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import type { OnboardingStep, FeatureManifest } from './types'
import manifestData from './manifest.json'
import { ArrowLeft, ArrowRight, ImageIcon, Sparkles } from 'lucide-react'

const manifest = manifestData as FeatureManifest

interface Props {
  open: boolean
  onComplete: () => void
}

export function OnboardingDialog({ open, onComplete }: Props) {
  const navigate = useNavigate()
  const steps = manifest.onboarding.steps
  const [currentIndex, setCurrentIndex] = useState(0)

  const step = steps[currentIndex] as OnboardingStep | undefined
  const isLast = currentIndex === steps.length - 1
  const isFirst = currentIndex === 0

  const goNext = useCallback(() => {
    if (isLast) {
      onComplete()
    } else {
      setCurrentIndex((i) => i + 1)
    }
  }, [isLast, onComplete])

  const goBack = useCallback(() => {
    if (!isFirst) {
      setCurrentIndex((i) => i - 1)
    }
  }, [isFirst])

  const handleAction = useCallback(
    (to: string) => {
      onComplete()
      navigate({ to } as any)
    },
    [navigate, onComplete],
  )

  // Reset index when dialog re-opens
  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onComplete()}>
      <DialogContent
        className="sm:max-w-lg gap-0! p-0! flex flex-col max-h-[85dvh]"
        showCloseButton
      >
        {/* ── Progress indicator (sticky top) ──────────────────────────── */}
        <div className="shrink-0 px-6 pt-6">
          <div className="flex items-center gap-1.5 mb-4">
            {steps.map((s, i) => (
              <div
                key={s.id}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors duration-300',
                  i <= currentIndex ? 'bg-primary' : 'bg-border',
                )}
              />
            ))}
          </div>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────── */}
        <div className="overflow-y-auto px-6 space-y-6 pb-2">
          {/* Image area */}
          <div
            className={cn(
              'overflow-hidden rounded-lg border',
              step?.image
                ? 'border-border bg-muted'
                : 'border-dashed border-muted-foreground/20 bg-muted/30',
            )}
          >
            {step?.image ? (
              <img
                src={step.image}
                alt={step.title}
                className="h-auto w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-44 items-center justify-center">
                <div className="flex flex-col items-center gap-1.5 text-muted-foreground/40">
                  <ImageIcon className="h-8 w-8" />
                  <span className="text-xs font-medium">Screenshot</span>
                </div>
              </div>
            )}
          </div>

          {/* Header */}
          <DialogHeader>
            {isFirst && (
              <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                {manifest.onboarding.title}
              </div>
            )}

            <DialogTitle className="text-xl font-black tracking-tight">
              {step?.title}
            </DialogTitle>

            {step?.description && (
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {step.description}
              </p>
            )}
          </DialogHeader>

          {/* Optional action CTA */}
          {step?.action && (
            <div>
              <Button
                size="sm"
                className="w-full"
                onClick={() => handleAction(step.action!.to)}
              >
                {step.action.label}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* ── Sticky navigation footer ─────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4 shrink-0 bg-popover">
          {/* Left: Skip (first) / Back (rest) */}
          <div>
            {isFirst ? (
              <Button variant="ghost" size="sm" onClick={onComplete}>
                Skip tour
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={goBack}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            )}
          </div>

          {/* Step counter */}
          <span className="text-xs text-muted-foreground">
            {currentIndex + 1} of {steps.length}
          </span>

          {/* Right: Next / Done */}
          <Button size="sm" onClick={goNext}>
            {isLast ? 'Done' : 'Next'}
            {!isLast && <ArrowRight className="ml-1.5 h-4 w-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

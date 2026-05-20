import { createFileRoute, Link } from '@tanstack/react-router'
import { BRAND } from '#/lib/brand'
import { Button } from '#/components/ui/button'
import { ArrowUpCircle, ExternalLink, Sparkles } from 'lucide-react'
import manifestData from '#/features/announcements/manifest.json'
import type { FeatureManifest } from '#/features/announcements/types'
import { format } from 'date-fns'

const manifest = manifestData as FeatureManifest

export const Route = createFileRoute('/app/changelog')({
  component: ChangelogRoute,
  head: () => ({
    meta: [{ title: `Changelog — ${BRAND.name}` }],
  }),
})

function ChangelogRoute() {
  const updates = [...manifest.updates].sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  )

  return (
    <div className="mx-auto max-w-3xl space-y-10 py-4 sm:py-8">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Changelog
        </div>
        <h1 className="m-0 text-3xl font-black tracking-tight sm:text-4xl">
          What's new
        </h1>
        <p className="m-0 mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Follow along with every update, improvement, and fix shipped to{' '}
          {BRAND.name}.
        </p>
      </div>

      {/* ── Timeline ──────────────────────────────────────────────────── */}
      <div className="relative space-y-10">
        {/* Vertical line */}
        <div
          aria-hidden
          className="absolute top-2 bottom-0 left-[11px] w-px bg-border"
        />

        {updates.length === 0 && (
          <p className="pl-9 text-sm text-muted-foreground">
            No updates yet. Check back soon!
          </p>
        )}

        {updates.map((entry) => (
          <div key={entry.version} className="relative pl-9">
            {/* Dot on the timeline */}
            <div
              aria-hidden
              className="absolute left-0 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card"
            >
              <div className="h-2 w-2 rounded-full bg-primary" />
            </div>

            {/* Release card */}
            <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
              {/* Version badge + date */}
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                  <ArrowUpCircle className="h-3.5 w-3.5" />v{entry.version}
                </span>
                {entry.publishedAt && (
                  <span className="text-xs text-muted-foreground">
                    {formatDate(entry.publishedAt)}
                  </span>
                )}
              </div>

              {/* Title & body */}
              <h2 className="m-0 text-xl font-black tracking-tight">
                {entry.title}
              </h2>
              {entry.body && (
                <p className="m-0 mt-2 text-sm leading-6 text-muted-foreground">
                  {entry.body}
                </p>
              )}

              {/* Features list */}
              {entry.features.length > 0 && (
                <div className="mt-5 space-y-4">
                  {entry.features.map((feature, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border bg-muted/30 p-4"
                    >
                      <h3 className="m-0 flex items-center gap-2 text-sm font-bold">
                        <ArrowUpCircle className="h-4 w-4 shrink-0 text-primary" />
                        {feature.title}
                      </h3>
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

              {/* CTA buttons */}
              {(entry.actions ?? []).length > 0 && (
                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  {entry.actions!.map((action, i) => (
                    <Button
                      key={i}
                      size="sm"
                      variant={i === 0 ? 'default' : 'outline'}
                      asChild
                    >
                      <Link to={action.to} className="no-underline">
                        {action.label}
                        <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'MMMM d, yyyy')
  } catch {
    return dateStr
  }
}

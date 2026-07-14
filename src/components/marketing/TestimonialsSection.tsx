import { TestimonialCard } from '#/components/ui/TestimonialCard'
import { PREVIEW_STORIES } from '#/lib/landing-content'

export function TestimonialsSection() {
  return (
    <section className="landing-section border-b border-border bg-muted/25">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">
              Built around real workflows
            </p>
            <h2 className="mt-4 text-balance font-heading text-4xl font-black tracking-[-0.04em] text-foreground sm:text-5xl">
              A better outcome for every role.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            Illustrative workflow previews—not customer endorsements. Replace
            these with verified stories as they become available.
          </p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {PREVIEW_STORIES.map((story) => (
            <TestimonialCard key={story.role} {...story} />
          ))}
        </div>
      </div>
    </section>
  )
}

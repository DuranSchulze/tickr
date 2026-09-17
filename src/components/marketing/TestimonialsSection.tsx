import { MessageSquareQuote } from 'lucide-react'
import { TestimonialCard } from '#/components/ui/TestimonialCard'

interface Testimonial {
  quote: string
  initials: string
  role: string
  company: string
}

const testimonials: Testimonial[] = []

/*
 * Sample testimonial data — keep disabled until each review is verified.
 * Add real customer approval and attribution before moving an entry into
 * the active `testimonials` array above.
 *
 * const sampleTestimonials: Testimonial[] = [
 *   {
 *     quote: 'Replace this with a verified customer review.',
 *     initials: 'JD',
 *     role: 'Customer name or role',
 *     company: 'Verified company',
 *   },
 * ]
 */

export function TestimonialsSection() {
  return (
    <section className="landing-section border-b border-stone bg-eggshell">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-graphite">
              Customer stories
            </p>
            <h2 className="mt-4 text-balance font-display text-heading text-foreground sm:text-5xl">
              Real reviews, when they’re ready.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-smoke">
            We’ll only publish feedback from real Trackly users after it has
            been reviewed and approved.
          </p>
        </div>

        {testimonials.length > 0 ? (
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {testimonials.map((story) => (
              <TestimonialCard
                key={`${story.company}-${story.role}`}
                {...story}
              />
            ))}
          </div>
        ) : (
          <div className="mt-12 grid overflow-hidden rounded-xl border border-stone bg-eggshell shadow-[var(--shadow-whisper)] md:grid-cols-[8rem_1fr]">
            <div className="flex min-h-28 items-center justify-center border-b border-stone bg-warm-taupe text-graphite md:border-b-0 md:border-r">
              <MessageSquareQuote className="size-10" aria-hidden="true" />
            </div>
            <div className="p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-graphite">
                Reviews coming soon
              </p>
              <h3 className="mt-3 text-xl font-medium tracking-tight text-foreground sm:text-2xl">
                We’re currently looking for customer reviews.
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-smoke">
                Genuine Trackly stories will appear here as soon as they’re
                ready. Stay tuned.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

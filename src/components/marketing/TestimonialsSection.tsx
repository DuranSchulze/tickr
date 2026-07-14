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
    <section className="landing-section border-b border-border bg-muted/25">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">
              Customer stories
            </p>
            <h2 className="mt-4 text-balance font-heading text-4xl font-black tracking-[-0.04em] text-foreground sm:text-5xl">
              Real reviews, when they’re ready.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
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
          <div className="mt-12 grid border border-border bg-card md:grid-cols-[8rem_1fr]">
            <div className="flex min-h-28 items-center justify-center border-b border-border bg-primary/10 text-primary md:border-b-0 md:border-r">
              <MessageSquareQuote className="size-10" aria-hidden="true" />
            </div>
            <div className="p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                Reviews coming soon
              </p>
              <h3 className="mt-3 text-xl font-black tracking-tight text-foreground sm:text-2xl">
                We’re currently looking for customer reviews.
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
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

import { Quote } from 'lucide-react'

interface TestimonialCardProps {
  quote: string
  initials: string
  role: string
  company: string
}

export function TestimonialCard({
  quote,
  initials,
  role,
  company,
}: TestimonialCardProps) {
  return (
    <article className="flex h-full flex-col border border-border bg-card p-6 transition-[transform,box-shadow,border-color] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[5px_5px_0_color-mix(in_oklab,var(--primary)_14%,transparent)]">
      <Quote className="size-7 text-primary/35" aria-hidden="true" />
      <p className="mt-5 flex-1 text-base leading-7 text-foreground">
        “{quote}”
      </p>
      <div className="mt-7 flex items-center gap-3 border-t border-border pt-5">
        <span
          className="flex size-10 items-center justify-center border border-primary/30 bg-primary/10 text-xs font-black text-primary"
          aria-hidden="true"
        >
          {initials}
        </span>
        <div>
          <p className="text-sm font-bold text-foreground">{role}</p>
          <p className="text-xs text-muted-foreground">{company}</p>
        </div>
      </div>
    </article>
  )
}

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
    <article className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
      <Quote className="size-7 text-primary/35" aria-hidden="true" />
      <p className="mt-5 flex-1 text-base leading-7 text-foreground">
        “{quote}”
      </p>
      <div className="mt-7 flex items-center gap-3 border-t border-border pt-5">
        <span
          className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary"
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

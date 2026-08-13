import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { FAQ_ITEMS } from '#/lib/landing-content'

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <div
      className="t-acc border-b border-dashed border-border"
      data-open={open}
    >
      <button
        type="button"
        className="t-acc-head flex min-h-14 w-full cursor-pointer items-center justify-between gap-6 py-5 text-left text-sm font-bold text-foreground transition-colors hover:text-primary sm:text-base"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {question}
        <span className="t-acc-chevron shrink-0" aria-hidden="true">
          <ChevronDown className="size-4 text-muted-foreground" />
        </span>
      </button>
      <div id={panelId} className="t-acc-panel" aria-hidden={!open}>
        <div className="t-acc-panel-inner">
          <p className="max-w-2xl pb-5 pr-10 text-sm leading-7 text-muted-foreground">
            {answer}
          </p>
        </div>
      </div>
    </div>
  )
}

export function FaqSection() {
  return (
    <section
      id="faq"
      className="landing-section relative isolate scroll-mt-24 overflow-hidden border-b border-border bg-muted/25"
    >
      <div
        aria-hidden="true"
        className="landing-grid pointer-events-none absolute inset-0 -z-20 opacity-45"
      />
      <div
        aria-hidden="true"
        className="absolute left-[8%] top-0 -z-10 hidden h-full w-px bg-border/80 lg:block"
      />
      <div
        aria-hidden="true"
        className="absolute right-[8%] top-0 -z-10 hidden h-full w-px bg-border/80 lg:block"
      />

      <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Questions, answered
          </p>
          <h2 className="mt-4 text-balance font-heading text-4xl font-black tracking-[-0.04em] text-foreground sm:text-5xl">
            Frequently asked questions
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
            The essentials about setup, tracking, reporting, and what comes
            next.
          </p>
        </div>

        <div className="mt-12 border-t border-dashed border-border sm:mt-14">
          {FAQ_ITEMS.map((item) => (
            <FaqItem
              key={item.question}
              question={item.question}
              answer={item.answer}
            />
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Can’t find what you need?{' '}
          <a
            href="#features"
            className="font-semibold text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
          >
            Explore the product features.
          </a>
        </p>
      </div>
    </section>
  )
}

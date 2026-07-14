import { PRODUCT_SIGNALS } from '#/lib/landing-content'

export function StatsBanner() {
  return (
    <section
      aria-label="Trackly product highlights"
      className="border-b border-border bg-foreground text-background dark:bg-card dark:text-foreground"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 px-5 sm:grid-cols-3 sm:px-8 lg:px-10">
        {PRODUCT_SIGNALS.map((signal, index) => (
          <div
            key={signal.label}
            className={`flex items-baseline justify-between gap-4 py-5 sm:block sm:px-8 sm:py-7 ${index > 0 ? 'border-t border-background/15 sm:border-l sm:border-t-0 dark:border-border' : ''}`}
          >
            <p className="text-2xl font-black tracking-tight sm:text-3xl">
              {signal.value}
            </p>
            <p className="text-sm opacity-60 sm:mt-1">{signal.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

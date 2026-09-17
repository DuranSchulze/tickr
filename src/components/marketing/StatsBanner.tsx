import { PRODUCT_SIGNALS } from '#/lib/landing-content'

export function StatsBanner() {
  return (
    <section
      aria-label="Trackly product highlights"
      className="border-b border-stone bg-warm-taupe"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 px-5 sm:grid-cols-3 sm:px-8 lg:px-10">
        {PRODUCT_SIGNALS.map((signal, index) => (
          <div
            key={signal.label}
            className={`flex items-baseline justify-between gap-4 py-5 sm:block sm:px-8 sm:py-7 ${index > 0 ? 'border-t border-stone sm:border-l sm:border-t-0' : ''}`}
          >
            <p className="font-display text-2xl text-foreground sm:text-3xl">
              {signal.value}
            </p>
            <p className="text-sm text-smoke sm:mt-1">{signal.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

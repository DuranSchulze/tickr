import * as Sentry from '@sentry/react'

if (typeof window !== 'undefined' && import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    // Error reporting + light tracing only. Session replay and profiling were
    // removed deliberately: replay observes every DOM mutation (the dashboard
    // mutates every second while a timer runs) and profiling ran on 100% of
    // sessions — both added constant CPU/memory overhead on user machines.
    // Use react-grab + web-vitals for component inspection and performance work instead.
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
  })
}

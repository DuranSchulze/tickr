import * as Sentry from '@sentry/react'

if (typeof window !== 'undefined' && import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.browserProfilingIntegration(),
      Sentry.replayIntegration(),
    ],
    // Capture 100% of transactions in dev/staging; tune down in production if needed
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    // Profile every session
    profileSessionSampleRate: 1.0,
    // Record 10% of sessions, but always capture sessions that had an error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  })
}

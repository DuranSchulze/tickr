import * as Sentry from '@sentry/tanstackstart-react'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

if (process.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.VITE_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    profileSessionSampleRate: 1.0,
    profileLifecycle: 'trace',
  })
}

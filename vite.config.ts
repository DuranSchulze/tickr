import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'

const config = defineConfig(({ mode }) => ({
  resolve: { tsconfigPaths: true },
  plugins: [
    mode === 'development' ? devtools() : undefined,
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: 'vercel',
      vercel: {
        functions: {
          maxDuration: 30,
        },
      },
    }),
    viteReact(),
    // Uploads source maps to Sentry on production builds when SENTRY_AUTH_TOKEN is set.
    // In development this plugin is a no-op.
    sentryTanstackStart({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Disable upload if the auth token isn't configured (local/CI without Sentry creds)
      sourcemaps: process.env.SENTRY_AUTH_TOKEN ? undefined : { disable: true },
    }),
  ],
}))

export default config

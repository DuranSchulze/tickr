import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

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
  ],
}))

export default config

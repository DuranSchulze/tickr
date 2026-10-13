import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '#': fileURLToPath(new URL('./src', import.meta.url)),
      react: fileURLToPath(new URL('./node_modules/react', import.meta.url)),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    include: [
      'src/components/time-tracker/catalogs/ClientDetailsDialog.test.tsx',
      'src/components/time-tracker/catalogs/ProjectDetailScreen.test.tsx',
    ],
    server: { deps: { inline: ['@tanstack/react-query', 'radix-ui'] } },
  },
})

import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '#': fileURLToPath(new URL('./src', import.meta.url)),
      react: fileURLToPath(new URL('./node_modules/react', import.meta.url)),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    // Browser end-to-end checks run with `pnpm test:e2e`, not Vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    server: { deps: { inline: ['@tanstack/react-query', 'radix-ui'] } },
  },
})

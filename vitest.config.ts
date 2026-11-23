import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '#': fileURLToPath(new URL('./src', import.meta.url)),
      react: fileURLToPath(new URL('./node_modules/react', import.meta.url)),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    server: { deps: { inline: ['@tanstack/react-query', 'radix-ui'] } },
  },
})

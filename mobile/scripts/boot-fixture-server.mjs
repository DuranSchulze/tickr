import { build } from 'vite'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

// Synthetic data is injected only while priming the isolated QA profile.
// This server is stopped before cold boot; no test code enters the app build.
const result = await build({
  configFile: false,
  logLevel: 'error',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: {
    alias: { '#': fileURLToPath(new URL('../../src', import.meta.url)) },
  },
  build: {
    write: false,
    lib: {
      entry: fileURLToPath(
        new URL(
          '../../src/lib/time-tracker/__tests__/offline-bootstrap-fixtures.ts',
          import.meta.url,
        ),
      ),
      formats: ['es'],
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
const bundle = Array.isArray(result) ? result[0] : result
const code = bundle.output.find((item) => item.type === 'chunk').code
createServer((request, response) => {
  if (request.url !== '/fixture.js') {
    response.writeHead(404).end()
    return
  }
  response.writeHead(200, {
    'content-type': 'text/javascript',
    'cache-control': 'no-store',
    'access-control-allow-origin': 'http://localhost:3008',
  })
  response.end(code)
}).listen(3009, '127.0.0.1', () =>
  console.log('Synthetic boot fixture ready on localhost:3009.'),
)

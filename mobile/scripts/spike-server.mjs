import { createServer } from 'node:http'

// Local-only M0 fixture. Contains no app/session data and is never deployed.
let offline = false
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Trackly M0 spike</title></head><body><h1 id="m0-spike">Trackly offline spike</h1><script>
navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then(() => { window.__tracklySwReady = true })
</script></body></html>`
const worker = `const CACHE='trackly-m0-spike-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.add('/app/time-tracker')).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.mode==='navigate'&&url.pathname==='/app/time-tracker')event.respondWith(caches.open(CACHE).then(cache=>cache.match('/app/time-tracker')).then(cached=>cached||fetch(event.request)))});`

const server = createServer((request, response) => {
  if (
    request.method === 'POST' &&
    ['/__online', '/__offline'].includes(request.url)
  ) {
    offline = request.url === '/__offline'
    response.writeHead(204).end()
    return
  }
  if (offline) {
    response.destroy()
    return
  }
  response.setHeader('Cache-Control', 'no-store')
  if (request.url === '/sw.js') {
    response.setHeader('Content-Type', 'application/javascript')
    response.end(worker)
  } else if (request.url === '/app/time-tracker') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(html)
  } else response.writeHead(404).end()
})
server.listen(4174, '127.0.0.1', () =>
  console.log('M0 fixture: http://localhost:4174 (local-only, synthetic data)'),
)
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)))

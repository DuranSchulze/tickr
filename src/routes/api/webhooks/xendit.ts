import { createFileRoute } from '@tanstack/react-router'
import { timingSafeEqual } from 'node:crypto'
import { processXenditWebhook } from '#/lib/server/subscriptions.server'

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
}

function tokensMatch(received: string, expected: string) {
  const left = Buffer.from(received)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

export const Route = createFileRoute('/api/webhooks/xendit')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.XENDIT_WEBHOOK_VERIFICATION_TOKEN
        const received = request.headers.get('x-callback-token') || ''
        if (!expected || !tokensMatch(received, expected)) {
          return json({ error: 'Unauthorized webhook' }, { status: 401 })
        }

        try {
          await processXenditWebhook(await request.json())
          return json({ received: true })
        } catch (error) {
          console.error('Xendit webhook processing failed', error)
          return json({ error: 'Webhook processing failed' }, { status: 500 })
        }
      },
    },
  },
})

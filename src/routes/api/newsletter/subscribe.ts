import { createFileRoute } from '@tanstack/react-router'

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const Route = createFileRoute('/api/newsletter/subscribe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { email?: string }
          const email = typeof body.email === 'string' ? body.email.trim() : ''

          if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return json(
              { error: 'Please enter a valid email address.' },
              { status: 400, headers: corsHeaders },
            )
          }

          const { subscribeToNewsletter } =
            await import('#/lib/server/newsletter.server')
          const result = await subscribeToNewsletter(email)

          return json(result, { headers: corsHeaders })
        } catch {
          return json(
            { error: 'Something went wrong. Please try again.' },
            { status: 500, headers: corsHeaders },
          )
        }
      },
    },
  },
})

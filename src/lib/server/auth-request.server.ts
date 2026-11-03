import '@tanstack/react-start/server-only'
import { recordAuthResult, reserveAuthAttempt } from './auth-abuse.server'

/** Browser and public API logins share the same persistent account/IP buckets. */
export async function handleAuthRequest(
  request: Request,
  handler: (request: Request) => Promise<Response>,
): Promise<Response> {
  const path = new URL(request.url).pathname
    .replace(/^\/api\/auth/, '')
    .replace(/\/+$/, '')
  if (
    request.method !== 'POST' ||
    ![
      '/sign-in/email',
      '/sign-up/email',
      '/request-password-reset',
      '/send-verification-email',
    ].includes(path)
  ) {
    return handler(request)
  }
  let body: unknown
  try {
    body = await request.clone().json()
  } catch {
    return Response.json(
      { code: 'INVALID_BODY', message: 'A valid JSON body is required.' },
      { status: 400 },
    )
  }
  const email =
    body &&
    typeof body === 'object' &&
    'email' in body &&
    typeof body.email === 'string'
      ? body.email.slice(0, 320)
      : null
  const operation =
    path === '/sign-up/email'
      ? 'register'
      : path === '/sign-in/email'
        ? 'login'
        : 'recovery'
  const attempt = await reserveAuthAttempt({ operation, request, email })
  if (!attempt.admitted) {
    return Response.json(
      {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many attempts. Please try again later.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(attempt.retryAfterSeconds),
          'Cache-Control': 'no-store',
        },
      },
    )
  }
  const response = await handler(request)
  // Recovery responses intentionally conceal account existence and must not reset counters.
  if (operation === 'login' && response.ok)
    await recordAuthResult(attempt, 'success')
  return response
}

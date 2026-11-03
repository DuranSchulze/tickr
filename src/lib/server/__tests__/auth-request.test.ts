import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleAuthRequest } from '../auth-request.server'

const { reserve, record } = vi.hoisted(() => ({
  reserve: vi.fn(),
  record: vi.fn(),
}))
vi.mock('../auth-abuse.server', () => ({
  reserveAuthAttempt: reserve,
  recordAuthResult: record,
}))

beforeEach(() => {
  vi.clearAllMocks()
  reserve.mockResolvedValue({
    admitted: true,
    retryAfterSeconds: 900,
    resetBuckets: [],
  })
})
function request(path = '/sign-in/email') {
  return new Request(`https://app.example.com/api/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.com', password: 'Secret123!' }),
  })
}
describe('browser authentication limiter', () => {
  it('does not forward malformed JSON to the credential handler', async () => {
    const handler = vi.fn()
    const response = await handleAuthRequest(
      new Request('https://app.example.com/api/auth/sign-in/email/', {
        method: 'POST',
        body: 'bad json',
      }),
      handler,
    )
    expect(response.status).toBe(400)
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects before credential processing and includes Retry-After', async () => {
    reserve.mockResolvedValue({ admitted: false, retryAfterSeconds: 900 })
    const handler = vi.fn()
    const response = await handleAuthRequest(request(), handler)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('900')
    expect(handler).not.toHaveBeenCalled()
  })
  it('shares the API login operation, preserves the request body, and clears success counters', async () => {
    const handler = vi.fn(async (req: Request) => {
      expect((await req.json()).password).toBe('Secret123!')
      return Response.json({ success: true })
    })
    await handleAuthRequest(request(), handler)
    expect(reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'login',
        email: 'user@example.com',
      }),
    )
    expect(record).toHaveBeenCalledWith(expect.anything(), 'success')
  })
  it('does not clear failed login or generic recovery counters', async () => {
    await handleAuthRequest(
      request(),
      async () => new Response(null, { status: 401 }),
    )
    await handleAuthRequest(request('/request-password-reset'), async () =>
      Response.json({ success: true }),
    )
    expect(record).not.toHaveBeenCalled()
    expect(reserve).toHaveBeenLastCalledWith(
      expect.objectContaining({ operation: 'recovery' }),
    )
  })
})

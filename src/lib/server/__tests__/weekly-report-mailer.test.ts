import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendWeeklyReportEmail } from '../mailer'

const input = {
  to: 'member@example.com',
  subject: 'Weekly',
  text: 'Time report',
  html: '<p>Time report</p>',
  attachments: [
    {
      filename: 'weekly.pdf',
      content: 'JVBERg==',
      contentType: 'application/pdf',
    },
  ],
}
beforeEach(() => vi.stubEnv('RESEND_API_KEY', 'test-key'))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
describe('weekly report provider contract', () => {
  it('sends a private attachment with an idempotency key and returns acceptance', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ id: 'mail-1' }))
    vi.stubGlobal('fetch', fetch)
    await expect(sendWeeklyReportEmail(input, 'weekly/job-1')).resolves.toEqual(
      { provider: 'resend', id: 'mail-1' },
    )
    const [, options] = fetch.mock.calls[0]
    expect(options.headers['Idempotency-Key']).toBe('weekly/job-1')
    expect(JSON.parse(options.body)).toMatchObject({
      to: ['member@example.com'],
      attachments: [{ filename: 'weekly.pdf', content: 'JVBERg==' }],
    })
  })
  it('honors provider throttling', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('', { status: 429, headers: { 'Retry-After': '120' } }),
        ),
    )
    await expect(sendWeeklyReportEmail(input, 'key')).rejects.toMatchObject({
      outcome: 'retryable',
      retryAfterSeconds: 120,
    })
  })
  it.each([400, 401, 403, 413, 422])(
    'does not retry permanent HTTP %i',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('', { status })),
      )
      await expect(sendWeeklyReportEmail(input, 'key')).rejects.toMatchObject({
        outcome: 'terminal',
      })
    },
  )
  it.each([408, 500, 503])(
    'records ambiguous HTTP %i without fallback',
    async (status) => {
      const fetch = vi.fn().mockResolvedValue(new Response('', { status }))
      vi.stubGlobal('fetch', fetch)
      await expect(sendWeeklyReportEmail(input, 'key')).rejects.toMatchObject({
        outcome: 'uncertain',
      })
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )
  it('records a network timeout as uncertain', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    await expect(sendWeeklyReportEmail(input, 'key')).rejects.toMatchObject({
      outcome: 'uncertain',
    })
  })
})

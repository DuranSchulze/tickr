import { describe, expect, it } from 'vitest'
import { buildXenditReturnUrls } from '#/lib/subscriptions/xendit-return-urls'

describe('buildXenditReturnUrls', () => {
  it('builds return URLs for an HTTPS application origin', () => {
    expect(buildXenditReturnUrls('https://trackly.example/settings')).toEqual({
      success_return_url:
        'https://trackly.example/app/workspace/billing?checkout=success',
      cancel_return_url:
        'https://trackly.example/app/workspace/billing?checkout=canceled',
    })
  })

  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
  ])('omits optional return URLs for local sandbox checkout at %s', (url) => {
    expect(buildXenditReturnUrls(url)).toEqual({})
  })

  it('rejects non-local HTTP return origins', () => {
    expect(() => buildXenditReturnUrls('http://trackly.example')).toThrow(
      'require HTTPS',
    )
  })

  it('reports malformed application URLs clearly', () => {
    expect(() => buildXenditReturnUrls('localhost:3000')).toThrow(
      'valid absolute HTTP or HTTPS URL',
    )
  })
})

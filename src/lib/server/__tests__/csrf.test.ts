import { describe, expect, it } from 'vitest'
import { assertRequestOrigin } from '../csrf.server'

function req(headers: Record<string, string>, method = 'POST') {
  return new Request('https://app.example.com/write', { method, headers })
}
describe('cookie write origin verification', () => {
  it('rejects writes with no positive origin evidence', () => {
    expect(() => assertRequestOrigin(req({}))).toThrow('Forbidden')
    expect(() => assertRequestOrigin(req({ origin: 'null' }))).toThrow(
      'Forbidden',
    )
    expect(() =>
      assertRequestOrigin(req({ 'sec-fetch-site': 'same-site' })),
    ).toThrow('Forbidden')
  })
  it('rejects hostile origins even with a spoofed same-origin fetch header', () => {
    expect(() =>
      assertRequestOrigin(
        req({
          origin: 'https://attacker.example',
          'sec-fetch-site': 'same-origin',
        }),
      ),
    ).toThrow('Forbidden')
  })
  it('allows matching origin or browser same-origin evidence', () => {
    expect(() =>
      assertRequestOrigin(req({ origin: 'https://app.example.com' })),
    ).not.toThrow()
    expect(() =>
      assertRequestOrigin(req({ 'sec-fetch-site': 'same-origin' })),
    ).not.toThrow()
  })
  it('permits safe reads without origin headers', () => {
    expect(() => assertRequestOrigin(req({}, 'GET'))).not.toThrow()
  })
})

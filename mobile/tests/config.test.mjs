import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.MOBILE_SERVER_URL = 'https://trackly.example.com'
const { resolveServerUrl } = await import('../capacitor.config.ts')

test('uses the remote same-origin tracker and rejects credentials or injected URLs', () => {
  assert.deepEqual(
    resolveServerUrl({ MOBILE_SERVER_URL: 'https://trackly.example.com/' }),
    {
      url: 'https://trackly.example.com/app/time-tracker',
      cleartext: false,
    },
  )
  for (const value of [
    '',
    'javascript:alert(1)',
    'http://trackly.example.com',
    'https://user:secret@trackly.example.com',
    'https://trackly.example.com/elsewhere',
    'https://trackly.example.com/?token=secret',
    'https://trackly.example.com/#fragment',
  ]) {
    assert.throws(() => resolveServerUrl({ MOBILE_SERVER_URL: value }))
  }
})

test('HTTP requires an explicit local-only development switch', () => {
  assert.throws(() =>
    resolveServerUrl({ MOBILE_SERVER_URL: 'http://10.0.2.2:3000' }),
  )
  assert.deepEqual(
    resolveServerUrl({
      MOBILE_SERVER_URL: 'http://10.0.2.2:3000',
      MOBILE_ALLOW_LOCAL_HTTP: '1',
    }),
    {
      url: 'http://10.0.2.2:3000/app/time-tracker',
      cleartext: true,
    },
  )
  assert.throws(() =>
    resolveServerUrl({
      MOBILE_SERVER_URL: 'http://example.com',
      MOBILE_ALLOW_LOCAL_HTTP: '1',
    }),
  )
})

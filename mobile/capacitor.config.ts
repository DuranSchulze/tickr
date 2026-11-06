import type { CapacitorConfig } from '@capacitor/cli'

/** Remote code has access to the native bridge. Never accept arbitrary origins. */
export function resolveServerUrl(env: Record<string, string | undefined>) {
  const raw = env.MOBILE_SERVER_URL
  if (!raw)
    throw new Error('Set MOBILE_SERVER_URL to the Trackly HTTPS origin.')
  const url = new URL(raw)
  const local = ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname)
  const development = env.MOBILE_ALLOW_LOCAL_HTTP === '1' && local
  if (url.protocol !== 'https:' && !(development && url.protocol === 'http:')) {
    throw new Error(
      'MOBILE_SERVER_URL must use HTTPS (local HTTP is debug-only).',
    )
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'MOBILE_SERVER_URL must be an origin without credentials, path, query, or fragment.',
    )
  }
  return {
    url: `${url.origin}/app/time-tracker`,
    cleartext: development && url.protocol === 'http:',
  }
}

const config: CapacitorConfig = {
  appId: 'com.trackly.internal',
  appName: 'Trackly',
  webDir: 'www',
  loggingBehavior: 'debug',
  server: {
    ...resolveServerUrl(process.env),
    androidScheme: 'https',
    // No allowNavigation wildcards: other origins must not receive the bridge.
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
}

export default config

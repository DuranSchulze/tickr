export type XenditReturnUrls = {
  success_return_url?: string
  cancel_return_url?: string
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function buildXenditReturnUrls(appUrl: string): XenditReturnUrls {
  let url: URL
  try {
    url = new URL(appUrl)
  } catch {
    throw new Error(
      'APP_URL must be a valid absolute URL before Xendit checkout can start.',
    )
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      'APP_URL must be a valid absolute HTTP or HTTPS URL before Xendit checkout can start.',
    )
  }

  if (url.protocol === 'https:') {
    return {
      success_return_url: `${url.origin}/app/workspace/billing?checkout=success`,
      cancel_return_url: `${url.origin}/app/workspace/billing?checkout=canceled`,
    }
  }

  if (LOOPBACK_HOSTS.has(url.hostname)) {
    return {}
  }

  throw new Error(
    'Xendit checkout return URLs require HTTPS. Use localhost without return redirects for sandbox testing, or set APP_URL to an HTTPS deployment or development tunnel.',
  )
}

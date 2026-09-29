/**
 * Tickr public API client (v1).
 *
 * Auth: the workspace API key (`tickr_…`) is sent directly as
 * `Authorization: Bearer <key>` — this is the `ApiKeyAuth` scheme shown in
 * /api/docs. A ready JWT also works but isn't required.
 *
 * The credential is resolved in this order:
 *   1. Script Properties  (TICKR_API_KEY / TICKR_API_TOKEN)
 *   2. Secrets.gs         (git-ignored local file — see Secrets.example.gs)
 *   3. CONFIG.apiKey      (placeholder in Config.gs)
 */

const TICKR_PROPS = {
  baseUrl: 'https://trackly.ph/',
  apiKey: 'tickr_PIGqOf3fVMoegB-fhOw6ovi4Q2KY7cABStSIg47lZbg',
  apiToken: 'tickr_PIGqOf3fVMoegB-fhOw6ovi4Q2KY7cABStSIg47lZbg',
  workspace: 'Intercompany',
}

function tickrProps_() {
  return PropertiesService.getScriptProperties()
}

function tickrBaseUrl_() {
  const fromProps = tickrProps_().getProperty(TICKR_PROPS.baseUrl)
  return String(fromProps || CONFIG.baseUrl || '').replace(/\/+$/, '')
}

/** Store the base URL once (only needed if you self-host). */
function setTickrBaseUrl(url) {
  tickrProps_().setProperty(
    TICKR_PROPS.baseUrl,
    String(url || '').replace(/\/+$/, ''),
  )
}

/** Read a value from the optional, git-ignored Secrets.gs ('' when absent). */
function tickrSecret_(key) {
  if (typeof SECRETS === 'undefined' || !SECRETS) return ''
  return SECRETS[key] || ''
}

/**
 * Store the credential in Script Properties (alternative to Secrets.gs). Passes
 * a raw API key (any non-JWT string) or a JWT (three dot-separated segments).
 */
function setTickrCredential(credential) {
  const value = String(credential || '').trim()
  if (!value) throw new Error('Pass the workspace API key (tickr_…) or a JWT.')
  const props = tickrProps_()
  if (value.split('.').length === 3) {
    props.setProperty(TICKR_PROPS.apiToken, value)
    props.deleteProperty(TICKR_PROPS.apiKey)
  } else {
    props.setProperty(TICKR_PROPS.apiKey, value)
    props.deleteProperty(TICKR_PROPS.apiToken)
  }
}

/** First available credential, sent as the Bearer token on every request. */
function tickrCredential_() {
  const props = tickrProps_()
  const candidates = [
    props.getProperty(TICKR_PROPS.apiToken),
    props.getProperty(TICKR_PROPS.apiKey),
    tickrSecret_('apiToken'),
    tickrSecret_('apiKey'),
    CONFIG.apiToken,
    CONFIG.apiKey,
  ]
  for (let i = 0; i < candidates.length; i++) {
    const value = String(candidates[i] || '').trim()
    if (value) return value
  }
  throw new Error(
    'No Tickr credential. Add your key to appscript/Secrets.gs, run setTickrCredential("tickr_…"), or set TICKR_API_KEY in Script Properties.',
  )
}

/** Core request helper: authenticated GET/POST returning parsed JSON. */
function tickrRequest_(method, path, options) {
  const opts = options || {}
  let url = tickrBaseUrl_() + path
  const qs = tickrQueryString_(opts.params)
  if (qs) url += '?' + qs

  const init = {
    method: method,
    headers: {
      Authorization: 'Bearer ' + tickrCredential_(),
      Accept: 'application/json',
    },
    muteHttpExceptions: true,
  }
  if (opts.payload !== undefined) {
    init.contentType = 'application/json'
    init.payload = JSON.stringify(opts.payload)
  }

  const res = UrlFetchApp.fetch(url, init)
  const json = tickrParse_(res)
  const code = res.getResponseCode()
  if (code < 200 || code >= 300) {
    const error = new Error(
      'Tickr ' +
        String(method).toUpperCase() +
        ' ' +
        path +
        ' → ' +
        code +
        ': ' +
        tickrErrorMessage_(res, json),
    )
    error.status = code
    error.code = json && json.error ? json.error.code : undefined
    throw error
  }
  return json
}

function tickrQueryString_(params) {
  if (!params) return ''
  return Object.keys(params)
    .filter(function (key) {
      const value = params[key]
      return value !== undefined && value !== null && value !== ''
    })
    .map(function (key) {
      return (
        encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key]))
      )
    })
    .join('&')
}

function tickrParse_(res) {
  const text = res.getContentText()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (error) {
    return null
  }
}

function tickrErrorMessage_(res, json) {
  if (json && json.error && json.error.message) return json.error.message
  const text = res.getContentText()
  if (text) return text
  return 'HTTP ' + res.getResponseCode()
}

/** GET /api/v1/workspace — cached, and the source of the workspace timezone. */
function tickrGetWorkspace_() {
  const props = tickrProps_()
  const cached = props.getProperty(TICKR_PROPS.workspace)
  if (cached) {
    try {
      return JSON.parse(cached)
    } catch (error) {
      /* fall through and refetch */
    }
  }
  const json = tickrRequest_('get', '/api/v1/workspace')
  const workspace = json ? json.data : null
  if (workspace) {
    props.setProperty(TICKR_PROPS.workspace, JSON.stringify(workspace))
  }
  return workspace
}

/** GET /api/v1/members?search= — returns the `data` array. */
function tickrSearchMembers_(search, limit) {
  const json = tickrRequest_('get', '/api/v1/members', {
    params: { search: search, limit: limit || 25 },
  })
  return (json && json.data) || []
}

/** GET /api/v1/dtr-integration — TIME IN / TIME OUT / HOURS summary for a day. */
function tickrGetDtr_(user, date) {
  const json = tickrRequest_('get', '/api/v1/dtr-integration', {
    params: { user: user, date: date },
  })
  return (json && json.data) || null
}

/** GET /api/v1/member-day-activity — the day's entries (for DETAILS). */
function tickrGetMemberDayActivity_(user, date) {
  const json = tickrRequest_('get', '/api/v1/member-day-activity', {
    params: { user: user, date: date },
  })
  return (json && json.data) || null
}

/**
 * Verifies the credential end-to-end. Run this first after setting the key.
 */
function tickrSelfTest() {
  const workspace = tickrGetWorkspace_()
  const members = tickrSearchMembers_('', 5)
  const summary = {
    workspace: workspace
      ? {
          id: workspace.id,
          name: workspace.name,
          timezone: workspace.timezone,
        }
      : null,
    sampleMembers: members.map(function (member) {
      return { id: member.id, name: member.name, email: member.email }
    }),
  }
  Logger.log(JSON.stringify(summary, null, 2))
  return summary
}

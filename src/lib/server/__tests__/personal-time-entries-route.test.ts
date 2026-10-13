import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleTimeEntriesRequest } from '../integrations/external-api-routes.server'
import { ExternalApiError } from '../integrations/external-api-auth.server'

const { authenticate, personal, legacy } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  personal: vi.fn(),
  legacy: vi.fn(),
}))
vi.mock('../integrations/external-api-user-auth.server', () => ({
  registerTracklyUserAccount: vi.fn(),
}))
vi.mock('../integrations/external-api-auth.server', () => {
  class MockApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message)
    }
  }
  return {
    ExternalApiError: MockApiError,
    requireExternalApiKey: authenticate,
    authenticateApiKeyCredential: vi.fn(),
    authenticateDeveloperCredentials: vi.fn(),
    authenticateUserCredentials: vi.fn(),
    resolveUserContext: vi.fn(),
    jsonResponse: (body: unknown, init?: ResponseInit) =>
      Response.json(body, init),
    externalApiErrorResponse: (error: InstanceType<typeof MockApiError>) =>
      Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status ?? 500 },
      ),
  }
})
vi.mock('../integrations/personal-time-entries.server', () => ({
  listPersonalTimeEntries: personal,
}))
vi.mock('../integrations/external-api-data.server', () => ({
  listExternalTimeEntries: legacy,
}))
afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})
const request = (query = '') =>
  new Request(`http://localhost/api/v1/time-entries${query}`, {
    headers: { Authorization: 'Bearer test' },
  })
function user() {
  authenticate.mockResolvedValue({ userId: 'self', workspaceId: 'origin' })
}

describe('personal time entry HTTP contract', () => {
  it('derives identity from auth and includes summaries with a frozen generatedAt', async () => {
    user()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-13T04:00:00Z'))
    personal.mockResolvedValue({
      data: [{ id: 'entry' }],
      total: 3,
      summaries: [{ date: '2026-10-13' }],
    })
    const response = await handleTimeEntriesRequest(request('?limit=1&page=2'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [{ id: 'entry' }],
      pagination: { page: 2, limit: 1, total: 3, totalPages: 3, hasMore: true },
      summaries: [{ date: '2026-10-13' }],
      generatedAt: '2026-10-13T04:00:00.000Z',
    })
    expect(personal).toHaveBeenCalledWith(
      'self',
      expect.objectContaining({ limit: 1, page: 2 }),
      new Date('2026-10-13T04:00:00Z'),
    )
    expect(legacy).not.toHaveBeenCalled()
  })
  it('rejects another user ID before querying entries', async () => {
    user()
    expect(
      (await handleTimeEntriesRequest(request('?userId=other'))).status,
    ).toBe(403)
    expect(personal).not.toHaveBeenCalled()
  })
  it('accepts matching user identity and passes authorized filters to the service', async () => {
    user()
    personal.mockResolvedValue({ data: [], total: 0, summaries: [] })
    const response = await handleTimeEntriesRequest(
      request(
        '?userId=self&workspaceId=ws&memberId=own&date=2026-10-13&running=true',
      ),
    )
    expect(response.status).toBe(200)
    expect(personal).toHaveBeenCalledWith(
      'self',
      expect.objectContaining({
        userId: 'self',
        workspaceId: 'ws',
        memberId: 'own',
        date: '2026-10-13',
        running: true,
      }),
      expect.any(Date),
    )
  })
  it('returns scope failures without entries or summaries', async () => {
    user()
    personal.mockRejectedValue(
      new ExternalApiError(403, 'workspace_access_denied', 'Denied'),
    )
    const response = await handleTimeEntriesRequest(
      request('?workspaceId=unowned'),
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: { code: 'workspace_access_denied', message: 'Denied' },
    })
  })
  it.each([
    '?startDate=2026-10-13T00:00:00Z',
    '?date=2026-02-30',
    '?date=2026-10-13&startDate=2026-10-13T00:00:00Z&endDate=2026-10-14T00:00:00Z',
  ])('rejects invalid personal dates %s', async (query) => {
    user()
    expect((await handleTimeEntriesRequest(request(query))).status).toBe(400)
    expect(personal).not.toHaveBeenCalled()
  })
  it.each(['api_key', 'developer'])(
    'preserves the legacy workspace contract for %s credentials',
    async (type) => {
      authenticate.mockResolvedValue({
        userId: null,
        workspaceId: 'bound',
        keyId: type === 'api_key' ? 'key' : null,
        developerId: type === 'developer' ? 'dev' : null,
      })
      legacy.mockResolvedValue({ data: [{ id: 'legacy' }], total: 1 })
      const response = await handleTimeEntriesRequest(
        request('?memberId=someone&startDate=2026-10-13T00:00:00Z'),
      )
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.data).toEqual([{ id: 'legacy' }])
      expect(body).not.toHaveProperty('summaries')
      expect(body).not.toHaveProperty('generatedAt')
      expect(legacy).toHaveBeenCalledWith(
        'bound',
        expect.objectContaining({ memberId: 'someone' }),
      )
      expect(personal).not.toHaveBeenCalled()
    },
  )
  it.each(['userId=self', 'workspaceId=ws', 'date=2026-10-13'])(
    'rejects personal parameters on service credentials: %s',
    async (query) => {
      authenticate.mockResolvedValue({ userId: null, workspaceId: 'bound' })
      expect(
        (await handleTimeEntriesRequest(request(`?${query}`))).status,
      ).toBe(400)
      expect(legacy).not.toHaveBeenCalled()
    },
  )
  it.each([401, 403])(
    'preserves authentication failures (%s)',
    async (status) => {
      authenticate.mockRejectedValue(
        new ExternalApiError(status, 'invalid_token', 'Denied'),
      )
      expect((await handleTimeEntriesRequest(request())).status).toBe(status)
      expect(personal).not.toHaveBeenCalled()
      expect(legacy).not.toHaveBeenCalled()
    },
  )
})

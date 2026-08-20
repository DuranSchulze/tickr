import '@tanstack/react-start/server-only'
import type { ZodError, z } from 'zod'
import {
  authenticateApiKeyCredential,
  authenticateDeveloperCredentials,
  externalApiErrorResponse,
  jsonResponse,
  requireExternalApiKey,
} from './external-api-auth.server'
import { developerSignInSchema } from './developer-accounts.shared'
import {
  clientsListQuerySchema,
  departmentsListQuerySchema,
  dtrIntegrationQuerySchema,
  externalApiSignInSchema,
  listPayload,
  memberDayActivityQuerySchema,
  membersListQuerySchema,
  projectsListQuerySchema,
  tagsListQuerySchema,
  tasksListQuerySchema,
  timeEntriesQuerySchema,
} from './external-api.shared'
import type { ExternalApiContext } from './external-api-auth.server'
import type {
  ListQuery,
  MembersListQuery,
  TimeEntriesQuery,
} from './external-api.shared'

function queryObject(request: Request): Record<string, string> {
  const url = new URL(request.url)
  return Object.fromEntries(url.searchParams.entries())
}

function validationError(error: ZodError): Response {
  return jsonResponse(
    {
      error: {
        code: 'invalid_query',
        message: error.issues[0]?.message ?? 'Invalid query parameters.',
      },
    },
    { status: 400 },
  )
}

type ListResult<TData> = { data: TData[]; total: number }

async function handleList<TQuery extends ListQuery, TData>(
  request: Request,
  schema: z.ZodType<TQuery>,
  load: (workspaceId: string, query: TQuery) => Promise<ListResult<TData>>,
): Promise<Response> {
  try {
    const context = await requireExternalApiKey(request)
    const parsed = schema.safeParse(queryObject(request))
    if (!parsed.success) return validationError(parsed.error)
    const result = await load(context.workspaceId, parsed.data)
    return jsonResponse(listPayload(result.data, parsed.data, result.total))
  } catch (error) {
    return externalApiErrorResponse(error)
  }
}

async function issueTokenResponse(
  context: ExternalApiContext,
  claims: {
    keyId?: string
    developerId?: string
    permissionLevel?: 'OWNER' | 'ADMIN'
  },
) {
  const { signApiKeyJwt, signDeveloperJwt } =
    await import('./external-api-jwt.server')
  const { token, expiresInSeconds, expiresAt } = claims.developerId
    ? await signDeveloperJwt({
        developerId: claims.developerId,
        workspaceId: context.workspaceId,
        permissionLevel: claims.permissionLevel ?? 'OWNER',
      })
    : await signApiKeyJwt({
        keyId: claims.keyId ?? '',
        workspaceId: context.workspaceId,
      })

  return jsonResponse({
    data: {
      token,
      tokenType: 'Bearer',
      expiresInSeconds,
      expiresAt: expiresAt.toISOString(),
      ...(claims.developerId
        ? { permissionLevel: claims.permissionLevel ?? 'OWNER' }
        : {}),
      workspace: {
        id: context.workspace.id,
        name: context.workspace.name,
        slug: context.workspace.slug,
      },
    },
  })
}

async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export async function handleSignInRequest(request: Request): Promise<Response> {
  const body = await readJsonBody(request)
  if (body == null) {
    return jsonResponse(
      {
        error: {
          code: 'invalid_body',
          message: 'Request body must be valid JSON.',
        },
      },
      { status: 400 },
    )
  }

  const parsed = externalApiSignInSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  try {
    const context = await authenticateApiKeyCredential(
      parsed.data.apiKey,
      request,
    )
    if (!context.keyId) {
      return jsonResponse(
        { error: { code: 'invalid_api_key', message: 'Invalid API key.' } },
        { status: 401 },
      )
    }
    return issueTokenResponse(context, { keyId: context.keyId })
  } catch (error) {
    return externalApiErrorResponse(error)
  }
}

export async function handleDeveloperSignInRequest(
  request: Request,
): Promise<Response> {
  const body = await readJsonBody(request)
  if (body == null) {
    return jsonResponse(
      {
        error: {
          code: 'invalid_body',
          message: 'Request body must be valid JSON.',
        },
      },
      { status: 400 },
    )
  }

  const parsed = developerSignInSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  try {
    const context = await authenticateDeveloperCredentials(
      parsed.data.email,
      parsed.data.password,
    )
    if (!context.developerId || !context.permissionLevel) {
      return jsonResponse(
        {
          error: {
            code: 'invalid_credentials',
            message: 'Invalid credentials.',
          },
        },
        { status: 401 },
      )
    }
    return issueTokenResponse(context, {
      developerId: context.developerId,
      permissionLevel: context.permissionLevel,
    })
  } catch (error) {
    return externalApiErrorResponse(error)
  }
}

export async function handleWorkspaceRequest(
  request: Request,
): Promise<Response> {
  try {
    const context = await requireExternalApiKey(request)
    const { getExternalWorkspace } = await import('./external-api-data.server')
    const workspace = await getExternalWorkspace(context.workspaceId)
    if (!workspace) {
      return jsonResponse(
        {
          error: {
            code: 'not_found',
            message: 'Workspace not found.',
          },
        },
        { status: 404 },
      )
    }
    return jsonResponse({ data: workspace })
  } catch (error) {
    return externalApiErrorResponse(error)
  }
}

export function handleMembersRequest(request: Request): Promise<Response> {
  return handleList<MembersListQuery, unknown>(
    request,
    membersListQuerySchema,
    async (workspaceId, query) => {
      const { listExternalMembers } = await import('./external-api-data.server')
      return listExternalMembers(workspaceId, query)
    },
  )
}

export function handleClientsRequest(request: Request): Promise<Response> {
  return handleList(
    request,
    clientsListQuerySchema,
    async (workspaceId, query) => {
      const { listExternalClients } = await import('./external-api-data.server')
      return listExternalClients(workspaceId, query)
    },
  )
}

export function handleProjectsRequest(request: Request): Promise<Response> {
  return handleList(
    request,
    projectsListQuerySchema,
    async (workspaceId, query) => {
      const { listExternalProjects } =
        await import('./external-api-data.server')
      return listExternalProjects(workspaceId, query)
    },
  )
}

export function handleTasksRequest(request: Request): Promise<Response> {
  return handleList(
    request,
    tasksListQuerySchema,
    async (workspaceId, query) => {
      const { listExternalTasks } = await import('./external-api-data.server')
      return listExternalTasks(workspaceId, query)
    },
  )
}

export function handleTagsRequest(request: Request): Promise<Response> {
  return handleList(
    request,
    tagsListQuerySchema,
    async (workspaceId, query) => {
      const { listExternalTags } = await import('./external-api-data.server')
      return listExternalTags(workspaceId, query)
    },
  )
}

export function handleDepartmentsRequest(request: Request): Promise<Response> {
  return handleList(
    request,
    departmentsListQuerySchema,
    async (workspaceId, query) => {
      const { listExternalDepartments } =
        await import('./external-api-data.server')
      return listExternalDepartments(workspaceId, query)
    },
  )
}

export function handleTimeEntriesRequest(request: Request): Promise<Response> {
  return handleList<TimeEntriesQuery, unknown>(
    request,
    timeEntriesQuerySchema,
    async (workspaceId, query) => {
      const { listExternalTimeEntries } =
        await import('./external-api-data.server')
      return listExternalTimeEntries(workspaceId, query)
    },
  )
}

export async function handleDtrIntegrationRequest(
  request: Request,
): Promise<Response> {
  try {
    const context = await requireExternalApiKey(request)
    const parsed = dtrIntegrationQuerySchema.safeParse(queryObject(request))
    if (!parsed.success) return validationError(parsed.error)

    const { getExternalDtrIntegration } =
      await import('./external-api-data.server')
    const dtr = await getExternalDtrIntegration(
      context.workspaceId,
      context.workspace.timezone,
      parsed.data,
    )

    if (!dtr) {
      return jsonResponse(
        {
          error: {
            code: 'member_not_found',
            message: 'No workspace member matched the provided user.',
          },
        },
        { status: 404 },
      )
    }

    return jsonResponse({ data: dtr })
  } catch (error) {
    return externalApiErrorResponse(error)
  }
}

export async function handleMemberDayActivityRequest(
  request: Request,
): Promise<Response> {
  try {
    const context = await requireExternalApiKey(request)
    const parsed = memberDayActivityQuerySchema.safeParse(queryObject(request))
    if (!parsed.success) return validationError(parsed.error)

    const { getExternalMemberDayActivity } =
      await import('./external-api-data.server')
    const activity = await getExternalMemberDayActivity(
      context.workspaceId,
      context.workspace.timezone,
      parsed.data,
    )

    if (!activity) {
      return jsonResponse(
        {
          error: {
            code: 'member_not_found',
            message: 'No workspace member matched the provided user.',
          },
        },
        { status: 404 },
      )
    }

    return jsonResponse({ data: activity })
  } catch (error) {
    return externalApiErrorResponse(error)
  }
}

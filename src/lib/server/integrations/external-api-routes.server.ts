import '@tanstack/react-start/server-only'
import type { ZodError, z } from 'zod'
import {
  externalApiErrorResponse,
  jsonResponse,
  requireExternalApiKey,
} from './external-api-auth.server'
import {
  listPayload,
  listQuerySchema,
  memberDayActivityQuerySchema,
  timeEntriesQuerySchema,
} from './external-api.shared'
import type { ListQuery, TimeEntriesQuery } from './external-api.shared'

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

async function handleList<TQuery extends ListQuery, TData>(
  request: Request,
  schema: z.ZodType<TQuery>,
  load: (workspaceId: string, query: TQuery) => Promise<TData[]>,
): Promise<Response> {
  try {
    const context = await requireExternalApiKey(request)
    const parsed = schema.safeParse(queryObject(request))
    if (!parsed.success) return validationError(parsed.error)
    const data = await load(context.workspaceId, parsed.data)
    return jsonResponse(listPayload(data, parsed.data))
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
  return handleList(request, listQuerySchema, async (workspaceId, query) => {
    const { listExternalMembers } = await import('./external-api-data.server')
    return listExternalMembers(workspaceId, query)
  })
}

export function handleClientsRequest(request: Request): Promise<Response> {
  return handleList(request, listQuerySchema, async (workspaceId, query) => {
    const { listExternalClients } = await import('./external-api-data.server')
    return listExternalClients(workspaceId, query)
  })
}

export function handleProjectsRequest(request: Request): Promise<Response> {
  return handleList(request, listQuerySchema, async (workspaceId, query) => {
    const { listExternalProjects } = await import('./external-api-data.server')
    return listExternalProjects(workspaceId, query)
  })
}

export function handleTasksRequest(request: Request): Promise<Response> {
  return handleList(request, listQuerySchema, async (workspaceId, query) => {
    const { listExternalTasks } = await import('./external-api-data.server')
    return listExternalTasks(workspaceId, query)
  })
}

export function handleTagsRequest(request: Request): Promise<Response> {
  return handleList(request, listQuerySchema, async (workspaceId, query) => {
    const { listExternalTags } = await import('./external-api-data.server')
    return listExternalTags(workspaceId, query)
  })
}

export function handleDepartmentsRequest(request: Request): Promise<Response> {
  return handleList(request, listQuerySchema, async (workspaceId, query) => {
    const { listExternalDepartments } =
      await import('./external-api-data.server')
    return listExternalDepartments(workspaceId, query)
  })
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

import '@tanstack/react-start/server-only'

type ApiTag =
  | 'Workspace'
  | 'Members'
  | 'Catalogs'
  | 'Time Tracking'
  | 'Integration'
  | 'Authentication'

type ApiParameter = {
  name: string
  in: 'query'
  description?: string
  required?: boolean
  schema: Record<string, unknown>
}

const paginationParameters: ApiParameter[] = [
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
    description: 'Number of records to return per page.',
  },
  {
    name: 'page',
    in: 'query',
    schema: { type: 'integer', minimum: 1, default: 1 },
    description: 'One-based page number.',
  },
  {
    name: 'updatedSince',
    in: 'query',
    schema: { type: 'string', format: 'date-time' },
    description: 'Only return records updated at or after this ISO datetime.',
  },
]

const searchParameter: ApiParameter = {
  name: 'search',
  in: 'query',
  schema: { type: 'string', maxLength: 255 },
  description:
    'Free-text search across the record name (and email for members).',
}

function sortParameters(sortBy: string[]): ApiParameter[] {
  return [
    {
      name: 'sortBy',
      in: 'query',
      schema: { type: 'string', enum: sortBy },
      description: 'Column to sort by.',
    },
    {
      name: 'sortDir',
      in: 'query',
      schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
      description: 'Sort direction.',
    },
  ]
}

function booleanFilter(name: string, description: string): ApiParameter {
  return {
    name,
    in: 'query',
    schema: { type: 'string', enum: ['true', 'false'] },
    description,
  }
}

type ListOptions = {
  summary: string
  description: string
  tag: ApiTag
  sortBy: string[]
  extraParameters?: ApiParameter[]
}

function listPath({
  summary,
  description,
  tag,
  sortBy,
  extraParameters = [],
}: ListOptions) {
  return {
    get: {
      tags: [tag],
      summary,
      description,
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
      parameters: [
        ...paginationParameters,
        searchParameter,
        ...extraParameters,
        ...sortParameters(sortBy),
      ],
      responses: {
        '200': {
          description: 'A paginated list response.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ListResponse' },
            },
          },
        },
        '400': { $ref: '#/components/responses/BadRequest' },
        '401': { $ref: '#/components/responses/Unauthorized' },
      },
    },
  }
}

const idFilter = (name: string, description: string): ApiParameter => ({
  name,
  in: 'query',
  schema: { type: 'string', maxLength: 30 },
  description,
})

export function getOpenApiDocument(origin?: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Tickr Workspace API',
      version: '1.1.0',
      description:
        'Read-only workspace integration API secured by workspace API keys. Create a key from Workspace settings as an Owner or Admin, then authorize requests with Authorization: Bearer <api_key> or the X-API-Key header. Keys are workspace-scoped, shown only once at creation, and can be revoked from Workspace settings. For long-lived integrations, exchange a key for a short-lived JWT via POST /api/v1/auth/sign-in and send it as Authorization: Bearer <jwt>. List endpoints support pagination (limit, page, updatedSince), free-text search, sorting (sortBy, sortDir), and resource-specific filters.',
    },
    tags: [
      {
        name: 'Authentication',
        description: 'Token issuance for API consumers.',
      },
      { name: 'Workspace', description: 'Workspace metadata endpoints.' },
      {
        name: 'Members',
        description: 'Workspace member and user activity endpoints.',
      },
      {
        name: 'Catalogs',
        description: 'Clients, projects, tasks, tags, and departments.',
      },
      {
        name: 'Time Tracking',
        description: 'Workspace time-entry endpoints.',
      },
      {
        name: 'Integration',
        description:
          'Daily time record (DTR) endpoints for payroll and HR integrations.',
      },
    ],
    servers: [{ url: origin ?? '' }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description:
            'A workspace API key (Authorization: Bearer tickr_...) or a JWT issued by POST /api/v1/auth/sign-in.',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Alternative header for the workspace API key.',
        },
      },
      responses: {
        BadRequest: {
          description: 'Invalid query parameters.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        Unauthorized: {
          description: 'Missing, invalid, revoked, or expired API key.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
              required: ['code', 'message'],
            },
          },
          required: ['error'],
        },
        ListResponse: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'object' } },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' },
                hasMore: { type: 'boolean' },
              },
              required: ['page', 'limit', 'total', 'totalPages', 'hasMore'],
            },
          },
          required: ['data', 'pagination'],
        },
      },
    },
    paths: {
      '/api/v1/auth/sign-in': {
        post: {
          tags: ['Authentication'],
          summary: 'Sign in and receive a JWT',
          description:
            'Exchanges a workspace API key for a short-lived bearer JWT. Send the JWT as Authorization: Bearer <jwt> on subsequent requests. The raw API key also continues to work directly. Tokens expire after the configured TTL (default 1 hour); revoked or expired keys are rejected immediately.',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    apiKey: {
                      type: 'string',
                      description: 'A workspace API key (tickr_...).',
                    },
                  },
                  required: ['apiKey'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'A bearer JWT for the API key workspace.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          token: { type: 'string' },
                          tokenType: { type: 'string', enum: ['Bearer'] },
                          expiresInSeconds: { type: 'integer' },
                          expiresAt: { type: 'string', format: 'date-time' },
                          workspace: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              name: { type: 'string' },
                              slug: { type: 'string' },
                            },
                            required: ['id', 'name', 'slug'],
                          },
                        },
                        required: [
                          'token',
                          'tokenType',
                          'expiresInSeconds',
                          'expiresAt',
                          'workspace',
                        ],
                      },
                    },
                    required: ['data'],
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/api/v1/workspace': {
        get: {
          tags: ['Workspace'],
          summary: 'Get workspace',
          description: 'Returns metadata for the API key workspace.',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Workspace metadata.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { data: { type: 'object' } },
                    required: ['data'],
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/api/v1/members': listPath({
        summary: 'List members',
        description:
          'Lists members in the API key workspace. Filter by status, role, or department, and search across name and email.',
        tag: 'Members',
        sortBy: ['name', 'email', 'status', 'createdAt', 'updatedAt'],
        extraParameters: [
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['ACTIVE', 'INVITED', 'DISABLED'] },
            description: 'Filter by member status.',
          },
          idFilter('roleId', 'Filter by workspace role id.'),
          idFilter('departmentId', 'Filter by department id.'),
        ],
      }),
      '/api/v1/dtr-integration': {
        get: {
          tags: ['Integration'],
          summary: 'Get daily time record (DTR)',
          description:
            'Returns the date label, day of week, time-in, time-out, and total logged hours for a workspace member on a workspace-local date. Use the user query parameter with an email address or display name. If date is omitted, the workspace-local current date is used.',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [
            {
              name: 'user',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Member email address or display name search.',
            },
            {
              name: 'date',
              in: 'query',
              schema: { type: 'string', format: 'date' },
              description:
                'Workspace-local date in YYYY-MM-DD format. Defaults to today.',
            },
          ],
          responses: {
            '200': {
              description:
                'Daily time record with time-in, time-out, and total hours.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { data: { type: 'object' } },
                    required: ['data'],
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': {
              description: 'No workspace member matched the user parameter.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/member-day-activity': {
        get: {
          tags: ['Members'],
          summary: 'Get member day activity',
          description:
            'Returns one matched member and their time entries for a workspace-local date. Use the user query parameter with an email address or display name. If date is omitted, the workspace-local current date is used.',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [
            {
              name: 'user',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Member email address or display name search.',
            },
            {
              name: 'date',
              in: 'query',
              schema: { type: 'string', format: 'date' },
              description:
                'Workspace-local date in YYYY-MM-DD format. Defaults to today.',
            },
          ],
          responses: {
            '200': {
              description:
                'Member day activity with first time-in, last time-out, and entries.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { data: { type: 'object' } },
                    required: ['data'],
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/BadRequest' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': {
              description: 'No workspace member matched the user parameter.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/clients': listPath({
        summary: 'List clients',
        description:
          'Lists clients in the API key workspace. Filter by status and search across name.',
        tag: 'Catalogs',
        sortBy: ['name', 'status', 'createdAt', 'updatedAt'],
        extraParameters: [
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
            },
            description: 'Filter by client status.',
          },
        ],
      }),
      '/api/v1/projects': listPath({
        summary: 'List projects',
        description:
          'Lists projects in the API key workspace. Filter by client or archived state, and search across name.',
        tag: 'Catalogs',
        sortBy: ['name', 'clientId', 'archived', 'createdAt', 'updatedAt'],
        extraParameters: [
          idFilter('clientId', 'Filter by client id.'),
          booleanFilter('archived', 'Filter by archived state.'),
        ],
      }),
      '/api/v1/tasks': listPath({
        summary: 'List tasks',
        description:
          'Lists project tasks in the API key workspace. Filter by project or archived state, and search across name.',
        tag: 'Catalogs',
        sortBy: ['name', 'projectId', 'archived', 'createdAt', 'updatedAt'],
        extraParameters: [
          idFilter('projectId', 'Filter by project id.'),
          booleanFilter('archived', 'Filter by archived state.'),
        ],
      }),
      '/api/v1/tags': listPath({
        summary: 'List tags',
        description:
          'Lists tags in the API key workspace. Filter by archived state and search across name.',
        tag: 'Catalogs',
        sortBy: ['name', 'archived', 'createdAt', 'updatedAt'],
        extraParameters: [
          booleanFilter('archived', 'Filter by archived state.'),
        ],
      }),
      '/api/v1/departments': listPath({
        summary: 'List departments',
        description:
          'Lists departments in the API key workspace. Search across name.',
        tag: 'Catalogs',
        sortBy: ['name', 'createdAt', 'updatedAt'],
      }),
      '/api/v1/time-entries': listPath({
        summary: 'List time entries',
        description:
          'Lists time entries in the API key workspace. Filter by member, project, task, billable state, running state, and date range; search across the entry description.',
        tag: 'Time Tracking',
        sortBy: ['startedAt', 'createdAt', 'updatedAt', 'durationSeconds'],
        extraParameters: [
          idFilter('memberId', 'Filter by workspace member id.'),
          idFilter('projectId', 'Filter by project id.'),
          idFilter('taskId', 'Filter by task id.'),
          booleanFilter('billable', 'Filter by billable state.'),
          booleanFilter(
            'running',
            'Filter by running state (endedAt is null).',
          ),
          {
            name: 'startDate',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
            description: 'Lower bound for the entry startedAt.',
          },
          {
            name: 'endDate',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
            description: 'Upper bound for the entry startedAt.',
          },
        ],
      }),
    },
  }
}

import '@tanstack/react-start/server-only'

type ApiTag = 'Workspace' | 'Members' | 'Catalogs' | 'Time Tracking'

const listParameters = [
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  },
  {
    name: 'page',
    in: 'query',
    schema: { type: 'integer', minimum: 1, default: 1 },
  },
  {
    name: 'updatedSince',
    in: 'query',
    schema: { type: 'string', format: 'date-time' },
  },
]

function listPath(summary: string, description: string, tag: ApiTag) {
  return {
    get: {
      tags: [tag],
      summary,
      description,
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
      parameters: listParameters,
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

export function getOpenApiDocument(origin?: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Tickr Workspace API',
      version: '1.0.0',
      description:
        'Read-only workspace integration API secured by workspace API keys. Create a key from Workspace settings as an Owner or Admin, then authorize requests with Authorization: Bearer <api_key> or the X-API-Key header. Keys are workspace-scoped, shown only once at creation, and can be revoked from Workspace settings.',
    },
    tags: [
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
    ],
    servers: [{ url: origin ?? '' }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Use Authorization: Bearer <workspace_api_key>.',
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
                hasMore: { type: 'boolean' },
              },
              required: ['page', 'limit', 'hasMore'],
            },
          },
          required: ['data', 'pagination'],
        },
      },
    },
    paths: {
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
      '/api/v1/members': listPath(
        'List members',
        'Lists members in the API key workspace.',
        'Members',
      ),
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
      '/api/v1/clients': listPath(
        'List clients',
        'Lists clients in the API key workspace.',
        'Catalogs',
      ),
      '/api/v1/projects': listPath(
        'List projects',
        'Lists projects in the API key workspace.',
        'Catalogs',
      ),
      '/api/v1/tasks': listPath(
        'List tasks',
        'Lists project tasks in the API key workspace.',
        'Catalogs',
      ),
      '/api/v1/tags': listPath(
        'List tags',
        'Lists tags in the API key workspace.',
        'Catalogs',
      ),
      '/api/v1/departments': listPath(
        'List departments',
        'Lists departments in the API key workspace.',
        'Catalogs',
      ),
      '/api/v1/time-entries': {
        get: {
          ...listPath(
            'List time entries',
            'Lists time entries in the API key workspace.',
            'Time Tracking',
          ).get,
          parameters: [
            ...listParameters,
            {
              name: 'startDate',
              in: 'query',
              schema: { type: 'string', format: 'date-time' },
            },
            {
              name: 'endDate',
              in: 'query',
              schema: { type: 'string', format: 'date-time' },
            },
          ],
        },
      },
    },
  }
}

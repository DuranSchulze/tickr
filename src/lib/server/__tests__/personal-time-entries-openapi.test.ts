import { describe, expect, it } from 'vitest'
import { getOpenApiDocument } from '../integrations/openapi.server'

describe('personal time-entry API documentation', () => {
  it('documents both credential-dependent contracts and personal scope errors', () => {
    const doc = getOpenApiDocument()
    const operation = doc.paths['/api/v1/time-entries'].get
    expect(operation.parameters.map((parameter) => parameter.name)).toEqual(
      expect.arrayContaining([
        'userId',
        'workspaceId',
        'memberId',
        'date',
        'startDate',
        'endDate',
        'limit',
        'page',
      ]),
    )
    expect(operation.responses).toHaveProperty('403')
    expect(
      operation.responses['200'].content['application/json'].schema,
    ).toEqual({
      anyOf: [
        { $ref: '#/components/schemas/ListResponse' },
        { $ref: '#/components/schemas/PersonalTimeEntriesResponse' },
      ],
    })
    expect(
      doc.components.schemas.PersonalTimeEntriesResponse.allOf[1],
    ).toMatchObject({ required: ['summaries', 'generatedAt'] })
    expect(
      doc.paths['/api/v1/clients'].get.responses['200'].content[
        'application/json'
      ].schema,
    ).toEqual({ $ref: '#/components/schemas/ListResponse' })
  })
})

import type { ArkActionProcedure } from '../actions/init'
import { getTableColumns } from 'drizzle-orm'
import { z } from 'zod/v4'
import { isArkActionProcedure } from '../actions/init'
import { arkActionPath } from '../actions/routes'
import { arkRouter } from '../actions/routers/ark'
import { listArkResources } from './registry'

function jsonSchema(procedure: ArkActionProcedure) {
  if (!procedure.inputSchema)
    return { type: 'object' }
  try {
    return z.toJSONSchema(procedure.inputSchema as any, { target: 'draft-7' })
  }
  catch {
    return { type: 'object' }
  }
}

function actionOperations() {
  const paths: Record<string, any> = {}
  function visit(value: unknown, segments: string[]) {
    if (isArkActionProcedure(value)) {
      const path = arkActionPath(segments, value.kind)
      const method = value.kind === 'mutation' ? 'post' : 'get'
      const input = jsonSchema(value)
      paths[path] = {
        ...paths[path],
        [method]: {
          operationId: `ark.${segments.join('.')}`,
          parameters: value.kind === 'query'
            ? [{ description: 'JSON-encoded operation input.', in: 'query', name: 'input', schema: { type: 'string' } }]
            : undefined,
          requestBody: value.kind === 'mutation'
            ? { content: { 'application/json': { schema: input } }, required: true }
            : undefined,
          responses: {
            200: { content: { 'application/json': { schema: { properties: { data: {} }, required: ['data'], type: 'object' } } }, description: 'Successful response.' },
            default: { content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } }, description: 'Problem response.' },
          },
          security: value.access === 'base' ? [] : [{ betterAuth: [] }],
          tags: ['Domain Operations'],
          'x-ark-input-schema': input,
        },
      }
      return
    }
    if (!value || typeof value !== 'object')
      return
    for (const [key, child] of Object.entries(value))
      visit(child, [...segments, key])
  }
  visit(arkRouter, [])
  return paths
}

function resourceOperations() {
  const paths: Record<string, any> = {}
  for (const resource of listArkResources()) {
    const columns = getTableColumns(resource.table) as Record<string, any>
    const itemSchema = { properties: Object.fromEntries(Object.keys(columns).map(name => [name, {}])), type: 'object' }
    const collectionPath = `/api/ark/items/${resource.name}`
    const itemPath = `${collectionPath}/{id}`
    const errors = { default: { content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } }, description: 'Problem response.' } }
    if (resource.operations.read) {
      paths[collectionPath] = {
        ...paths[collectionPath],
        get: {
          operationId: `${resource.name}.items.readMany`,
          parameters: ['fields', 'filter', 'limit', 'offset', 'sort'].map(name => ({ in: 'query', name, schema: { type: 'string' } })),
          responses: { 200: { description: 'Resource items.' }, ...errors },
          security: [{ betterAuth: [] }],
          tags: ['Resources'],
        },
      }
      paths[itemPath] = {
        ...paths[itemPath],
        get: {
          operationId: `${resource.name}.items.readOne`,
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Resource item.' }, ...errors },
          security: [{ betterAuth: [] }],
          tags: ['Resources'],
        },
      }
    }
    for (const [operation, method, path, status] of [
      ['create', 'post', collectionPath, 201],
      ['update', 'patch', itemPath, 200],
      ['delete', 'delete', itemPath, 204],
    ] as const) {
      if (!resource.operations[operation])
        continue
      paths[path] = {
        ...paths[path],
        [method]: {
          operationId: `${resource.name}.items.${operation}`,
          parameters: path === itemPath ? [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }] : undefined,
          requestBody: operation === 'delete' ? undefined : { content: { 'application/json': { schema: itemSchema } }, required: true },
          responses: { [status]: { description: operation === 'delete' ? 'Deleted.' : 'Resource item.' }, ...errors },
          security: [{ betterAuth: [] }],
          tags: ['Resources'],
        },
      }
    }
  }
  return paths
}

export function arkOpenApiDocument(origin?: string) {
  return {
    openapi: '3.1.0',
    info: { title: 'Ark REST API', version: '1.0.0' },
    servers: origin ? [{ url: origin }] : undefined,
    paths: { ...actionOperations(), ...resourceOperations() },
    components: {
      securitySchemes: { betterAuth: { in: 'cookie', name: 'better-auth.session_token', type: 'apiKey' } },
      schemas: {
        Problem: {
          properties: {
            code: { type: 'string' }, detail: { type: 'string' }, instance: { type: 'string' }, requestId: { type: 'string' }, status: { type: 'integer' }, title: { type: 'string' }, type: { type: 'string' },
          },
          required: ['type', 'title', 'status', 'detail', 'instance', 'code', 'requestId'],
          type: 'object',
        },
      },
    },
  }
}

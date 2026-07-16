import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import {
  defineEventHandler,
  getHeader,
  getMethod,
  getQuery,
  getRouterParam,
  readBody,
  setHeader,
  setResponseStatus,
} from 'h3'
import { ArkActionError, executeArkAction, isArkActionProcedure } from '../../actions/init'
import { arkRouter } from '../../actions/routers/ark'
import { ArkResourceError } from '../../resources/errors'

const actionStatus: Record<string, number> = {
  BAD_REQUEST: 400,
  CONFLICT: 409,
  FORBIDDEN: 403,
  INTERNAL_SERVER_ERROR: 500,
  METHOD_NOT_ALLOWED: 405,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
}

function camelCase(value: string) {
  return value.replace(/-([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase())
}

function resolveProcedure(parts: string[], method: string) {
  const segments = [...parts]
  const actionIndex = segments.indexOf('actions')
  if (actionIndex >= 0)
    segments.splice(actionIndex, 1)
  const keys = segments.map(camelCase)

  let current: any = arkRouter
  for (const key of keys)
    current = current?.[key]
  if (!isArkActionProcedure(current) && method === 'GET')
    current = current?.list
  return isArkActionProcedure(current) ? current : null
}

function inputFromQuery(event: H3Event) {
  const raw = getQuery(event).input
  if (raw === undefined)
    return {}
  if (typeof raw !== 'string')
    throw new ArkActionError({ code: 'BAD_REQUEST', message: 'input must be a JSON query parameter.' })
  try {
    return JSON.parse(raw)
  }
  catch {
    throw new ArkActionError({ code: 'BAD_REQUEST', message: 'input must contain valid JSON.' })
  }
}

function problem(event: H3Event, error: unknown, requestId: string) {
  const actionError = error instanceof ArkActionError ? error : null
  const resourceError = error instanceof ArkResourceError ? error : null
  const validation = error && typeof error === 'object' && 'issues' in error
    ? error as { issues: Array<{ message: string, path: PropertyKey[] }> }
    : null
  const code = resourceError?.code ?? actionError?.code ?? (validation ? 'FAILED_VALIDATION' : 'INTERNAL_SERVER_ERROR')
  const status = resourceError?.status ?? actionStatus[code] ?? (validation ? 400 : 500)
  const title = resourceError?.title ?? actionError?.message ?? (validation ? 'Validation failed' : 'Internal server error')
  const detail = resourceError?.detail ?? title
  if (!resourceError && !actionError && !validation)
    console.error('[ark] REST action failed', error)
  setResponseStatus(event, status)
  setHeader(event, 'content-type', 'application/problem+json')
  return {
    code,
    detail,
    errors: resourceError?.errors ?? validation?.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })),
    instance: event.path,
    requestId,
    status,
    title,
    type: 'about:blank',
  }
}

export default defineEventHandler(async (event) => {
  const requestId = getHeader(event, 'x-request-id')?.trim() || randomUUID()
  setHeader(event, 'x-request-id', requestId)
  try {
    const method = getMethod(event)
    if (!['GET', 'POST'].includes(method))
      throw new ArkActionError({ code: 'METHOD_NOT_ALLOWED', message: 'Ark REST operations support GET and POST only.' })
    const rawPath = getRouterParam(event, 'action') ?? ''
    const parts = rawPath.split('/').filter(Boolean)
    const procedure = resolveProcedure(parts, method)
    if (!procedure) {
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Ark REST operation not found.' })
    }
    if (method === 'GET' ? procedure.kind !== 'query' : procedure.kind !== 'mutation')
      throw new ArkActionError({ code: 'METHOD_NOT_ALLOWED', message: 'This Ark REST operation does not support that method.' })

    const input = method === 'GET' ? inputFromQuery(event) : await readBody(event) ?? {}
    const data = await executeArkAction(procedure, event, input)
    return { data }
  }
  catch (error) {
    return problem(event, error, requestId)
  }
})

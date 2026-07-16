import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { getHeader, getRouterParam, setHeader, setResponseStatus } from 'h3'
import { ArkResourceError } from './errors'
import { useArkResourceService } from './request'
import { ArkResourceService } from './service'

function requestId(event: H3Event) {
  return getHeader(event, 'x-request-id')?.trim() || randomUUID()
}

function problem(event: H3Event, error: ArkResourceError, id: string) {
  setResponseStatus(event, error.status)
  setHeader(event, 'content-type', 'application/problem+json')
  setHeader(event, 'x-request-id', id)
  return {
    code: error.code,
    detail: error.detail,
    errors: error.errors,
    instance: event.path,
    requestId: id,
    status: error.status,
    title: error.title,
    type: 'about:blank',
  }
}

export async function withArkResourceRequest<T>(
  event: H3Event,
  handler: (context: { service: ArkResourceService }) => Promise<T>,
) {
  const id = requestId(event)
  setHeader(event, 'x-request-id', id)

  try {
    const name = getRouterParam(event, 'resource') ?? ''
    const service = await useArkResourceService(event, name)
    return await handler({ service })
  }
  catch (error) {
    if (error instanceof ArkResourceError)
      return problem(event, error, id) as T

    console.error('[ark] Resource request failed', error)
    return problem(event, new ArkResourceError({
      code: 'INTERNAL_ERROR',
      detail: 'The Resource request could not be completed.',
      status: 500,
      title: 'Internal server error',
    }), id) as T
  }
}

export class ArkResourceError extends Error {
  readonly code: string
  readonly detail?: string
  readonly errors?: Array<{ field?: string, message: string }>
  readonly status: number
  readonly title: string

  constructor(options: {
    code: string
    detail?: string
    errors?: Array<{ field?: string, message: string }>
    status: number
    title: string
  }) {
    super(options.detail ?? options.title)
    this.name = 'ArkResourceError'
    this.code = options.code
    this.detail = options.detail
    this.errors = options.errors
    this.status = options.status
    this.title = options.title
  }
}

export function resourceBadRequest(detail: string, code = 'INVALID_QUERY') {
  return new ArkResourceError({ code, detail, status: 400, title: 'Invalid request' })
}

export function resourceForbidden(detail = 'You are not allowed to perform this operation.') {
  return new ArkResourceError({ code: 'FORBIDDEN', detail, status: 403, title: 'Forbidden' })
}

export function resourceNotFound(resource: string) {
  return new ArkResourceError({
    code: 'RECORD_NOT_FOUND',
    detail: `No permitted item exists in Resource "${resource}" for that key.`,
    status: 404,
    title: 'Item not found',
  })
}

export function resourceUnknown(resource: string) {
  return new ArkResourceError({
    code: 'UNKNOWN_RESOURCE',
    detail: `Resource "${resource}" is not registered or adopted.`,
    status: 404,
    title: 'Resource not found',
  })
}

export function resourceOperationDisabled(resource: string, operation: string) {
  return new ArkResourceError({
    code: 'METHOD_NOT_ALLOWED',
    detail: `${operation} is disabled for Resource "${resource}".`,
    status: 405,
    title: 'Operation disabled',
  })
}

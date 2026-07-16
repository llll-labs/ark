interface ArkProblemDetails {
  detail?: unknown
  message?: unknown
  statusMessage?: unknown
  title?: unknown
}

export function arkApiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const data = 'data' in error
      ? (error as { data?: ArkProblemDetails }).data
      : undefined
    for (const value of [data?.detail, data?.title, data?.statusMessage, data?.message]) {
      if (typeof value === 'string' && value.trim())
        return value
    }
  }
  if (error instanceof Error && error.message)
    return error.message
  return fallback
}

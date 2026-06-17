/** Pretty-print a value as 2-space JSON, treating nullish as an empty object. */
export function compactJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2)
}

/** Coerce a value to a plain object, or `{}` for non-objects/arrays. */
export function plainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

/** Parse a JSON string into a plain object, swallowing errors into `{}`. */
export function parseStoredObject(value: string): Record<string, unknown> {
  try {
    return plainObject(JSON.parse(value || '{}'))
  }
  catch {
    return {}
  }
}

/** Parse a JSON object field, throwing a labelled error on invalid input. */
export function parseJsonField(label: string, value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error(`${label} must be a JSON object`)
    return parsed as Record<string, unknown>
  }
  catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : 'invalid JSON'}`)
  }
}

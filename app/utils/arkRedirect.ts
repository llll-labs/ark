/**
 * Open-redirect guard. Returns `value` only when it is a safe in-app path
 * (single leading slash); otherwise returns `fallback`.
 */
export function safeRedirect(value: unknown, fallback = ''): string {
  if (typeof value !== 'string')
    return fallback
  if (!value.startsWith('/') || value.startsWith('//'))
    return fallback
  return value
}

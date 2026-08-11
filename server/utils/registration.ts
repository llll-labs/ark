import type { arkSettings } from '../../db/schema'

type AuthJson = typeof arkSettings.$inferSelect.authJson

export type ArkRegistrationMode = 'closed' | 'invite' | 'open'

function authObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function arkRegistrationMode(value: AuthJson | null | undefined): ArkRegistrationMode {
  const authJson = authObject(value)
  const configured = String(authJson.registration_mode ?? '').trim().toLowerCase()
  if (configured === 'closed' || configured === 'invite' || configured === 'open')
    return configured
  return authJson.registration_enabled === false ? 'closed' : 'open'
}

export function arkSelfRegistrationAllowed(value: AuthJson | null | undefined) {
  return arkRegistrationMode(value) === 'open'
}

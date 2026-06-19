import type { H3Event } from 'h3'
import type { ArkCapability } from '../../db/zod'
import { createError } from 'h3'
import { createBoundRequestAuth } from './authorization'

export interface AppSettingsRegistration<TSettings> {
  dataKey: string
  defaults: TSettings
  icon: string
  id: string
  label: string
  parse: (value: unknown) => TSettings
  slot?: string
  validate: (value: unknown) => { issues: string[], settings: null | TSettings }
}

export interface AppSettingsSection {
  icon: string
  id: string
  label: string
  slot?: string
}

export function appSettingsSection(registration: AppSettingsRegistration<unknown>): AppSettingsSection {
  return {
    icon: registration.icon,
    id: registration.id,
    label: registration.label,
    slot: registration.slot,
  }
}

export async function requireAppSettingsCapability(event: H3Event, capability: Extract<ArkCapability, 'settings.read' | 'settings.manage'>) {
  const { auth, session } = await createBoundRequestAuth(event)
  const root = await auth.publicSpace()
  if (!root)
    throw createError({ statusCode: 404, statusMessage: 'Public space not found.' })
  const access = await auth.capabilitiesFor(root.id)
  if (!access.capabilities.includes(capability)) {
    throw createError({
      statusCode: session?.user ? 403 : 401,
      statusMessage: `Missing capability: ${capability}`,
    })
  }
  return access
}

export function createAppSettingsAccess<TSettings>(registration: AppSettingsRegistration<TSettings>) {
  return {
    registration,
    requireCapability: requireAppSettingsCapability,
    section: appSettingsSection(registration),
  }
}

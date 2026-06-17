import type { useDatabase } from './db'
import { arkCapabilityActionPattern, arkCapabilityValues } from '../../db/zod'

type Database = ReturnType<typeof useDatabase>

export interface ArkUserExtensionInput {
  arkUserId: string
  db: Database
}

export type ArkUserExtensionLoader = (input: ArkUserExtensionInput) => Promise<Record<string, unknown> | null>

let arkUserExtensionLoader: ArkUserExtensionLoader | undefined

export interface ArkAdminTableRegistration {
  key: string
  label: string
  description: string
  icon: string
  group: string
  primaryKey?: string
  table: unknown
}

const arkAdminTableRegistrations = new Map<string, ArkAdminTableRegistration>()

export function registerArkUserExtensionLoader(loader: ArkUserExtensionLoader) {
  arkUserExtensionLoader = loader
}

export async function loadArkUserExtension(input: ArkUserExtensionInput) {
  if (!arkUserExtensionLoader)
    return null

  return arkUserExtensionLoader(input)
}

export function registerArkAdminTables(tables: ArkAdminTableRegistration[]) {
  for (const table of tables)
    arkAdminTableRegistrations.set(table.key, table)
}

export function loadArkAdminTableRegistrations() {
  return [...arkAdminTableRegistrations.values()]
}

export type ArkDefaultRoleKey = 'admin' | 'anon' | 'member' | 'moderator' | 'owner'

export interface ArkCapabilityRegistrationOptions {
  // Built-in role bundles that get this capability seeded as an allow grant
  // on the root space. Seeding is add-only, so admins can still revoke it in
  // the Permissions UI without it being re-granted on the next boot.
  defaultRoles?: ArkDefaultRoleKey[]
}

const arkTenantCapabilities = new Map<string, Set<ArkDefaultRoleKey>>()

// Call from a tenant Nitro plugin (runs at boot, before any request-triggered
// grant seeding). Grant actions are stored as plain text, so no migration is
// needed for tenant capabilities.
export function registerArkCapabilities(capabilities: string[], options: ArkCapabilityRegistrationOptions = {}) {
  for (const capability of capabilities) {
    if (!arkCapabilityActionPattern.test(capability))
      throw new Error(`registerArkCapabilities: invalid capability action "${capability}"`)
    const roles = arkTenantCapabilities.get(capability) ?? new Set<ArkDefaultRoleKey>()
    for (const role of options.defaultRoles ?? [])
      roles.add(role)
    arkTenantCapabilities.set(capability, roles)
  }
}

export function loadArkTenantCapabilities() {
  return [...arkTenantCapabilities.keys()]
}

export function loadArkTenantCapabilitiesForRole(role: ArkDefaultRoleKey) {
  return [...arkTenantCapabilities]
    .filter(([, roles]) => roles.has(role))
    .map(([capability]) => capability)
}

export function isKnownArkCapability(action: string) {
  return (arkCapabilityValues as readonly string[]).includes(action) || arkTenantCapabilities.has(action)
}

import type { ArkCapability } from '../../db/zod'
import { and, eq, isNull } from 'drizzle-orm'
import { arkGrants, arkRoles } from '../../db/schema'
import { loadArkTenantCapabilitiesForRole } from '../utils/app-extensions'
import { useDatabase } from '../utils/db'

type Database = ReturnType<typeof useDatabase>

const ownerCapabilities: ArkCapability[] = [
  'market.access',
  'forum.access',
  'knowledge.access',
  'agent.access',
  'dm.access',
  'settings.read',
  'settings.manage',
  'spaces.read',
  'spaces.manage',
  'members.read',
  'members.manage',
  'roles.read',
  'roles.manage',
  'channels.read',
  'channels.create',
  'channels.manage',
  'messages.read',
  'messages.create',
  'messages.manage',
  'files.read',
  'files.upload',
  'files.manage',
  'pages.read',
  'pages.manage',
  'items.read',
  'items.create',
  'items.update',
  'items.manage',
  'market.jobs.read',
  'market.jobs.create',
  'market.jobs.manage',
]

const moderatorCapabilities: ArkCapability[] = [
  'market.access',
  'forum.access',
  'knowledge.access',
  'dm.access',
  'settings.read',
  'spaces.read',
  'members.read',
  'roles.read',
  'channels.read',
  'channels.create',
  'channels.manage',
  'messages.read',
  'messages.create',
  'messages.manage',
  'files.read',
  'files.upload',
  'pages.read',
  'items.read',
  'items.create',
  'items.update',
  'market.jobs.read',
  'market.jobs.create',
  'market.jobs.manage',
]

const memberCapabilities: ArkCapability[] = [
  'market.access',
  'forum.access',
  'knowledge.access',
  'settings.read',
  'spaces.read',
  'channels.read',
  'messages.read',
  'messages.create',
  'files.read',
  'files.upload',
  'pages.read',
  'items.read',
  'items.create',
  'items.update',
  'market.jobs.read',
]

const anonCapabilities: ArkCapability[] = [
  'settings.read',
]

async function ensureGrantsForSubject(input: {
  actions: string[]
  reconcile?: boolean
  scopeId: string
  subjectId?: null | string
  subjectType: 'anon' | 'role'
}, db: Database) {
  const existing = await db.select().from(arkGrants).where(and(
    eq(arkGrants.status, 'active'),
    eq(arkGrants.scopeType, 'space'),
    eq(arkGrants.scopeId, input.scopeId),
    eq(arkGrants.subjectType, input.subjectType),
    input.subjectId ? eq(arkGrants.subjectId, input.subjectId) : isNull(arkGrants.subjectId),
  ))
  const existingActions = new Set(existing.filter(row => row.effect === 'allow').map(row => row.action))
  const missing = input.actions.filter(action => !existingActions.has(action))
  const desiredActions = new Set(input.actions)
  const extra = input.reconcile
    ? existing.filter(row => row.effect === 'allow' && !desiredActions.has(row.action))
    : []
  for (const grant of extra) {
    await db.update(arkGrants).set({
      status: 'inactive',
      updatedAt: new Date(),
    }).where(eq(arkGrants.id, grant.id))
  }
  if (!missing.length)
    return

  await db.insert(arkGrants).values(missing.map(action => ({
    action,
    effect: 'allow' as const,
    scopeId: input.scopeId,
    scopeType: 'space' as const,
    subjectId: input.subjectId ?? null,
    subjectType: input.subjectType,
  })))
}

export async function ensureDefaultPermissionRoles(rootSpaceId: string, db: Database = useDatabase()) {
  await db.insert(arkRoles).values([
    { isSystem: true, key: 'admin', name: 'Admin', rank: 120, scopeId: rootSpaceId, scopeType: 'space' },
    { isSystem: true, key: 'owner', name: 'Owner', rank: 100, scopeId: rootSpaceId, scopeType: 'space' },
    { isSystem: true, key: 'moderator', name: 'Moderator', rank: 50, scopeId: rootSpaceId, scopeType: 'space' },
    { isSystem: true, key: 'member', name: 'Member', rank: 10, scopeId: rootSpaceId, scopeType: 'space' },
  ]).onConflictDoNothing()

  await db.update(arkRoles).set({
    isSystem: true,
    name: 'Admin',
    rank: 120,
    updatedAt: new Date(),
  }).where(and(
    eq(arkRoles.scopeType, 'space'),
    eq(arkRoles.scopeId, rootSpaceId),
    eq(arkRoles.key, 'admin'),
  ))

  const roleRows = await db.select().from(arkRoles).where(and(
    eq(arkRoles.scopeType, 'space'),
    eq(arkRoles.scopeId, rootSpaceId),
  ))

  const adminRole = roleRows.find(role => role.key === 'admin')
  const ownerRole = roleRows.find(role => role.key === 'owner')
  const moderatorRole = roleRows.find(role => role.key === 'moderator')
  const memberRole = roleRows.find(role => role.key === 'member')

  if (adminRole)
    await ensureGrantsForSubject({ actions: [...ownerCapabilities, ...loadArkTenantCapabilitiesForRole('admin')], scopeId: rootSpaceId, subjectId: adminRole.id, subjectType: 'role' }, db)
  if (ownerRole)
    await ensureGrantsForSubject({ actions: [...ownerCapabilities, ...loadArkTenantCapabilitiesForRole('owner')], scopeId: rootSpaceId, subjectId: ownerRole.id, subjectType: 'role' }, db)
  if (moderatorRole)
    await ensureGrantsForSubject({ actions: [...moderatorCapabilities, ...loadArkTenantCapabilitiesForRole('moderator')], scopeId: rootSpaceId, subjectId: moderatorRole.id, subjectType: 'role' }, db)
  if (memberRole)
    await ensureGrantsForSubject({ actions: [...memberCapabilities, ...loadArkTenantCapabilitiesForRole('member')], scopeId: rootSpaceId, subjectId: memberRole.id, subjectType: 'role' }, db)
  await ensureGrantsForSubject({ actions: [...anonCapabilities, ...loadArkTenantCapabilitiesForRole('anon')], scopeId: rootSpaceId, subjectId: null, subjectType: 'anon' }, db)

  return { adminRole, memberRole, moderatorRole, ownerRole }
}

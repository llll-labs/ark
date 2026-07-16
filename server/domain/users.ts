import type { ArkAuthUser, ArkHookContext } from '../utils/hooks'
import { and, eq, isNull } from 'drizzle-orm'
import {
  arkMembershipRoles,
  arkMemberships,
  arkRoles,
  arkSpaces,
  arkUsers,
} from '../../db/schema'
import { createArkResourceServices } from '../resources/service'
import { ensureDefaultPermissionRoles } from './permissions'
import { syncArkUserProviderAvatar } from '../utils/provider-avatar'
import { arkHooks } from '../utils/hooks'

type Database = ArkHookContext['db']
export type ArkUserRow = typeof arkUsers.$inferSelect
export type ArkSpaceRow = typeof arkSpaces.$inferSelect

export interface ArkUserProvisioningContext extends ArkHookContext {
  ensureDefaultArk?: () => Promise<unknown>
  getPublicSpace: (db: Database) => Promise<ArkSpaceRow | null>
  isConfiguredAdminEmail?: (email: string) => boolean
  syncOperatorChannelMembers?: (rootSpaceId: string) => Promise<void>
}

function slugifySpaceName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

async function syncProviderAvatarSafely(arkUser: ArkUserRow, authUser: ArkAuthUser) {
  try {
    return await syncArkUserProviderAvatar(arkUser, authUser)
  }
  catch (error) {
    console.warn('[ark] Provider avatar sync failed', error)
    return arkUser
  }
}

export async function ensureArkUserPersonalSpace(arkUser: ArkUserRow, db: Database) {
  const [existing] = await db.select().from(arkSpaces).where(and(
    eq(arkSpaces.ownerArkUserId, arkUser.id),
    eq(arkSpaces.kind, 'organization'),
    isNull(arkSpaces.parentSpaceId),
    isNull(arkSpaces.deletedAt),
  )).limit(1)

  const personal = existing ?? await (async () => {
    const baseSlug = slugifySpaceName(arkUser.displayName) || `user-${arkUser.id.slice(0, 8)}`
    let personalSlug = baseSlug
    for (let attempt = 2; attempt <= 50; attempt += 1) {
      const [taken] = await db.select({ id: arkSpaces.id }).from(arkSpaces).where(and(
        isNull(arkSpaces.parentSpaceId),
        eq(arkSpaces.slug, personalSlug),
        isNull(arkSpaces.deletedAt),
      )).limit(1)
      if (!taken)
        break
      personalSlug = `${baseSlug}-${attempt}`
    }

    const created = await createArkResourceServices({
      accountability: {
        arkUserId: arkUser.id,
        capabilities: [],
        spaceId: null,
        system: false,
        userId: arkUser.authUserId,
      },
      authorization: 'domain',
      database: db,
    }).resource('ark.spaces').create({
      inheritAccess: false,
      kind: 'organization',
      name: arkUser.displayName,
      ownerArkUserId: arkUser.id,
      parentSpaceId: null,
      slug: personalSlug,
      status: 'active',
      visibility: 'private',
    }) as ArkSpaceRow
    return created
  })()

  const { ownerRole } = await ensureDefaultPermissionRoles(personal.id, db)

  const [membership] = await db.insert(arkMemberships).values({
    arkUserId: arkUser.id,
    joinedAt: new Date(),
    roleId: ownerRole?.id,
    scopeId: personal.id,
    scopeType: 'space',
    status: 'active',
  }).onConflictDoUpdate({
    set: {
      roleId: ownerRole?.id,
      status: 'active',
      updatedAt: new Date(),
    },
    target: [arkMemberships.scopeType, arkMemberships.scopeId, arkMemberships.arkUserId],
  }).returning()

  if (membership && ownerRole) {
    await db.insert(arkMembershipRoles).values({
      membershipId: membership.id,
      roleId: ownerRole.id,
    }).onConflictDoNothing()
  }

  return personal
}

async function assignRootMembership(input: {
  arkUser: ArkUserRow
  authUser: ArkAuthUser
  root: ArkSpaceRow
}, ctx: ArkUserProvisioningContext) {
  const roleKey = ctx.isConfiguredAdminEmail?.(input.authUser.email) ? 'admin' : 'member'
  const [role] = await ctx.db.select().from(arkRoles).where(and(
    eq(arkRoles.scopeType, 'space'),
    eq(arkRoles.scopeId, input.root.id),
    eq(arkRoles.key, roleKey),
  )).limit(1)
  const [membership] = await ctx.db.insert(arkMemberships).values({
    arkUserId: input.arkUser.id,
    joinedAt: new Date(),
    roleId: role?.id,
    scopeId: input.root.id,
    scopeType: 'space',
    status: 'active',
  }).onConflictDoNothing().returning()
  if (membership) {
    if (role)
      await ctx.db.insert(arkMembershipRoles).values({ membershipId: membership.id, roleId: role.id }).onConflictDoNothing()
    if (role && ['admin', 'owner'].includes(role.key))
      await ctx.syncOperatorChannelMembers?.(input.root.id)
  }
}

export async function ensureArkUser(authUser: ArkAuthUser, ctx: ArkUserProvisioningContext) {
  const [existing] = await ctx.db
    .select()
    .from(arkUsers)
    .where(eq(arkUsers.authUserId, authUser.id))
    .limit(1)

  if (existing) {
    await arkHooks.runAction('ark.users.completed', { arkUser: existing, authUser, created: false }, ctx)
    return syncProviderAvatarSafely(existing, authUser)
  }

  let root = await ctx.getPublicSpace(ctx.db)
  if (!root && ctx.isConfiguredAdminEmail?.(authUser.email)) {
    await ctx.ensureDefaultArk?.()
    root = await ctx.getPublicSpace(ctx.db)
  }
  if (!root)
    throw new Error('Ark is not initialized. Sign in as the configured admin or run setup first.')

  const filtered = await arkHooks.applyFilter('ark.users.creating', {
    authUser,
    values: {
      authUserId: authUser.id,
      displayName: authUser.name || authUser.email.split('@')[0] || 'member',
      kind: 'human',
    },
  }, ctx)

  const created = await createArkResourceServices({
    accountability: {
      arkUserId: null,
      capabilities: [],
      spaceId: root.id,
      system: false,
      userId: authUser.id,
    },
    authorization: 'domain',
    database: ctx.db,
  }).resource('ark.users').create(filtered.values) as ArkUserRow
  if (created.authUserId !== authUser.id)
    throw new Error('Ark user lifecycle changed its auth identity.')

  await assignRootMembership({ arkUser: created, authUser, root }, ctx)
  await arkHooks.runAction('ark.users.created', { arkUser: created, authUser }, ctx)
  await arkHooks.runAction('ark.users.completed', { arkUser: created, authUser, created: true }, ctx)

  return syncProviderAvatarSafely(created, authUser)
}

arkHooks.action('ark.users.created', async ({ arkUser }, ctx) => {
  await ensureArkUserPersonalSpace(arkUser, ctx.db)
}, { key: 'ark.core.users.created.personal-space' })

arkHooks.action('ark.users.completed', async ({ arkUser }, ctx) => {
  await ensureArkUserPersonalSpace(arkUser, ctx.db)
}, { key: 'ark.core.users.completed.personal-space' })

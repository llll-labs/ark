import type { H3Event } from 'h3'
import type { ArkCapability, ArkCapabilityLike } from '../../db/zod'
import { hashPassword } from 'better-auth/crypto'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { createError } from 'h3'
import {
  arkSettings,
  arkUsers,
  arkAuthAccounts,
  arkAuthUsers,
  arkChannelCategories,
  arkChannelMembers,
  arkChannels,
  arkGrants,
  arkMembershipRoles,
  arkMemberships,
  arkRoles,
  arkSpaces,
} from '../../db/schema'
import { loadArkTenantCapabilitiesForRole } from './app-extensions'
import { auth } from './auth'
import { useDatabase } from './db'
import { discordOAuthConfigured } from './discord-oauth'
import { syncArkUserProviderAvatar } from './provider-avatar'

type Session = Awaited<ReturnType<typeof getArkSession>>
type ChannelRow = typeof arkChannels.$inferSelect
type ArkUserRow = typeof arkUsers.$inferSelect
type SpaceRow = typeof arkSpaces.$inferSelect
export interface EffectiveCapabilities {
  arkUser?: ArkUserRow | null
  capabilities: string[]
  spaceIds: string[]
  spaces: SpaceRow[]
}
export type ChannelAccessResult
  = | { access: EffectiveCapabilities, allowed: true, channel: ChannelRow }
    | { access?: EffectiveCapabilities, allowed: false, channel: ChannelRow | null, reason: string }
interface AuthUser {
  email: string
  id: string
  image?: null | string
  name: string
}

export const defaultArkName = process.env.NUXT_PUBLIC_APP_NAME ?? 'Ark'

export function defaultArkIdentity() {
  return {
    id: 'single',
    name: defaultArkName,
    slug: 'public',
  }
}

export const virtualArk = defaultArkIdentity

export function defaultArkSettingsValues() {
  return {
    authJson: {
      discord_enabled: discordOAuthConfigured(),
      email_password_enabled: true,
      registration_enabled: true,
      registration_mode: 'open',
      telegram_enabled: Boolean(String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim()),
    },
    name: defaultArkName,
    onboardingJson: {
      // Neutral core default. Tenants extend this field list (or replace the
      // onboarding flow with their own component) via ark settings.
      onboarding_fields: ['name', 'bio'],
      onboarding_method: 'onboarding',
      review_required: false,
    },
    dataJson: {},
    portalJson: {
      default_route: '/app/jobs',
      public_root_unscoped: true,
    },
    primaryColor: '#0B0F12',
    accentColor: '#00D1C1',
  }
}

type DefaultArkIdentity = ReturnType<typeof defaultArkIdentity>
let defaultArkEnsured = false
let defaultArkEnsurePromise: Promise<DefaultArkIdentity> | null = null

interface AuthLookupOptions {
  arkUser?: ArkUserRow | null
  bypassRequestAuth?: boolean
  capabilitiesFor?: (spaceId: string) => Promise<EffectiveCapabilities>
  db?: ReturnType<typeof useDatabase>
}

export interface RequestAuthContext {
  arkUser: () => Promise<ArkUserRow | null>
  canReadChannel: (channelId: string) => Promise<ChannelAccessResult>
  capabilitiesFor: (spaceId: string) => Promise<EffectiveCapabilities>
  publicSpace: () => Promise<SpaceRow | null>
  requireSpace: (spaceId: string, capability: ArkCapabilityLike) => Promise<EffectiveCapabilities>
  session: () => Promise<Session>
}

const requestAuthBySession = new WeakMap<object, RequestAuthContext>()

function sessionObject(session: Session) {
  return session && typeof session === 'object' ? session as object : null
}

export function bindRequestAuth(session: Session, requestAuth: RequestAuthContext) {
  const key = sessionObject(session)
  if (key)
    requestAuthBySession.set(key, requestAuth)
}

function requestAuthForSession(session: Session) {
  const key = sessionObject(session)
  return key ? requestAuthBySession.get(key) ?? null : null
}

async function syncProviderAvatarSafely(arkUser: ArkUserRow, authUser: AuthUser) {
  try {
    return await syncArkUserProviderAvatar(arkUser, authUser)
  }
  catch (error) {
    console.warn('[ark] Provider avatar sync failed', error)
    return arkUser
  }
}

function slugifySpaceName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

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

// Moderators: member baseline + curation, posting, channel & DM creation.
// Not granted by default to anyone — assign the `moderator` role to roll out.
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

const operatorRoleKeys = new Set(['admin', 'owner'])

function adminCredentials() {
  const email = String(process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
  const password = String(process.env.ADMIN_PASSWORD ?? '').trim()
  if (!email || !password)
    return null
  return {
    email,
    name: String(process.env.ADMIN_NAME ?? `${defaultArkName} Admin`).trim() || `${defaultArkName} Admin`,
    password,
  }
}

function isConfiguredAdminEmail(email: string) {
  return adminCredentials()?.email === email.trim().toLowerCase()
}

async function ensureGrantsForSubject(input: {
  actions: string[]
  reconcile?: boolean
  scopeId: string
  subjectId?: null | string
  subjectType: 'anon' | 'role'
}) {
  const db = useDatabase()
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

async function ensureDefaultPermissionRoles(rootSpaceId: string) {
  const db = useDatabase()

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

  // Tenant capabilities registered via registerArkCapabilities() extend the
  // built-in bundles for the roles they declared.
  if (adminRole)
    await ensureGrantsForSubject({ actions: [...ownerCapabilities, ...loadArkTenantCapabilitiesForRole('admin')], scopeId: rootSpaceId, subjectId: adminRole.id, subjectType: 'role' })
  if (ownerRole)
    await ensureGrantsForSubject({ actions: [...ownerCapabilities, ...loadArkTenantCapabilitiesForRole('owner')], scopeId: rootSpaceId, subjectId: ownerRole.id, subjectType: 'role' })
  // Add-only (no reconcile): seeds the baseline if missing, but never strips
  // grants — so the Permissions admin UI is the control plane and its toggles
  // persist instead of being reverted on the next ensureDefaultArk call.
  if (moderatorRole)
    await ensureGrantsForSubject({ actions: [...moderatorCapabilities, ...loadArkTenantCapabilitiesForRole('moderator')], scopeId: rootSpaceId, subjectId: moderatorRole.id, subjectType: 'role' })
  if (memberRole)
    await ensureGrantsForSubject({ actions: [...memberCapabilities, ...loadArkTenantCapabilitiesForRole('member')], scopeId: rootSpaceId, subjectId: memberRole.id, subjectType: 'role' })
  await ensureGrantsForSubject({ actions: [...anonCapabilities, ...loadArkTenantCapabilitiesForRole('anon')], scopeId: rootSpaceId, subjectId: null, subjectType: 'anon' })

  return { adminRole, memberRole, moderatorRole, ownerRole }
}

export async function ensureDefaultChannelCategory(spaceId: string) {
  const db = useDatabase()
  const [existing] = await db.select().from(arkChannelCategories).where(and(
    eq(arkChannelCategories.spaceId, spaceId),
    eq(arkChannelCategories.slug, 'general'),
    isNull(arkChannelCategories.deletedAt),
  )).limit(1)
  if (existing)
    return existing

  const [category] = await db.insert(arkChannelCategories).values({
    name: 'General',
    slug: 'general',
    spaceId,
  }).onConflictDoNothing().returning()
  const resolved = category ?? (await db.select().from(arkChannelCategories).where(and(
    eq(arkChannelCategories.spaceId, spaceId),
    eq(arkChannelCategories.slug, 'general'),
    isNull(arkChannelCategories.deletedAt),
  )).limit(1))[0]
  if (!resolved)
    throw new Error('Default channel category could not be created')
  return resolved
}

async function ensureDefaultChannels(rootSpaceId: string) {
  const db = useDatabase()
  const generalCategory = await ensureDefaultChannelCategory(rootSpaceId)

  await db.insert(arkChannels).values([
    {
      kind: 'chat',
      name: 'general',
      slug: 'general',
      spaceId: rootSpaceId,
      topic: 'Logged-in marketplace discussion',
      visibility: 'registered',
    },
    {
      kind: 'chat',
      name: 'owners',
      slug: 'owners',
      spaceId: rootSpaceId,
      topic: 'Operator notifications and discussion',
      visibility: 'private',
    },
    {
      categoryId: generalCategory?.id,
      kind: 'forum',
      name: 'forum',
      slug: 'forum',
      spaceId: rootSpaceId,
      topic: 'Marketplace forum',
      visibility: 'registered',
    },
  ]).onConflictDoNothing()

  await db.update(arkChannels).set({
    topic: 'Logged-in marketplace discussion',
    updatedAt: new Date(),
    visibility: 'registered',
  }).where(and(
    eq(arkChannels.spaceId, rootSpaceId),
    eq(arkChannels.slug, 'general'),
  ))
  await db.update(arkChannels).set({
    categoryId: generalCategory?.id,
    topic: 'Marketplace forum',
    updatedAt: new Date(),
    visibility: 'registered',
  }).where(and(
    eq(arkChannels.spaceId, rootSpaceId),
    eq(arkChannels.slug, 'forum'),
  ))
  if (generalCategory) {
    await db.update(arkChannels).set({
      categoryId: generalCategory.id,
      updatedAt: new Date(),
    }).where(and(
      eq(arkChannels.spaceId, rootSpaceId),
      eq(arkChannels.kind, 'forum'),
      isNull(arkChannels.categoryId),
    ))
  }
}

async function syncOperatorChannelMembers(rootSpaceId: string) {
  const db = useDatabase()
  const [ownersChannel] = await db.select().from(arkChannels).where(and(
    eq(arkChannels.spaceId, rootSpaceId),
    eq(arkChannels.slug, 'owners'),
  )).limit(1)
  if (!ownersChannel)
    return

  const operatorRoles = await db.select().from(arkRoles).where(and(
    eq(arkRoles.scopeType, 'space'),
    eq(arkRoles.scopeId, rootSpaceId),
    inArray(arkRoles.key, Array.from(operatorRoleKeys)),
  ))
  const operatorRoleIds = operatorRoles.map(role => role.id)
  if (!operatorRoleIds.length)
    return

  const activeMemberships = await db.select().from(arkMemberships).where(and(
    eq(arkMemberships.scopeType, 'space'),
    eq(arkMemberships.scopeId, rootSpaceId),
    eq(arkMemberships.status, 'active'),
  ))
  if (!activeMemberships.length)
    return

  const directOperatorMembershipIds = new Set(
    activeMemberships
      .filter(row => row.roleId && operatorRoleIds.includes(row.roleId))
      .map(row => row.id),
  )
  const assignedOperatorRows = await db.select().from(arkMembershipRoles).where(and(
    eq(arkMembershipRoles.status, 'active'),
    inArray(arkMembershipRoles.membershipId, activeMemberships.map(row => row.id)),
    inArray(arkMembershipRoles.roleId, operatorRoleIds),
  ))
  for (const row of assignedOperatorRows)
    directOperatorMembershipIds.add(row.membershipId)

  const operatorUserIds = activeMemberships
    .filter(row => directOperatorMembershipIds.has(row.id))
    .map(row => row.arkUserId)
  if (!operatorUserIds.length)
    return

  await db.insert(arkChannelMembers).values(operatorUserIds.map(arkUserId => ({
    arkUserId,
    channelId: ownersChannel.id,
    role: 'member',
    status: 'active' as const,
  }))).onConflictDoNothing()
}

async function ensureMembershipRole(input: { arkUserId: string, roleId?: string, rootSpaceId: string }) {
  if (!input.roleId)
    return null

  const db = useDatabase()
  const [membership] = await db.insert(arkMemberships).values({
    arkUserId: input.arkUserId,
    joinedAt: new Date(),
    roleId: input.roleId,
    scopeId: input.rootSpaceId,
    scopeType: 'space',
    status: 'active',
  }).onConflictDoUpdate({
    set: {
      roleId: input.roleId,
      status: 'active',
      updatedAt: new Date(),
    },
    target: [arkMemberships.scopeType, arkMemberships.scopeId, arkMemberships.arkUserId],
  }).returning()

  if (membership) {
    await db.insert(arkMembershipRoles).values({
      membershipId: membership.id,
      roleId: input.roleId,
    }).onConflictDoNothing()
  }
  return membership
}

async function ensureConfiguredAdmin(rootSpaceId: string) {
  const credentials = adminCredentials()
  if (!credentials)
    return null

  const db = useDatabase()
  const [authUser] = await db.insert(arkAuthUsers).values({
    email: credentials.email,
    emailVerified: true,
    name: credentials.name,
  }).onConflictDoUpdate({
    set: {
      emailVerified: true,
      updatedAt: new Date(),
    },
    target: arkAuthUsers.email,
  }).returning()
  if (!authUser)
    throw new Error('Admin auth user could not be created.')

  const [existingAccount] = await db.select().from(arkAuthAccounts).where(and(
    eq(arkAuthAccounts.providerId, 'credential'),
    eq(arkAuthAccounts.userId, authUser.id),
  )).limit(1)
  if (existingAccount) {
    if (!existingAccount.password || existingAccount.accountId !== authUser.id) {
      await db.update(arkAuthAccounts).set({
        accountId: authUser.id,
        password: existingAccount.password ?? await hashPassword(credentials.password),
        updatedAt: new Date(),
      }).where(eq(arkAuthAccounts.id, existingAccount.id))
    }
  }
  else {
    await db.insert(arkAuthAccounts).values({
      accountId: authUser.id,
      password: await hashPassword(credentials.password),
      providerId: 'credential',
      userId: authUser.id,
    }).onConflictDoNothing()
  }

  const [arkUser] = await db.insert(arkUsers).values({
    authUserId: authUser.id,
    displayName: credentials.name,
    kind: 'human',
    profileJson: { systemRole: 'admin' },
  }).onConflictDoUpdate({
    set: {
      updatedAt: new Date(),
    },
    target: arkUsers.authUserId,
  }).returning()
  if (!arkUser)
    throw new Error('Admin Ark user could not be created.')

  const [adminRole] = await db.select().from(arkRoles).where(and(
    eq(arkRoles.scopeType, 'space'),
    eq(arkRoles.scopeId, rootSpaceId),
    eq(arkRoles.key, 'admin'),
  )).limit(1)

  const membership = await ensureMembershipRole({ arkUserId: arkUser.id, roleId: adminRole?.id, rootSpaceId })
  void membership
  await syncOperatorChannelMembers(rootSpaceId)
  return arkUser
}

export async function getArkSession(event: H3Event) {
  return auth.api.getSession({
    headers: event.headers,
  })
}

export async function requireAuthUser(event: H3Event) {
  const { session } = await createBoundRequestAuth(event)
  if (!session?.user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required',
    })
  }
  return session
}

export function createRequestAuth(event: H3Event, db: ReturnType<typeof useDatabase> = useDatabase()): RequestAuthContext {
  let sessionPromise: Promise<Session> | null = null
  let arkUserPromise: Promise<ArkUserRow | null> | null = null
  let publicSpacePromise: Promise<SpaceRow | null> | null = null
  const capabilityPromises = new Map<string, Promise<EffectiveCapabilities>>()
  const channelAccessPromises = new Map<string, Promise<ChannelAccessResult>>()

  const requestAuth: RequestAuthContext = {
    session() {
      sessionPromise ??= getArkSession(event)
      return sessionPromise
    },
    arkUser() {
      arkUserPromise ??= requestAuth.session().then(session => currentArkUser(session, { bypassRequestAuth: true, db }))
      return arkUserPromise
    },
    publicSpace() {
      publicSpacePromise ??= getPublicSpace(db)
      return publicSpacePromise
    },
    capabilitiesFor(spaceId: string) {
      let promise = capabilityPromises.get(spaceId)
      if (!promise) {
        promise = Promise.all([requestAuth.session(), requestAuth.arkUser()])
          .then(([session, arkUser]) => getEffectiveCapabilities(spaceId, session, {
            arkUser,
            bypassRequestAuth: true,
            db,
          }))
        capabilityPromises.set(spaceId, promise)
      }
      return promise
    },
    requireSpace(spaceId: string, capability: ArkCapabilityLike) {
      return requestAuth.capabilitiesFor(spaceId).then((access) => {
        if (!access.capabilities.includes(capability)) {
          throw createError({
            statusCode: 403,
            statusMessage: `Missing capability: ${capability}`,
          })
        }
        return access
      })
    },
    canReadChannel(channelId: string) {
      let promise = channelAccessPromises.get(channelId)
      if (!promise) {
        promise = requestAuth.session().then(session => canReadChannel(channelId, session, {
          bypassRequestAuth: true,
          capabilitiesFor: requestAuth.capabilitiesFor,
          db,
        }))
        channelAccessPromises.set(channelId, promise)
      }
      return promise
    },
  }

  return requestAuth
}

export async function createBoundRequestAuth(event: H3Event, db: ReturnType<typeof useDatabase> = useDatabase()) {
  const requestAuth = createRequestAuth(event, db)
  const session = await requestAuth.session()
  bindRequestAuth(session, requestAuth)
  return { auth: requestAuth, db, session }
}

export async function requireCurrentArkUser(event: H3Event, db: ReturnType<typeof useDatabase> = useDatabase()) {
  const context = await createBoundRequestAuth(event, db)
  if (!context.session?.user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required',
    })
  }

  const arkUser = await context.auth.arkUser()
  if (!arkUser) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Ark profile is not provisioned.',
    })
  }

  return {
    ...context,
    arkUser,
  }
}

async function ensureDefaultArkUncached() {
  const db = useDatabase()

  await db.insert(arkSettings).values(defaultArkSettingsValues()).onConflictDoNothing()

  const [existingRoot] = await db.select().from(arkSpaces).where(and(
    isNull(arkSpaces.deletedAt),
    or(
      eq(arkSpaces.isDefault, true),
      and(isNull(arkSpaces.parentSpaceId), eq(arkSpaces.slug, 'public')),
    ),
  )).limit(1)
  if (existingRoot) {
    if (!existingRoot.isDefault || existingRoot.slug !== 'public' || existingRoot.name !== 'Public' || existingRoot.visibility !== 'registered') {
      await db.update(arkSpaces).set({
        isDefault: true,
        name: 'Public',
        slug: 'public',
        updatedAt: new Date(),
        visibility: 'registered',
      }).where(eq(arkSpaces.id, existingRoot.id))
    }
    await ensureDefaultPermissionRoles(existingRoot.id)
    await ensureDefaultChannels(existingRoot.id)
    await ensureConfiguredAdmin(existingRoot.id)
    await syncOperatorChannelMembers(existingRoot.id)
    return defaultArkIdentity()
  }

  const insertedSpaces = await db.insert(arkSpaces).values([
    {
      inheritAccess: true,
      isDefault: true,
      kind: 'public_square',
      name: 'Public',
      slug: 'public',
      visibility: 'registered',
    },
  ]).onConflictDoNothing().returning()

  const root = insertedSpaces.find(space => space.slug === 'public')
    ?? (await db.select().from(arkSpaces).where(and(
      isNull(arkSpaces.deletedAt),
      isNull(arkSpaces.parentSpaceId),
      eq(arkSpaces.slug, 'public'),
    )).limit(1))[0]
  if (!root)
    return defaultArkIdentity()

  await ensureDefaultPermissionRoles(root.id)
  await ensureDefaultChannels(root.id)
  await ensureConfiguredAdmin(root.id)

  return defaultArkIdentity()
}

export async function ensureDefaultArk(options: { force?: boolean } = {}) {
  if (defaultArkEnsured && !options.force)
    return defaultArkIdentity()

  if (defaultArkEnsurePromise && !options.force)
    return defaultArkEnsurePromise

  defaultArkEnsurePromise = ensureDefaultArkUncached()
    .then((ark) => {
      defaultArkEnsured = true
      return ark
    })
    .finally(() => {
      defaultArkEnsurePromise = null
    })

  return defaultArkEnsurePromise
}

export async function getDefaultArk() {
  return defaultArkIdentity()
}

export async function ensureArkUser(authUser: AuthUser) {
  const db = useDatabase()

  const [existing] = await db
    .select()
    .from(arkUsers)
    .where(eq(arkUsers.authUserId, authUser.id))
    .limit(1)

  if (existing)
    return syncProviderAvatarSafely(existing, authUser)

  let root = await getPublicSpace()
  if (!root && isConfiguredAdminEmail(authUser.email)) {
    await ensureDefaultArk()
    root = await getPublicSpace()
  }
  if (!root)
    throw new Error('Ark is not initialized. Sign in as the configured admin or run setup first.')

  const [created] = await db.insert(arkUsers).values({
    authUserId: authUser.id,
    displayName: authUser.name || authUser.email.split('@')[0] || 'member',
    kind: 'human',
  }).returning()
  if (!created)
    throw new Error('Ark user could not be created.')

  const roleKey = isConfiguredAdminEmail(authUser.email) ? 'admin' : 'member'
  const [role] = await db.select().from(arkRoles).where(and(
    eq(arkRoles.scopeType, 'space'),
    eq(arkRoles.scopeId, root.id),
    eq(arkRoles.key, roleKey),
  )).limit(1)
  const [membership] = await db.insert(arkMemberships).values({
    arkUserId: created.id,
    joinedAt: new Date(),
    roleId: role?.id,
    scopeId: root.id,
    scopeType: 'space',
    status: 'active',
  }).onConflictDoNothing().returning()
  if (membership) {
    if (role)
      await db.insert(arkMembershipRoles).values({ membershipId: membership.id, roleId: role.id }).onConflictDoNothing()
    if (role && operatorRoleKeys.has(role.key))
      await syncOperatorChannelMembers(root.id)
  }

  // Every user gets a personal account space — an organization with a single
  // owner member. Personal vs company is just member count; the market actor is
  // always a space, never the raw user.
  const baseSlug = slugifySpaceName(created.displayName) || `user-${created.id.slice(0, 8)}`
  let personalSlug = baseSlug
  for (let attempt = 2; attempt <= 50; attempt += 1) {
    const [taken] = await db.select({ id: arkSpaces.id }).from(arkSpaces).where(and(
      isNull(arkSpaces.parentSpaceId),
      eq(arkSpaces.slug, personalSlug),
    )).limit(1)
    if (!taken)
      break
    personalSlug = `${baseSlug}-${attempt}`
  }
  const [personal] = await db.insert(arkSpaces).values({
    inheritAccess: false,
    kind: 'organization',
    name: created.displayName,
    ownerArkUserId: created.id,
    slug: personalSlug,
    status: 'active',
    visibility: 'private',
  }).returning()
  if (personal) {
    const { ownerRole } = await ensureDefaultPermissionRoles(personal.id)
    const [personalMembership] = await db.insert(arkMemberships).values({
      arkUserId: created.id,
      joinedAt: new Date(),
      roleId: ownerRole?.id,
      scopeId: personal.id,
      scopeType: 'space',
      status: 'active',
    }).onConflictDoNothing().returning()
    if (personalMembership && ownerRole)
      await db.insert(arkMembershipRoles).values({ membershipId: personalMembership.id, roleId: ownerRole.id }).onConflictDoNothing()
  }

  return syncProviderAvatarSafely(created, authUser)
}

export async function currentArkUser(session: Session, options: AuthLookupOptions = {}): Promise<ArkUserRow | null> {
  if (!session?.user)
    return null
  if (!options.bypassRequestAuth) {
    const requestAuth = requestAuthForSession(session)
    if (requestAuth)
      return requestAuth.arkUser()
  }

  const db = options.db ?? useDatabase()
  const [arkUser] = await db
    .select()
    .from(arkUsers)
    .where(eq(arkUsers.authUserId, session.user.id))
    .limit(1)
  return arkUser ?? null
}

export async function getPublicSpace(db: ReturnType<typeof useDatabase> = useDatabase()): Promise<SpaceRow | null> {
  const [root] = await db.select().from(arkSpaces).where(and(eq(arkSpaces.isDefault, true), isNull(arkSpaces.deletedAt))).limit(1)
  return root ?? null
}

export async function getDmSpace() {
  return getPublicSpace()
}

export async function getSpaceAccessScope(spaceId: string, db: ReturnType<typeof useDatabase> = useDatabase()): Promise<SpaceRow[]> {
  const rows: SpaceRow[] = []
  const visited = new Set<string>()
  const maxDepth = 32
  let currentSpaceId: string | null = spaceId

  while (currentSpaceId) {
    if (visited.has(currentSpaceId)) {
      console.warn('[ark] Space access scope cycle detected', { currentSpaceId, spaceId })
      break
    }
    if (rows.length >= maxDepth) {
      console.warn('[ark] Space access scope depth limit reached', { maxDepth, spaceId })
      break
    }
    visited.add(currentSpaceId)

    const [space] = await db.select().from(arkSpaces).where(eq(arkSpaces.id, currentSpaceId)).limit(1)
    if (!space || space.deletedAt)
      break
    rows.push(space)
    currentSpaceId = space.inheritAccess ? space.parentSpaceId : null
  }

  return rows
}

export async function getEffectiveCapabilities(spaceId: string, session: Session, options: AuthLookupOptions = {}): Promise<EffectiveCapabilities> {
  if (!options.bypassRequestAuth) {
    const requestAuth = requestAuthForSession(session)
    if (requestAuth)
      return requestAuth.capabilitiesFor(spaceId)
  }

  const db = options.db ?? useDatabase()
  const scope = await getSpaceAccessScope(spaceId, db)
  const spaceIds = scope.map(space => space.id)
  if (scope.length === 0) {
    return { capabilities: [] as string[], spaceIds, spaces: scope }
  }

  const arkUser = Object.prototype.hasOwnProperty.call(options, 'arkUser')
    ? options.arkUser ?? null
    : await currentArkUser(session, { bypassRequestAuth: true, db })
  const activeMemberships = arkUser
    ? await db.select().from(arkMemberships).where(and(
        eq(arkMemberships.arkUserId, arkUser.id),
        eq(arkMemberships.status, 'active'),
      ))
    : []
  const activeMembershipIds = new Set(activeMemberships.map(row => row.id))
  const assignedRoleIds = new Set(activeMemberships.map(row => row.roleId).filter((value): value is string => Boolean(value)))
  if (activeMemberships.length) {
    const assignedRows = await db.select().from(arkMembershipRoles).where(and(
      eq(arkMembershipRoles.status, 'active'),
      inArray(arkMembershipRoles.membershipId, activeMemberships.map(row => row.id)),
    ))
    for (const row of assignedRows)
      assignedRoleIds.add(row.roleId)
  }
  const assignedRoles = assignedRoleIds.size
    ? await db.select().from(arkRoles).where(inArray(arkRoles.id, Array.from(assignedRoleIds)))
    : []
  const activeRoleIds = new Set(assignedRoles.map(role => role.id))

  const scopedGrants = await db.select().from(arkGrants).where(and(
    eq(arkGrants.status, 'active'),
    eq(arkGrants.scopeType, 'space'),
    inArray(arkGrants.scopeId, spaceIds),
  ))
  const globalGrants = await db.select().from(arkGrants).where(and(
    eq(arkGrants.status, 'active'),
    eq(arkGrants.scopeType, 'global'),
    isNull(arkGrants.scopeId),
  ))

  const denied = new Set<string>()
  const allowed = new Set<string>()
  for (const grant of [...globalGrants, ...scopedGrants]) {
    const action = grant.action
    const matches = grant.subjectType === 'anon'
      || (grant.subjectType === 'authenticated' && !!arkUser)
      || (grant.subjectType === 'ark_user' && grant.subjectId === arkUser?.id)
      || (grant.subjectType === 'role' && !!grant.subjectId && activeRoleIds.has(grant.subjectId))
      || (grant.subjectType === 'membership' && !!grant.subjectId && activeMembershipIds.has(grant.subjectId))

    if (!matches)
      continue
    if (grant.effect === 'deny')
      denied.add(action)
    else
      allowed.add(action)
  }

  for (const capability of denied)
    allowed.delete(capability)

  return {
    arkUser,
    capabilities: Array.from(allowed).sort(),
    spaceIds,
    spaces: scope,
  }
}

export async function canReadChannel(channelId: string, session: Session, options: AuthLookupOptions = {}): Promise<ChannelAccessResult> {
  if (!options.bypassRequestAuth) {
    const requestAuth = requestAuthForSession(session)
    if (requestAuth)
      return requestAuth.canReadChannel(channelId)
  }

  const db = options.db ?? useDatabase()
  const [channel] = await db.select().from(arkChannels).where(eq(arkChannels.id, channelId)).limit(1)
  if (!channel || channel.deletedAt)
    return { allowed: false, channel: null, reason: 'not_found' }

  if (channel.kind === 'thread') {
    if (!channel.threadParentChannelId)
      return { allowed: false, channel, reason: 'thread_parent_missing' }
    const parentAccess: ChannelAccessResult = await canReadChannel(channel.threadParentChannelId, session, {
      ...options,
      bypassRequestAuth: true,
      db,
    })
    if (!parentAccess.allowed)
      return { access: parentAccess.access, allowed: false, channel, reason: parentAccess.reason }
    return { allowed: true, access: parentAccess.access, channel }
  }

  const access = options.capabilitiesFor
    ? await options.capabilitiesFor(channel.spaceId)
    : await getEffectiveCapabilities(channel.spaceId, session, { bypassRequestAuth: true, db })
  if (!access.capabilities.includes('channels.read'))
    return { allowed: false, access, channel, reason: 'missing_capability' }

  if (channel.kind === 'forum' && !access.capabilities.includes('forum.access'))
    return { allowed: false, access, channel, reason: 'missing_capability' }

  if (channel.visibility !== 'private' && channel.kind !== 'dm')
    return { allowed: true, access, channel }

  if (!access.arkUser)
    return { allowed: false, access, channel, reason: 'channel_membership_required' }

  const [member] = await db.select().from(arkChannelMembers).where(and(
    eq(arkChannelMembers.channelId, channel.id),
    eq(arkChannelMembers.arkUserId, access.arkUser.id),
    eq(arkChannelMembers.status, 'active'),
  )).limit(1)

  if (!member)
    return { allowed: false, access, channel, reason: 'channel_membership_required' }
  return { allowed: true, access, channel }
}

export async function requireSpaceCapability(event: H3Event, spaceId: string, capability: ArkCapabilityLike) {
  const { auth, session } = await createBoundRequestAuth(event)
  const access = await auth.requireSpace(spaceId, capability)
  return { access, session }
}

export async function requirePublicCapability(event: H3Event, capability: ArkCapabilityLike) {
  const { auth, session } = await createBoundRequestAuth(event)
  const root = await auth.publicSpace()
  if (!root) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Public space not found',
    })
  }
  const access = await auth.requireSpace(root.id, capability)
  return { access, session }
}

export async function requireChannelCapability(event: H3Event, channelId: string, capability: ArkCapabilityLike) {
  const { auth, session } = await createBoundRequestAuth(event)
  const channelAccess = await auth.canReadChannel(channelId)
  if (!channelAccess.allowed) {
    throw createError({
      statusCode: channelAccess.reason === 'not_found' ? 404 : 403,
      statusMessage: channelAccess.reason ?? 'Channel access denied',
    })
  }

  if (!channelAccess.access.capabilities.includes(capability)) {
    throw createError({
      statusCode: 403,
      statusMessage: `Missing capability: ${capability}`,
    })
  }

  return {
    access: channelAccess.access,
    channel: channelAccess.channel,
    session,
  }
}

export async function getArkMemberships(authUserId: string) {
  const db = useDatabase()
  const [arkUser] = await db.select().from(arkUsers).where(eq(arkUsers.authUserId, authUserId)).limit(1)

  if (!arkUser)
    return []

  return db.select().from(arkMemberships).where(eq(arkMemberships.arkUserId, arkUser.id))
}

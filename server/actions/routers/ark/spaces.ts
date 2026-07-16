import { isKnownArkCapability } from '../../../utils/app-extensions'
import { createArkResourceServices } from '../../../resources/service'
import {
  and,
  arkActionResourceAccountability,
  arkUserAction,
  baseAction,
  byIdSchema,
  arkChannelMembers,
  arkChannels,
  createArkActionRouter,
  desc,
  emptyListSchema,
  eq,
  grantCreateSchema,
  arkGrants,
  inArray,
  arkMembershipRoles,
  arkMemberships,
  memberUpsertSchema,
  requireSpaceAccess,
  roleCreateSchema,
  arkRoles,
  spaceCreateSchema,
  spaceListSchema,
  arkSpaces,
  spaceScopedListSchema,
  ArkActionError,
} from './shared'

export const spacesRouter = createArkActionRouter({
  list: baseAction.input(spaceListSchema).query(async ({ ctx, input }) => {
    const rows = await ctx.db.select().from(arkSpaces).orderBy(arkSpaces.createdAt)
    const filtered = []
    for (const space of rows) {
      if (space.deletedAt)
        continue
      if (input.parentSpaceId !== undefined && space.parentSpaceId !== input.parentSpaceId)
        continue
      const access = await ctx.auth.capabilitiesFor(space.id)
      if (access.capabilities.includes('spaces.read'))
        filtered.push(space)
    }
    return filtered
  }),
  byId: baseAction.input(byIdSchema).query(async ({ ctx, input }) => {
    const [space] = await ctx.db.select().from(arkSpaces).where(eq(arkSpaces.id, input.id)).limit(1)
    if (!space)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Space not found' })
    await requireSpaceAccess(space.id, ctx, 'spaces.read')
    return space
  }),
  create: arkUserAction.input(spaceCreateSchema).mutation(async ({ ctx, input }) => {
    const parent = input.parentSpaceId
      ? (await ctx.db.select().from(arkSpaces).where(eq(arkSpaces.id, input.parentSpaceId)).limit(1))[0]
      : await ctx.auth.publicSpace()
    if (!parent)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Parent space not found' })
    const access = await requireSpaceAccess(parent.id, ctx, 'spaces.manage')
    const arkUser = await ctx.auth.arkUser()
    const services = createArkResourceServices({
      accountability: arkActionResourceAccountability(ctx, {
        arkUserId: arkUser?.id,
        capabilities: access.capabilities,
        spaceId: parent.id,
      }),
      authorization: 'domain',
      database: ctx.db,
    })
    return services.resource('ark.spaces').create({
      description: input.description,
      inheritAccess: input.inheritAccess,
      kind: input.kind,
      name: input.name,
      ownerArkUserId: arkUser?.id,
      parentSpaceId: input.parentSpaceId ?? parent.id,
      slug: input.slug,
      visibility: input.visibility,
    })
  }),
  effectiveCapabilities: baseAction.input(spaceScopedListSchema).query(async ({ ctx, input }) => {
    return ctx.auth.capabilitiesFor(input.spaceId)
  }),
})

export const membersRouter = createArkActionRouter({
  list: baseAction.input(spaceScopedListSchema).query(async ({ ctx, input }) => {
    await requireSpaceAccess(input.spaceId, ctx, 'members.read')
    return ctx.db.select().from(arkMemberships).where(and(
      eq(arkMemberships.scopeType, 'space'),
      eq(arkMemberships.scopeId, input.spaceId),
    ))
  }),
  upsert: arkUserAction.input(memberUpsertSchema).mutation(async ({ ctx, input }) => {
    await requireSpaceAccess(input.scopeId, ctx, 'members.manage')
    return ctx.db.transaction(async (database: any) => {
      const [row] = await database.insert(arkMemberships).values({
        arkUserId: input.arkUserId,
        joinedAt: new Date(),
        roleId: input.roleId ?? null,
        scopeId: input.scopeId,
        scopeType: input.scopeType,
        status: input.status,
      }).onConflictDoUpdate({
        set: {
          roleId: input.roleId ?? null,
          status: input.status,
          updatedAt: new Date(),
        },
        target: [arkMemberships.scopeType, arkMemberships.scopeId, arkMemberships.arkUserId],
      }).returning()
      const roleIds = input.roleIds ?? (input.roleId ? [input.roleId] : [])
      if (row && roleIds.length) {
        await database.insert(arkMembershipRoles).values(roleIds.map(roleId => ({
          membershipId: row.id,
          roleId,
        }))).onConflictDoNothing()
        const assignedRoles = await database.select().from(arkRoles).where(inArray(arkRoles.id, roleIds))
        if (assignedRoles.some((role: { key: string }) => ['admin', 'owner'].includes(role.key))) {
          const [channel] = await database.select().from(arkChannels).where(and(
            eq(arkChannels.spaceId, input.scopeId),
            eq(arkChannels.slug, 'owners'),
          )).limit(1)
          if (channel) {
            await database.insert(arkChannelMembers).values({
              arkUserId: input.arkUserId,
              channelId: channel.id,
              role: 'member',
              status: 'active',
            }).onConflictDoNothing()
          }
        }
      }
      return row
    })
  }),
})

export const rolesRouter = createArkActionRouter({
  list: baseAction.input(emptyListSchema).query(async ({ ctx }) => {
    const root = await ctx.auth.publicSpace()
    if (!root)
      return []
    await requireSpaceAccess(root.id, ctx, 'roles.read')
    return ctx.db.select().from(arkRoles).orderBy(desc(arkRoles.rank))
  }),
  create: arkUserAction.input(roleCreateSchema).mutation(async ({ ctx, input }) => {
    const root = await ctx.auth.publicSpace()
    if (!root)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Public space not found' })
    if (input.scopeType === 'space' && input.scopeId) {
      await requireSpaceAccess(input.scopeId, ctx, 'roles.manage')
    }
    else {
      await requireSpaceAccess(root.id, ctx, 'roles.manage')
    }
    const [role] = await ctx.db.insert(arkRoles).values({
      description: input.description ?? null,
      key: input.key,
      name: input.name,
      rank: input.rank,
      scopeId: input.scopeType === 'space' ? input.scopeId ?? root.id : null,
      scopeType: input.scopeType,
    }).returning()
    return role
  }),
})

export const permissionsRouter = createArkActionRouter({
  list: baseAction.input(emptyListSchema).query(async ({ ctx }) => {
    const root = await ctx.auth.publicSpace()
    if (!root)
      return []
    await requireSpaceAccess(root.id, ctx, 'roles.read')
    return ctx.db.select().from(arkGrants)
  }),
  grant: arkUserAction.input(grantCreateSchema).mutation(async ({ ctx, input }) => {
    // Schema only checks shape; the known set (core + tenant-registered) is
    // runtime state, so enforce it here.
    if (!isKnownArkCapability(input.action))
      throw new ArkActionError({ code: 'BAD_REQUEST', message: `Unknown capability: ${input.action}` })
    if (input.scopeType === 'space' && input.scopeId) {
      await requireSpaceAccess(input.scopeId, ctx, 'roles.manage')
    }
    else {
      const root = await ctx.auth.publicSpace()
      if (!root)
        throw new ArkActionError({ code: 'NOT_FOUND', message: 'Public space not found' })
      await requireSpaceAccess(root.id, ctx, 'roles.manage')
    }
    const [row] = await ctx.db.insert(arkGrants).values({
      action: input.action,
      effect: input.effect,
      scopeId: input.scopeId ?? null,
      scopeType: input.scopeType,
      subjectId: input.subjectId ?? null,
      subjectType: input.subjectType,
    }).returning()
    return row
  }),
})

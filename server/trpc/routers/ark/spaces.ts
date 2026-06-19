import { isKnownArkCapability } from '../../../utils/app-extensions'
import {
  and,
  arkUserProcedure,
  baseProcedure,
  byIdSchema,
  arkChannelMembers,
  arkChannels,
  createTRPCRouter,
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
  TRPCError,
} from './shared'

export const spacesRouter = createTRPCRouter({
  list: baseProcedure.input(spaceListSchema).query(async ({ ctx, input }) => {
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
  byId: baseProcedure.input(byIdSchema).query(async ({ ctx, input }) => {
    const [space] = await ctx.db.select().from(arkSpaces).where(eq(arkSpaces.id, input.id)).limit(1)
    if (!space)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Space not found' })
    await requireSpaceAccess(space.id, ctx, 'spaces.read')
    return space
  }),
  create: arkUserProcedure.input(spaceCreateSchema).mutation(async ({ ctx, input }) => {
    const parent = input.parentSpaceId
      ? (await ctx.db.select().from(arkSpaces).where(eq(arkSpaces.id, input.parentSpaceId)).limit(1))[0]
      : await ctx.auth.publicSpace()
    if (!parent)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent space not found' })
    await requireSpaceAccess(parent.id, ctx, 'spaces.manage')
    const arkUser = await ctx.auth.arkUser()
    const [space] = await ctx.db.insert(arkSpaces).values({
      description: input.description,
      inheritAccess: input.inheritAccess,
      kind: input.kind,
      name: input.name,
      ownerArkUserId: arkUser?.id,
      parentSpaceId: input.parentSpaceId ?? null,
      slug: input.slug,
      visibility: input.visibility,
    }).returning()
    return space
  }),
  effectiveCapabilities: baseProcedure.input(spaceScopedListSchema).query(async ({ ctx, input }) => {
    return ctx.auth.capabilitiesFor(input.spaceId)
  }),
})

export const membersRouter = createTRPCRouter({
  list: baseProcedure.input(spaceScopedListSchema).query(async ({ ctx, input }) => {
    await requireSpaceAccess(input.spaceId, ctx, 'members.read')
    return ctx.db.select().from(arkMemberships).where(and(
      eq(arkMemberships.scopeType, 'space'),
      eq(arkMemberships.scopeId, input.spaceId),
    ))
  }),
  upsert: arkUserProcedure.input(memberUpsertSchema).mutation(async ({ ctx, input }) => {
    await requireSpaceAccess(input.scopeId, ctx, 'members.manage')
    const [row] = await ctx.db.insert(arkMemberships).values({
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
      await ctx.db.insert(arkMembershipRoles).values(roleIds.map(roleId => ({
        membershipId: row.id,
        roleId,
      }))).onConflictDoNothing()
      const assignedRoles = await ctx.db.select().from(arkRoles).where(inArray(arkRoles.id, roleIds))
      if (assignedRoles.some(role => ['admin', 'owner'].includes(role.key))) {
        const [channel] = await ctx.db.select().from(arkChannels).where(and(
          eq(arkChannels.spaceId, input.scopeId),
          eq(arkChannels.slug, 'owners'),
        )).limit(1)
        if (channel) {
          await ctx.db.insert(arkChannelMembers).values({
            arkUserId: input.arkUserId,
            channelId: channel.id,
            role: 'member',
            status: 'active',
          }).onConflictDoNothing()
        }
      }
    }
    return row
  }),
})

export const rolesRouter = createTRPCRouter({
  list: baseProcedure.input(emptyListSchema).query(async ({ ctx }) => {
    const root = await ctx.auth.publicSpace()
    if (!root)
      return []
    await requireSpaceAccess(root.id, ctx, 'roles.read')
    return ctx.db.select().from(arkRoles).orderBy(desc(arkRoles.rank))
  }),
  create: arkUserProcedure.input(roleCreateSchema).mutation(async ({ ctx, input }) => {
    const root = await ctx.auth.publicSpace()
    if (!root)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Public space not found' })
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

export const permissionsRouter = createTRPCRouter({
  list: baseProcedure.input(emptyListSchema).query(async ({ ctx }) => {
    const root = await ctx.auth.publicSpace()
    if (!root)
      return []
    await requireSpaceAccess(root.id, ctx, 'roles.read')
    return ctx.db.select().from(arkGrants)
  }),
  grant: arkUserProcedure.input(grantCreateSchema).mutation(async ({ ctx, input }) => {
    // Schema only checks shape; the known set (core + tenant-registered) is
    // runtime state, so enforce it here.
    if (!isKnownArkCapability(input.action))
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown capability: ${input.action}` })
    if (input.scopeType === 'space' && input.scopeId) {
      await requireSpaceAccess(input.scopeId, ctx, 'roles.manage')
    }
    else {
      const root = await ctx.auth.publicSpace()
      if (!root)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Public space not found' })
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

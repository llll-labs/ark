import {
  and,
  arkUsers,
  arkAuthAccounts,
  createTRPCRouter,
  emptyListSchema,
  eq,
  arkFiles,
  inArray,
  protectedProcedure,
  TRPCError,
  userProfileUpdateSchema,
  arkUserSettings,
  userSettingsUpdateSchema,
  visibleArkUserIds,
} from './shared'
import { canUseFileAsProfileAvatar } from '../../../utils/avatar'

export const usersRouter = createTRPCRouter({
  list: protectedProcedure.input(emptyListSchema).query(async ({ ctx }) => {
    const visibleIds = await visibleArkUserIds(ctx)
    if (Array.isArray(visibleIds) && !visibleIds.length)
      return []

    const fields = {
      avatarFileId: arkUsers.avatarFileId,
      bio: arkUsers.bio,
      displayName: arkUsers.displayName,
      handle: arkUsers.handle,
      id: arkUsers.id,
      kind: arkUsers.kind,
    }
    if (Array.isArray(visibleIds)) {
      const rows = await ctx.db
        .select(fields)
        .from(arkUsers)
        .where(and(
          eq(arkUsers.kind, 'human'),
          inArray(arkUsers.id, visibleIds),
        ))
        .orderBy(arkUsers.displayName)
        .limit(100)
      return rows
    }

    const rows = await ctx.db
      .select(fields)
      .from(arkUsers)
      .where(eq(arkUsers.kind, 'human'))
      .orderBy(arkUsers.displayName)
      .limit(100)
    return rows
  }),
  settings: protectedProcedure.input(emptyListSchema).query(async ({ ctx }) => {
    const arkUser = await ctx.auth.arkUser()
    if (!arkUser)
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
    const [settings] = await ctx.db.select().from(arkUserSettings).where(eq(arkUserSettings.arkUserId, arkUser.id)).limit(1)
    const accounts = arkUser.authUserId
      ? await ctx.db.select({ providerId: arkAuthAccounts.providerId }).from(arkAuthAccounts).where(eq(arkAuthAccounts.userId, arkUser.authUserId))
      : []
    return {
      profile: arkUser,
      settings: settings ?? null,
      login: { providers: accounts.map(row => row.providerId), email: ctx.session?.user?.email ?? null },
    }
  }),
  updateProfile: protectedProcedure.input(userProfileUpdateSchema).mutation(async ({ ctx, input }) => {
    const arkUser = await ctx.auth.arkUser()
    if (!arkUser)
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' })

    if (input.avatarFileId) {
      const [file] = await ctx.db.select().from(arkFiles).where(eq(arkFiles.id, input.avatarFileId)).limit(1)
      if (!canUseFileAsProfileAvatar(file, arkUser.id))
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Avatar file is invalid.' })
    }

    const [updated] = await ctx.db.update(arkUsers).set({
      ...(input.avatarFileId !== undefined ? { avatarFileId: input.avatarFileId } : {}),
      bio: input.bio,
      displayName: input.displayName,
      handle: input.handle,
      profileJson: input.profileJson,
      updatedAt: new Date(),
    }).where(eq(arkUsers.id, arkUser.id)).returning()
    return updated ?? null
  }),
  updateSettings: protectedProcedure.input(userSettingsUpdateSchema).mutation(async ({ ctx, input }) => {
    const arkUser = await ctx.auth.arkUser()
    if (!arkUser)
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
    const [settings] = await ctx.db.insert(arkUserSettings).values({
      agentJson: input.agentJson ?? {},
      appearanceJson: input.appearanceJson ?? {},
      arkUserId: arkUser.id,
      notificationsJson: input.notificationsJson ?? {},
      privacyJson: input.privacyJson ?? {},
    }).onConflictDoUpdate({
      set: {
        ...(input.agentJson ? { agentJson: input.agentJson } : {}),
        ...(input.appearanceJson ? { appearanceJson: input.appearanceJson } : {}),
        ...(input.notificationsJson ? { notificationsJson: input.notificationsJson } : {}),
        ...(input.privacyJson ? { privacyJson: input.privacyJson } : {}),
        updatedAt: new Date(),
      },
      target: arkUserSettings.arkUserId,
    }).returning()
    return settings
  }),
})

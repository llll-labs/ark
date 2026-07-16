import { createArkResourceServices } from '../../../resources/service'
import {
  arkActionResourceAccountability,
  and,
  arkUserAction,
  arkUsers,
  arkAuthAccounts,
  createArkActionRouter,
  emptyListSchema,
  eq,
  arkFiles,
  inArray,
  isNull,
  protectedAction,
  ArkActionError,
  userProfileUpdateSchema,
  arkUserSettings,
  userSettingsUpdateSchema,
  visibleArkUserIds,
} from './shared'
import { canUseFileAsProfileAvatar } from '../../../utils/avatar'

export const usersRouter = createArkActionRouter({
  list: protectedAction.input(emptyListSchema).query(async ({ ctx }) => {
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
          isNull(arkUsers.deletedAt),
        ))
        .orderBy(arkUsers.displayName)
        .limit(100)
      return rows
    }

    const rows = await ctx.db
      .select(fields)
      .from(arkUsers)
      .where(and(
        eq(arkUsers.kind, 'human'),
        isNull(arkUsers.deletedAt),
      ))
      .orderBy(arkUsers.displayName)
      .limit(100)
    return rows
  }),
  settings: protectedAction.input(emptyListSchema).query(async ({ ctx }) => {
    const arkUser = await ctx.auth.arkUser()
    if (!arkUser)
      throw new ArkActionError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
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
  updateProfile: arkUserAction.input(userProfileUpdateSchema).mutation(async ({ ctx, input }) => {
    const arkUser = await ctx.auth.arkUser()
    if (!arkUser)
      throw new ArkActionError({ code: 'UNAUTHORIZED', message: 'Authentication required' })

    if (input.avatarFileId) {
      const [file] = await ctx.db.select().from(arkFiles).where(eq(arkFiles.id, input.avatarFileId)).limit(1)
      if (!canUseFileAsProfileAvatar(file, arkUser.id))
        throw new ArkActionError({ code: 'BAD_REQUEST', message: 'Avatar file is invalid.' })
    }

    const services = createArkResourceServices({
      accountability: arkActionResourceAccountability(ctx, {
        arkUserId: arkUser.id,
      }),
      authorization: 'domain',
      database: ctx.db,
    })
    const updated = await services.resource('ark.users').update(arkUser.id, {
      ...(input.avatarFileId !== undefined ? { avatarFileId: input.avatarFileId } : {}),
      bio: input.bio,
      displayName: input.displayName,
      handle: input.handle,
      profileJson: input.profileJson,
      updatedAt: new Date(),
    })
    return updated
  }),
  updateSettings: arkUserAction.input(userSettingsUpdateSchema).mutation(async ({ ctx, input }) => {
    const arkUser = await ctx.auth.arkUser()
    if (!arkUser)
      throw new ArkActionError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
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

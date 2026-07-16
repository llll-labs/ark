import {
  arkSettings,
  arkUserAction,
  baseAction,
  createArkActionRouter,
  defaultArkSettingsValues,
  eq,
  protectedAction,
  requireSpaceAccess,
  settingsUpdateSchema,
  ArkActionError,
} from './shared'

export const settingsRouter = createArkActionRouter({
  public: baseAction.query(async ({ ctx }) => {
    const [settings] = await ctx.db.select().from(arkSettings).where(eq(arkSettings.key, 'main')).limit(1)
    return settings ?? {
      ...defaultArkSettingsValues(),
      createdAt: new Date(0),
      description: null,
      iconFileId: null,
      id: '00000000-0000-0000-0000-000000000000',
      key: 'main',
      logoFileId: null,
      themeJson: {},
      updatedAt: new Date(0),
    }
  }),
  admin: protectedAction.query(async ({ ctx }) => {
    const root = await ctx.auth.publicSpace()
    if (!root)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Public space not found' })
    await requireSpaceAccess(root.id, ctx, 'settings.manage')
    const [settings] = await ctx.db.select().from(arkSettings).where(eq(arkSettings.key, 'main')).limit(1)
    return settings
  }),
  update: arkUserAction.input(settingsUpdateSchema).mutation(async ({ ctx, input }) => {
    const root = await ctx.auth.publicSpace()
    if (!root)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Public space not found' })
    await requireSpaceAccess(root.id, ctx, 'settings.manage')
    const [updated] = await ctx.db.update(arkSettings).set({
      ...input,
      updatedAt: new Date(),
    }).where(eq(arkSettings.key, 'main')).returning()
    return updated
  }),
})

import {
  arkSettings,
  baseProcedure,
  createTRPCRouter,
  ensureDefaultArk,
  eq,
  getPublicSpace,
  protectedProcedure,
  requireSpaceAccess,
  settingsUpdateSchema,
  TRPCError,
} from './shared'

export const settingsRouter = createTRPCRouter({
  public: baseProcedure.query(async ({ ctx }) => {
    await ensureDefaultArk()
    const [settings] = await ctx.db.select().from(arkSettings).where(eq(arkSettings.key, 'main')).limit(1)
    return settings
  }),
  admin: protectedProcedure.query(async ({ ctx }) => {
    const root = await getPublicSpace()
    if (!root)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Public space not found' })
    await requireSpaceAccess(root.id, ctx.session, 'settings.manage')
    const [settings] = await ctx.db.select().from(arkSettings).where(eq(arkSettings.key, 'main')).limit(1)
    return settings
  }),
  update: protectedProcedure.input(settingsUpdateSchema).mutation(async ({ ctx, input }) => {
    const root = await getPublicSpace()
    if (!root)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Public space not found' })
    await requireSpaceAccess(root.id, ctx.session, 'settings.manage')
    const [updated] = await ctx.db.update(arkSettings).set({
      ...input,
      updatedAt: new Date(),
    }).where(eq(arkSettings.key, 'main')).returning()
    return updated
  }),
})

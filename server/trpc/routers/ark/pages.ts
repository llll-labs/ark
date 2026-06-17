import {
  baseProcedure,
  byIdSchema,
  createTRPCRouter,
  eq,
  pageCreateSchema,
  arkPages,
  protectedProcedure,
  requireSpaceAccess,
  spaceScopedListSchema,
  TRPCError,
  z,
} from './shared'

export const pagesRouter = createTRPCRouter({
  list: baseProcedure.input(spaceScopedListSchema).query(async ({ ctx, input }) => {
    await requireSpaceAccess(input.spaceId, ctx.session, 'pages.read')
    return ctx.db.select().from(arkPages).where(eq(arkPages.spaceId, input.spaceId)).orderBy(arkPages.position, arkPages.createdAt)
  }),
  byId: baseProcedure.input(byIdSchema).query(async ({ ctx, input }) => {
    const [page] = await ctx.db.select().from(arkPages).where(eq(arkPages.id, input.id)).limit(1)
    if (!page)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Page not found' })
    await requireSpaceAccess(page.spaceId, ctx.session, 'pages.read')
    return page
  }),
  create: protectedProcedure.input(pageCreateSchema).mutation(async ({ ctx, input }) => {
    await requireSpaceAccess(input.spaceId, ctx.session, 'pages.manage')
    const [page] = await ctx.db.insert(arkPages).values({
      componentName: input.componentName,
      configJson: input.configJson,
      icon: input.icon,
      kind: input.kind,
      parentPageId: input.parentPageId,
      position: input.position,
      slug: input.slug,
      spaceId: input.spaceId,
      targetId: input.targetId,
      targetType: input.targetType,
      title: input.title,
    }).returning()
    return page
  }),
  update: protectedProcedure.input(pageCreateSchema.partial().extend({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const [page] = await ctx.db.select().from(arkPages).where(eq(arkPages.id, input.id)).limit(1)
    if (!page)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Page not found' })
    await requireSpaceAccess(page.spaceId, ctx.session, 'pages.manage')
    const [updated] = await ctx.db.update(arkPages).set({
      componentName: input.componentName,
      configJson: input.configJson,
      icon: input.icon,
      kind: input.kind,
      parentPageId: input.parentPageId,
      position: input.position,
      slug: input.slug,
      targetId: input.targetId,
      targetType: input.targetType,
      title: input.title,
      updatedAt: new Date(),
    }).where(eq(arkPages.id, input.id)).returning()
    return updated
  }),
})

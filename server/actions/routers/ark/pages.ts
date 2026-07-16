import { createArkResourceServices } from '../../../resources/service'
import {
  arkActionResourceAccountability,
  arkUserAction,
  baseAction,
  byIdSchema,
  createArkActionRouter,
  eq,
  pageCreateSchema,
  arkPages,
  requireSpaceAccess,
  spaceScopedListSchema,
  ArkActionError,
  z,
} from './shared'

export const pagesRouter = createArkActionRouter({
  list: baseAction.input(spaceScopedListSchema).query(async ({ ctx, input }) => {
    await requireSpaceAccess(input.spaceId, ctx, 'pages.read')
    return ctx.db.select().from(arkPages).where(eq(arkPages.spaceId, input.spaceId)).orderBy(arkPages.position, arkPages.createdAt)
  }),
  byId: baseAction.input(byIdSchema).query(async ({ ctx, input }) => {
    const [page] = await ctx.db.select().from(arkPages).where(eq(arkPages.id, input.id)).limit(1)
    if (!page)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Page not found' })
    await requireSpaceAccess(page.spaceId, ctx, 'pages.read')
    return page
  }),
  create: arkUserAction.input(pageCreateSchema).mutation(async ({ ctx, input }) => {
    const access = await requireSpaceAccess(input.spaceId, ctx, 'pages.manage')
    const services = createArkResourceServices({
      accountability: arkActionResourceAccountability(ctx, {
        arkUserId: access.arkUser?.id,
        capabilities: access.capabilities,
        spaceId: input.spaceId,
      }),
      authorization: 'domain',
      database: ctx.db,
    })
    return services.resource('ark.pages').create({
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
    })
  }),
  update: arkUserAction.input(pageCreateSchema.partial().extend({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const [page] = await ctx.db.select().from(arkPages).where(eq(arkPages.id, input.id)).limit(1)
    if (!page)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Page not found' })
    const access = await requireSpaceAccess(page.spaceId, ctx, 'pages.manage')
    const services = createArkResourceServices({
      accountability: arkActionResourceAccountability(ctx, {
        arkUserId: access.arkUser?.id,
        capabilities: access.capabilities,
        spaceId: page.spaceId,
      }),
      authorization: 'domain',
      database: ctx.db,
    })
    return services.resource('ark.pages').update(input.id, {
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
    })
  }),
})

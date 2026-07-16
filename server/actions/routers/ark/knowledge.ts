import {
  arkUserAction,
  baseAction,
  collectionCreateSchema,
  arkCollections,
  createArkActionRouter,
  eq,
  fieldCreateSchema,
  arkFields,
  itemCreateSchema,
  arkItems,
  requireSpaceAccess,
  spaceScopedListSchema,
  ArkActionError,
  z,
} from './shared'

export const collectionsRouter = createArkActionRouter({
  list: baseAction.input(spaceScopedListSchema).query(async ({ ctx, input }) => {
    await requireSpaceAccess(input.spaceId, ctx, 'knowledge.access')
    await requireSpaceAccess(input.spaceId, ctx, 'items.read')
    return ctx.db.select().from(arkCollections).where(eq(arkCollections.spaceId, input.spaceId)).orderBy(arkCollections.createdAt)
  }),
  create: arkUserAction.input(collectionCreateSchema).mutation(async ({ ctx, input }) => {
    await requireSpaceAccess(input.spaceId, ctx, 'knowledge.access')
    const access = await requireSpaceAccess(input.spaceId, ctx, 'items.manage')
    const [collection] = await ctx.db.insert(arkCollections).values({
      createdByArkUserId: access.arkUser?.id,
      description: input.description,
      name: input.name,
      slug: input.slug,
      spaceId: input.spaceId,
    }).returning()
    return collection
  }),
  fields: baseAction.input(z.object({ collectionId: z.uuid() })).query(async ({ ctx, input }) => {
    const [collection] = await ctx.db.select().from(arkCollections).where(eq(arkCollections.id, input.collectionId)).limit(1)
    if (!collection)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Collection not found' })
    await requireSpaceAccess(collection.spaceId, ctx, 'knowledge.access')
    await requireSpaceAccess(collection.spaceId, ctx, 'items.read')
    return ctx.db.select().from(arkFields).where(eq(arkFields.collectionId, input.collectionId)).orderBy(arkFields.position)
  }),
  createField: arkUserAction.input(fieldCreateSchema).mutation(async ({ ctx, input }) => {
    const [collection] = await ctx.db.select().from(arkCollections).where(eq(arkCollections.id, input.collectionId)).limit(1)
    if (!collection)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Collection not found' })
    await requireSpaceAccess(collection.spaceId, ctx, 'knowledge.access')
    await requireSpaceAccess(collection.spaceId, ctx, 'items.manage')
    const [field] = await ctx.db.insert(arkFields).values({
      collectionId: collection.id,
      key: input.key,
      name: input.name,
      slotIndex: input.slotIndex,
      slotKind: input.slotKind,
      type: input.type as any,
    }).returning()
    return field
  }),
})

export const itemsRouter = createArkActionRouter({
  list: baseAction.input(spaceScopedListSchema).query(async ({ ctx, input }) => {
    await requireSpaceAccess(input.spaceId, ctx, 'knowledge.access')
    await requireSpaceAccess(input.spaceId, ctx, 'items.read')
    return ctx.db.select().from(arkItems).where(eq(arkItems.spaceId, input.spaceId)).orderBy(arkItems.position, arkItems.createdAt).limit(100)
  }),
  create: arkUserAction.input(itemCreateSchema).mutation(async ({ ctx, input }) => {
    await requireSpaceAccess(input.spaceId, ctx, 'knowledge.access')
    const access = await requireSpaceAccess(input.spaceId, ctx, 'items.create')
    const [item] = await ctx.db.insert(arkItems).values({
      bodyJson: input.bodyJson,
      collectionId: input.collectionId,
      createdByArkUserId: access.arkUser?.id,
      dataJson: input.dataJson,
      parentItemId: input.parentItemId,
      spaceId: input.spaceId,
      title: input.title,
    }).returning()
    return item
  }),
})

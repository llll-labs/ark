import type { ArkUserRow } from './shared'
import { withArkConversationTransaction } from '../../../domain/conversations'
import {
  and,
  arkActionResourceAccountability,
  arkUserAction,
  arkUsers,
  asc,
  baseAction,
  byIdSchema,
  arkChannelCategories,
  channelCreateSchema,
  arkChannels,
  createArkActionRouter,
  desc,
  dmUpsertSchema,
  ensureDefaultChannelCategory,
  eq,
  getChannelForAccess,
  getDmSpace,
  inArray,
  isNull,
  messageCreateSchema,
  messageCursor,
  arkMessagePins,
  messagePreview,
  arkMessageReactions,
  messageRelationKindSchema,
  arkMessageRelations,
  messageRelationTargetTypeSchema,
  arkMessages,
  messagesAfterSchema,
  messagesAroundSchema,
  messagesBeforeSchema,
  messagesLatestSchema,
  messagesListSchema,
  messagesPinnedSchema,
  messageWindow,
  newerMessageThan,
  olderMessageThan,
  olderPinThan,
  parseCursorDate,
  protectedAction,
  publishChatEvent,
  requireSpaceAccess,
  requireVisibleArkUsers,
  slugify,
  spaceScopedListSchema,
  sql,
  ArkActionError,
  arkUserChannelStates,
  withMessageDetails,
  z,
} from './shared'

const channelLookupSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  publicRead: z.boolean().optional(),
})
const uuidInput = z.uuid()

export const channelCategoriesRouter = createArkActionRouter({
  list: baseAction.input(spaceScopedListSchema).query(async ({ ctx, input }) => {
    await requireSpaceAccess(input.spaceId, ctx, 'channels.read')
    return ctx.db.select().from(arkChannelCategories).where(and(
      eq(arkChannelCategories.spaceId, input.spaceId),
      isNull(arkChannelCategories.deletedAt),
    )).orderBy(asc(arkChannelCategories.position), asc(arkChannelCategories.createdAt))
  }),
})

export const channelsRouter = createArkActionRouter({
  byId: baseAction.input(channelLookupSchema).query(async ({ ctx, input }) => {
    let channelId = input.id
    if (!uuidInput.safeParse(channelId).success) {
      const root = await ctx.auth.publicSpace()
      const [channel] = root
        ? await ctx.db.select({ id: arkChannels.id }).from(arkChannels).where(and(
            eq(arkChannels.spaceId, root.id),
            eq(arkChannels.slug, channelId),
            isNull(arkChannels.deletedAt),
          )).limit(1)
        : []
      channelId = channel?.id ?? channelId
    }

    if (input.publicRead)
      return (await getChannelForAccess(channelId, ctx, 'messages.read', { publicRead: true })).channel

    const access = await ctx.auth.canReadChannel(channelId)
    if (!access.channel)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Channel not found' })
    if (!access.allowed)
      throw new ArkActionError({ code: 'FORBIDDEN', message: access.reason ?? 'Channel access denied' })
    return access.channel
  }),
  participants: baseAction.input(byIdSchema).query(async ({ ctx, input }) => {
    const { channel } = await getChannelForAccess(input.id, ctx, 'messages.read')
    const rows = await ctx.db
      .select({
        arkUserId: arkMessages.authorArkUserId,
        lastMessageAt: sql<Date>`max(${arkMessages.createdAt})`,
        messagesCount: sql<number>`count(*)`,
      })
      .from(arkMessages)
      .where(and(
        eq(arkMessages.channelId, channel.id),
        isNull(arkMessages.deletedAt),
        sql`${arkMessages.authorArkUserId} is not null`,
      ))
      .groupBy(arkMessages.authorArkUserId)
      .orderBy(sql`count(*) desc`, sql`max(${arkMessages.createdAt}) desc`)
      .limit(100)

    const authorIds = rows.map((row: { arkUserId: string | null }) => row.arkUserId).filter((id): id is string => Boolean(id))
    if (!authorIds.length)
      return []

    const authors = await ctx.db
      .select({
        avatarFileId: arkUsers.avatarFileId,
        displayName: arkUsers.displayName,
        handle: arkUsers.handle,
        id: arkUsers.id,
        kind: arkUsers.kind,
      })
      .from(arkUsers)
      .where(and(
        inArray(arkUsers.id, authorIds),
        isNull(arkUsers.deletedAt),
      ))
    const authorById = new Map(authors.map((author: Pick<ArkUserRow, 'avatarFileId' | 'displayName' | 'handle' | 'id' | 'kind'>) => [author.id, author]))

    return rows.map((row: { arkUserId: string | null, lastMessageAt: Date | string, messagesCount: number | string }) => ({
      arkUserId: row.arkUserId!,
      id: `channel-participant:${channel.id}:${row.arkUserId}`,
      lastMessageAt: row.lastMessageAt,
      messagesCount: Number(row.messagesCount),
      status: authorById.get(row.arkUserId!)?.kind === 'system' ? 'character' : 'active',
      user: authorById.get(row.arkUserId!) ?? null,
    })).filter((participant: { user: unknown }) => Boolean(participant.user))
  }),
  list: baseAction.input(spaceScopedListSchema).query(async ({ ctx, input }) => {
    await requireSpaceAccess(input.spaceId, ctx, 'channels.read')
    const rows = await ctx.db.select().from(arkChannels).where(eq(arkChannels.spaceId, input.spaceId)).orderBy(arkChannels.position, arkChannels.createdAt)
    const readable = []
    for (const channel of rows) {
      const access = await ctx.auth.canReadChannel(channel.id)
      if (access.allowed)
        readable.push(channel)
    }
    return readable
  }),
  create: arkUserAction.input(channelCreateSchema).mutation(async ({ ctx, input }) => {
    const access = await requireSpaceAccess(input.spaceId, ctx, 'channels.create')
    await requireVisibleArkUsers(ctx, input.memberArkUserIds)
    const arkUser = access.arkUser ?? await ctx.auth.arkUser()
    let categoryId = input.categoryId
    if (categoryId) {
      const [category] = await ctx.db.select().from(arkChannelCategories).where(and(
        eq(arkChannelCategories.id, categoryId),
        isNull(arkChannelCategories.deletedAt),
      )).limit(1)
      if (!category || category.spaceId !== input.spaceId) {
        throw new ArkActionError({
          code: 'BAD_REQUEST',
          message: 'Channel category must belong to the selected space.',
        })
      }
    }
    else if (input.kind === 'forum') {
      const category = await ensureDefaultChannelCategory(input.spaceId)
      categoryId = category.id
    }
    return withArkConversationTransaction({
      accountability: arkActionResourceAccountability(ctx, {
        arkUserId: arkUser?.id,
        capabilities: access.capabilities,
        spaceId: input.spaceId,
      }),
      database: ctx.db,
    }, async ({ conversations }) => {
      const channel = await conversations.createChannel({
        categoryId,
        createdByArkUserId: arkUser?.id,
        kind: input.kind,
        memberArkUserIds: (input.visibility === 'private' || input.kind === 'dm') && arkUser
          ? [arkUser.id, ...input.memberArkUserIds]
          : [],
        name: input.name,
        slug: input.slug ?? slugify(input.name),
        spaceId: input.spaceId,
        targetId: input.targetId,
        targetType: input.targetType,
        visibility: input.visibility,
      }) as typeof arkChannels.$inferSelect
      return channel
    })
  }),
  upsertDm: arkUserAction.input(dmUpsertSchema).mutation(async ({ ctx, input }) => {
    const me = await ctx.auth.arkUser()
    if (!me)
      throw new ArkActionError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
    const dmSpace = await getDmSpace()
    if (!dmSpace)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'DM space not found' })
    await requireVisibleArkUsers(ctx, input.memberArkUserIds)
    const memberIds = Array.from(new Set([me.id, ...input.memberArkUserIds])).sort()
    const identityKey = `dm:${memberIds.join(':')}`
    const [existing] = await ctx.db.select().from(arkChannels).where(and(
      eq(arkChannels.identityKey, identityKey),
      isNull(arkChannels.deletedAt),
    )).limit(1)
    if (existing)
      return existing
    const access = await ctx.auth.capabilitiesFor(dmSpace.id)
    try {
      return await withArkConversationTransaction({
        accountability: arkActionResourceAccountability(ctx, {
          arkUserId: me.id,
          capabilities: access.capabilities,
          spaceId: dmSpace.id,
        }),
        database: ctx.db,
      }, async ({ conversations }) => {
        const channel = await conversations.createChannel({
          identityKey,
          kind: 'dm',
          memberArkUserIds: memberIds,
          name: 'Direct message',
          slug: `dm-${memberIds.map(id => id.slice(0, 8)).join('-')}`,
          spaceId: dmSpace.id,
          visibility: 'private',
        }) as typeof arkChannels.$inferSelect
        return channel
      })
    }
    catch (error) {
      const [raceWinner] = await ctx.db.select().from(arkChannels).where(and(
        eq(arkChannels.identityKey, identityKey),
        isNull(arkChannels.deletedAt),
      )).limit(1)
      if (raceWinner)
        return raceWinner
      throw error
    }
  }),
  upsertThreadForMessage: arkUserAction.input(z.object({ messageId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const [message] = await ctx.db.select().from(arkMessages).where(and(
      eq(arkMessages.id, input.messageId),
      isNull(arkMessages.deletedAt),
    )).limit(1)
    if (!message)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Message not found' })

    const { access, channel: parentChannel } = await getChannelForAccess(message.channelId, ctx, 'messages.create')
    if (!access.arkUser)
      throw new ArkActionError({ code: 'UNAUTHORIZED', message: 'Authentication required' })

    const identityKey = `thread:${message.id}`
    const [existing] = await ctx.db.select().from(arkChannels).where(and(
      eq(arkChannels.identityKey, identityKey),
      isNull(arkChannels.deletedAt),
    )).limit(1)
    if (existing)
      return existing

    try {
      return await withArkConversationTransaction({
        accountability: arkActionResourceAccountability(ctx, {
          arkUserId: access.arkUser.id,
          capabilities: access.capabilities,
          spaceId: message.spaceId,
        }),
        database: ctx.db,
      }, ({ conversations }) => conversations.createChannel({
        createdByArkUserId: access.arkUser!.id,
        identityKey,
        kind: 'thread',
        name: `Thread: ${messagePreview(message)}`.slice(0, 160),
        slug: `thread-${message.id.slice(0, 8)}`,
        spaceId: message.spaceId,
        targetId: message.id,
        targetType: 'message_thread',
        threadParentChannelId: parentChannel.id,
        threadRootMessageId: message.id,
        topic: messagePreview(message),
        visibility: parentChannel.visibility,
      }))
    }
    catch (error) {
      const [raceWinner] = await ctx.db.select().from(arkChannels).where(and(
        eq(arkChannels.identityKey, identityKey),
        isNull(arkChannels.deletedAt),
      )).limit(1)
      if (raceWinner)
        return raceWinner
      throw error
    }
  }),
})

export const messagesRouter = createArkActionRouter({
  latest: baseAction.input(messagesLatestSchema).query(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx, 'messages.read', { publicRead: input.publicRead })
    const rows = await ctx.db.select().from(arkMessages).where(and(
      eq(arkMessages.channelId, input.channelId),
      isNull(arkMessages.deletedAt),
    )).orderBy(desc(arkMessages.createdAt), desc(arkMessages.id)).limit(input.limit + 1)
    const items = rows.slice(0, input.limit).reverse()
    return messageWindow(ctx.db, items, {
      arkUserId: access.arkUser?.id,
      next: false,
      previous: rows.length > input.limit,
      publicRead: input.publicRead,
    })
  }),
  before: baseAction.input(messagesBeforeSchema).query(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx, 'messages.read', { publicRead: input.publicRead })
    const cursorDate = parseCursorDate(input.cursor)
    const rows = await ctx.db.select().from(arkMessages).where(and(
      eq(arkMessages.channelId, input.channelId),
      isNull(arkMessages.deletedAt),
      olderMessageThan(cursorDate, input.cursor.id),
    )).orderBy(desc(arkMessages.createdAt), desc(arkMessages.id)).limit(input.limit + 1)
    const items = rows.slice(0, input.limit).reverse()
    return messageWindow(ctx.db, items, {
      arkUserId: access.arkUser?.id,
      next: items.length > 0,
      previous: rows.length > input.limit,
      publicRead: input.publicRead,
    })
  }),
  after: baseAction.input(messagesAfterSchema).query(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx, 'messages.read', { publicRead: input.publicRead })
    const cursorDate = parseCursorDate(input.cursor)
    const rows = await ctx.db.select().from(arkMessages).where(and(
      eq(arkMessages.channelId, input.channelId),
      isNull(arkMessages.deletedAt),
      newerMessageThan(cursorDate, input.cursor.id),
    )).orderBy(asc(arkMessages.createdAt), asc(arkMessages.id)).limit(input.limit + 1)
    const items = rows.slice(0, input.limit)
    return messageWindow(ctx.db, items, {
      arkUserId: access.arkUser?.id,
      next: rows.length > input.limit,
      previous: items.length > 0,
      publicRead: input.publicRead,
    })
  }),
  around: baseAction.input(messagesAroundSchema).query(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx, 'messages.read', { publicRead: input.publicRead })
    const [target] = await ctx.db.select().from(arkMessages).where(and(
      eq(arkMessages.id, input.messageId),
      eq(arkMessages.channelId, input.channelId),
      isNull(arkMessages.deletedAt),
    )).limit(1)
    if (!target)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Message not found' })

    const olderRows = input.before > 0
      ? await ctx.db.select().from(arkMessages).where(and(
          eq(arkMessages.channelId, input.channelId),
          isNull(arkMessages.deletedAt),
          olderMessageThan(target.createdAt, target.id),
        )).orderBy(desc(arkMessages.createdAt), desc(arkMessages.id)).limit(input.before + 1)
      : []
    const newerRows = input.after > 0
      ? await ctx.db.select().from(arkMessages).where(and(
          eq(arkMessages.channelId, input.channelId),
          isNull(arkMessages.deletedAt),
          newerMessageThan(target.createdAt, target.id),
        )).orderBy(asc(arkMessages.createdAt), asc(arkMessages.id)).limit(input.after + 1)
      : []

    const items = [
      ...olderRows.slice(0, input.before).reverse(),
      target,
      ...newerRows.slice(0, input.after),
    ]
    return messageWindow(ctx.db, items, {
      anchorMessageId: target.id,
      arkUserId: access.arkUser?.id,
      next: newerRows.length > input.after,
      previous: olderRows.length > input.before,
      publicRead: input.publicRead,
    })
  }),
  pinned: baseAction.input(messagesPinnedSchema).query(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx, 'messages.read', { publicRead: input.publicRead })
    const cursorDate = input.cursor ? parseCursorDate(input.cursor) : null
    const rows = await ctx.db.select({ message: arkMessages, pin: arkMessagePins }).from(arkMessagePins).innerJoin(
      arkMessages,
      eq(arkMessagePins.messageId, arkMessages.id),
    ).where(and(
      eq(arkMessagePins.channelId, input.channelId),
      isNull(arkMessagePins.deletedAt),
      isNull(arkMessages.deletedAt),
      cursorDate ? olderPinThan(cursorDate, input.cursor!.id) : undefined,
    )).orderBy(desc(arkMessagePins.createdAt), desc(arkMessagePins.id)).limit(input.limit + 1)
    const pageRows = rows.slice(0, input.limit)
    const messagesWithAttachments = await withMessageDetails(ctx.db, pageRows.map(row => row.message), access.arkUser?.id, { publicRead: input.publicRead })
    const messagesById = new Map(messagesWithAttachments.map(message => [message.id, message]))
    return {
      hasMore: rows.length > input.limit,
      items: pageRows.map(row => ({
        message: messagesById.get(row.message.id) ?? { ...row.message, attachments: [] },
        pin: row.pin,
      })),
      nextCursor: pageRows.length
        ? messageCursor({
            createdAt: pageRows[pageRows.length - 1]!.pin.createdAt,
            id: pageRows[pageRows.length - 1]!.pin.id,
          })
        : null,
    }
  }),
  list: baseAction.input(messagesListSchema).query(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx, 'messages.read', { publicRead: input.publicRead })
    const rows = await ctx.db.select().from(arkMessages).where(and(
      eq(arkMessages.channelId, input.channelId),
      isNull(arkMessages.deletedAt),
    )).orderBy(desc(arkMessages.createdAt)).limit(input.limit)
    return withMessageDetails(ctx.db, rows, access.arkUser?.id, { publicRead: input.publicRead })
  }),
  create: arkUserAction.input(messageCreateSchema).mutation(async ({ ctx, input }) => {
    const { access, channel } = await getChannelForAccess(input.channelId, ctx, 'messages.create')
    const arkUser = access.arkUser ?? await ctx.auth.arkUser()
    if (input.forumParentMessageId && channel.kind !== 'forum') {
      throw new ArkActionError({
        code: 'BAD_REQUEST',
        message: 'Forum parent replies are only available in forum channels.',
      })
    }
    return withArkConversationTransaction({
      accountability: {
        arkUserId: arkUser?.id ?? null,
        capabilities: access.capabilities,
        spaceId: channel.spaceId,
        system: false,
        userId: ctx.session?.user?.id ?? null,
      },
      database: ctx.db,
    }, ({ conversations }) => conversations.createMessage({
        authorArkUserId: arkUser?.id,
        body: input.body,
        bodyJson: input.bodyJson,
        channelId: channel.id,
        relations: input.forumParentMessageId
          ? [{ relationType: 'forum_parent', targetId: input.forumParentMessageId, targetType: 'message' }]
          : input.replyToMessageId
            ? [{ relationType: 'reply_quote', targetId: input.replyToMessageId, targetType: 'message' }]
            : [],
        spaceId: channel.spaceId,
      }))
  }),
  react: arkUserAction.input(z.object({ emoji: z.string().min(1).max(32), messageId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const [message] = await ctx.db.select().from(arkMessages).where(and(
      eq(arkMessages.id, input.messageId),
      isNull(arkMessages.deletedAt),
    )).limit(1)
    if (!message)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Message not found' })
    const { access } = await getChannelForAccess(message.channelId, ctx, 'messages.read')
    if (!access.arkUser)
      throw new ArkActionError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
    const [existing] = await ctx.db.select().from(arkMessageReactions).where(and(
      eq(arkMessageReactions.messageId, message.id),
      eq(arkMessageReactions.arkUserId, access.arkUser.id),
      eq(arkMessageReactions.emoji, input.emoji),
      isNull(arkMessageReactions.deletedAt),
    )).limit(1)
    if (existing) {
      await ctx.db.delete(arkMessageReactions).where(eq(arkMessageReactions.id, existing.id))
      publishChatEvent({
        channelId: message.channelId,
        reason: 'reacted',
        type: 'messages:changed',
      })
      return { reacted: false }
    }
    const [reaction] = await ctx.db.insert(arkMessageReactions).values({
      arkUserId: access.arkUser.id,
      emoji: input.emoji,
      messageId: message.id,
    }).onConflictDoNothing().returning()
    if (reaction) {
      publishChatEvent({
        channelId: message.channelId,
        reason: 'reacted',
        type: 'messages:changed',
      })
    }
    return { reacted: Boolean(reaction) }
  }),
  pin: arkUserAction.input(z.object({ messageId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const [message] = await ctx.db.select().from(arkMessages).where(and(
      eq(arkMessages.id, input.messageId),
      isNull(arkMessages.deletedAt),
    )).limit(1)
    if (!message)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Message not found' })
    const { access, channel } = await getChannelForAccess(message.channelId, ctx, 'messages.manage')
    const [pin] = await ctx.db.insert(arkMessagePins).values({
      channelId: channel.id,
      messageId: message.id,
      pinnedByArkUserId: access.arkUser?.id,
    }).onConflictDoNothing().returning()
    if (pin) {
      publishChatEvent({
        channelId: channel.id,
        reason: 'pinned',
        type: 'messages:changed',
      })
    }
    return pin ?? null
  }),
  relate: arkUserAction.input(z.object({
    messageId: z.uuid(),
    relationType: messageRelationKindSchema,
    targetId: z.uuid().optional(),
    targetType: messageRelationTargetTypeSchema,
  })).mutation(async ({ ctx, input }) => {
    const [message] = await ctx.db.select().from(arkMessages).where(and(
      eq(arkMessages.id, input.messageId),
      isNull(arkMessages.deletedAt),
    )).limit(1)
    if (!message)
      throw new ArkActionError({ code: 'NOT_FOUND', message: 'Message not found' })
    await getChannelForAccess(message.channelId, ctx, 'messages.manage')
    const [relation] = await ctx.db.insert(arkMessageRelations).values(input).returning()
    if (relation) {
      publishChatEvent({
        channelId: message.channelId,
        reason: 'related',
        type: 'messages:changed',
      })
    }
    return relation
  }),
  markRead: arkUserAction.input(z.object({ channelId: z.uuid(), messageId: z.uuid().optional() })).mutation(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx, 'messages.read')
    if (!access.arkUser)
      throw new ArkActionError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
    const [state] = await ctx.db.insert(arkUserChannelStates).values({
      arkUserId: access.arkUser.id,
      channelId: input.channelId,
      lastReadAt: new Date(),
      lastSeenMessageId: input.messageId,
      mentionCount: 0,
      unreadCount: 0,
    }).onConflictDoUpdate({
      set: {
        lastReadAt: new Date(),
        lastSeenMessageId: input.messageId,
        mentionCount: 0,
        unreadCount: 0,
        updatedAt: new Date(),
      },
      target: [arkUserChannelStates.arkUserId, arkUserChannelStates.channelId],
    }).returning()
    return state
  }),
  state: protectedAction.input(z.object({ channelId: z.uuid() })).query(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx, 'messages.read')
    if (!access.arkUser)
      return null
    const [state] = await ctx.db.select().from(arkUserChannelStates).where(and(
      eq(arkUserChannelStates.arkUserId, access.arkUser.id),
      eq(arkUserChannelStates.channelId, input.channelId),
    )).limit(1)
    return state ?? null
  }),
})

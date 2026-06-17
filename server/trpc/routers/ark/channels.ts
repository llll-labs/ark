import type { ArkUserRow } from './shared'
import {
  and,
  arkUsers,
  asc,
  baseProcedure,
  byIdSchema,
  canReadChannel,
  arkChannelCategories,
  channelCreateSchema,
  arkChannelMembers,
  arkChannels,
  createTRPCRouter,
  currentArkUser,
  desc,
  dmUpsertSchema,
  ensureDefaultChannelCategory,
  eq,
  getChannelForAccess,
  getDmSpace,
  getPublicSpace,
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
  protectedProcedure,
  publishChatEvent,
  requireSpaceAccess,
  requireVisibleArkUsers,
  slugify,
  spaceScopedListSchema,
  sql,
  TRPCError,
  arkUserChannelStates,
  withMessageDetails,
  z,
} from './shared'

const channelLookupSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
})
const uuidInput = z.uuid()

export const channelCategoriesRouter = createTRPCRouter({
  list: baseProcedure.input(spaceScopedListSchema).query(async ({ ctx, input }) => {
    await requireSpaceAccess(input.spaceId, ctx.session, 'channels.read')
    return ctx.db.select().from(arkChannelCategories).where(and(
      eq(arkChannelCategories.spaceId, input.spaceId),
      isNull(arkChannelCategories.deletedAt),
    )).orderBy(asc(arkChannelCategories.position), asc(arkChannelCategories.createdAt))
  }),
})

export const channelsRouter = createTRPCRouter({
  byId: baseProcedure.input(channelLookupSchema).query(async ({ ctx, input }) => {
    let channelId = input.id
    if (!uuidInput.safeParse(channelId).success) {
      const root = await getPublicSpace()
      const [channel] = root
        ? await ctx.db.select({ id: arkChannels.id }).from(arkChannels).where(and(
            eq(arkChannels.spaceId, root.id),
            eq(arkChannels.slug, channelId),
            isNull(arkChannels.deletedAt),
          )).limit(1)
        : []
      channelId = channel?.id ?? channelId
    }

    const access = await canReadChannel(channelId, ctx.session)
    if (!access.channel)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Channel not found' })
    if (!access.allowed)
      throw new TRPCError({ code: 'FORBIDDEN', message: access.reason ?? 'Channel access denied' })
    return access.channel
  }),
  participants: baseProcedure.input(byIdSchema).query(async ({ ctx, input }) => {
    const { channel } = await getChannelForAccess(input.id, ctx.session, 'messages.read')
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
  list: baseProcedure.input(spaceScopedListSchema).query(async ({ ctx, input }) => {
    await requireSpaceAccess(input.spaceId, ctx.session, 'channels.read')
    const rows = await ctx.db.select().from(arkChannels).where(eq(arkChannels.spaceId, input.spaceId)).orderBy(arkChannels.position, arkChannels.createdAt)
    const readable = []
    for (const channel of rows) {
      const access = await canReadChannel(channel.id, ctx.session)
      if (access.allowed)
        readable.push(channel)
    }
    return readable
  }),
  create: protectedProcedure.input(channelCreateSchema).mutation(async ({ ctx, input }) => {
    const access = await requireSpaceAccess(input.spaceId, ctx.session, 'channels.create')
    await requireVisibleArkUsers(ctx, input.memberArkUserIds)
    const arkUser = access.arkUser ?? await currentArkUser(ctx.session)
    let categoryId = input.categoryId
    if (categoryId) {
      const [category] = await ctx.db.select().from(arkChannelCategories).where(and(
        eq(arkChannelCategories.id, categoryId),
        isNull(arkChannelCategories.deletedAt),
      )).limit(1)
      if (!category || category.spaceId !== input.spaceId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Channel category must belong to the selected space.',
        })
      }
    }
    else if (input.kind === 'forum') {
      const category = await ensureDefaultChannelCategory(input.spaceId)
      categoryId = category.id
    }
    const [channel] = await ctx.db.insert(arkChannels).values({
      categoryId,
      createdByArkUserId: arkUser?.id,
      kind: input.kind,
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      spaceId: input.spaceId,
      targetId: input.targetId,
      targetType: input.targetType,
      visibility: input.visibility,
    }).returning()
    if (!channel)
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Channel could not be created' })
    if ((channel.visibility === 'private' || channel.kind === 'dm') && arkUser) {
      const memberIds = new Set([arkUser.id, ...input.memberArkUserIds])
      await ctx.db.insert(arkChannelMembers).values(Array.from(memberIds).map(arkUserId => ({
        arkUserId,
        channelId: channel.id,
        status: 'active' as const,
      }))).onConflictDoNothing()
    }
    return channel
  }),
  upsertDm: protectedProcedure.input(dmUpsertSchema).mutation(async ({ ctx, input }) => {
    const me = await currentArkUser(ctx.session)
    if (!me)
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
    const dmSpace = await getDmSpace()
    if (!dmSpace)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'DM space not found' })
    await requireVisibleArkUsers(ctx, input.memberArkUserIds)
    const memberIds = Array.from(new Set([me.id, ...input.memberArkUserIds])).sort()
    const identityKey = `dm:${memberIds.join(':')}`
    const [existing] = await ctx.db.select().from(arkChannels).where(eq(arkChannels.identityKey, identityKey)).limit(1)
    if (existing)
      return existing
    const [channel] = await ctx.db.insert(arkChannels).values({
      identityKey,
      kind: 'dm',
      name: 'Direct message',
      slug: `dm-${memberIds.map(id => id.slice(0, 8)).join('-')}`,
      spaceId: dmSpace.id,
      visibility: 'private',
    }).returning()
    if (!channel)
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DM channel could not be created' })
    await ctx.db.insert(arkChannelMembers).values(memberIds.map(arkUserId => ({
      arkUserId,
      channelId: channel.id,
      status: 'active' as const,
    }))).onConflictDoNothing()
    return channel
  }),
  upsertThreadForMessage: protectedProcedure.input(z.object({ messageId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const [message] = await ctx.db.select().from(arkMessages).where(and(
      eq(arkMessages.id, input.messageId),
      isNull(arkMessages.deletedAt),
    )).limit(1)
    if (!message)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' })

    const { access, channel: parentChannel } = await getChannelForAccess(message.channelId, ctx.session, 'messages.create')
    if (!access.arkUser)
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' })

    const identityKey = `thread:${message.id}`
    const [existing] = await ctx.db.select().from(arkChannels).where(and(
      eq(arkChannels.identityKey, identityKey),
      isNull(arkChannels.deletedAt),
    )).limit(1)
    if (existing)
      return existing

    const [thread] = await ctx.db.insert(arkChannels).values({
      createdByArkUserId: access.arkUser.id,
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
    }).onConflictDoNothing().returning()
    if (thread)
      return thread

    const [raceWinner] = await ctx.db.select().from(arkChannels).where(eq(arkChannels.identityKey, identityKey)).limit(1)
    if (!raceWinner)
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Thread channel could not be created' })
    return raceWinner
  }),
})

export const messagesRouter = createTRPCRouter({
  latest: baseProcedure.input(messagesLatestSchema).query(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx.session, 'messages.read')
    const rows = await ctx.db.select().from(arkMessages).where(and(
      eq(arkMessages.channelId, input.channelId),
      isNull(arkMessages.deletedAt),
    )).orderBy(desc(arkMessages.createdAt), desc(arkMessages.id)).limit(input.limit + 1)
    const items = rows.slice(0, input.limit).reverse()
    return messageWindow(ctx.db, items, {
      arkUserId: access.arkUser?.id,
      hasNewer: false,
      hasOlder: rows.length > input.limit,
    })
  }),
  before: baseProcedure.input(messagesBeforeSchema).query(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx.session, 'messages.read')
    const cursorDate = parseCursorDate(input.cursor)
    const rows = await ctx.db.select().from(arkMessages).where(and(
      eq(arkMessages.channelId, input.channelId),
      isNull(arkMessages.deletedAt),
      olderMessageThan(cursorDate, input.cursor.id),
    )).orderBy(desc(arkMessages.createdAt), desc(arkMessages.id)).limit(input.limit + 1)
    const items = rows.slice(0, input.limit).reverse()
    return messageWindow(ctx.db, items, {
      arkUserId: access.arkUser?.id,
      hasNewer: true,
      hasOlder: rows.length > input.limit,
    })
  }),
  after: baseProcedure.input(messagesAfterSchema).query(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx.session, 'messages.read')
    const cursorDate = parseCursorDate(input.cursor)
    const rows = await ctx.db.select().from(arkMessages).where(and(
      eq(arkMessages.channelId, input.channelId),
      isNull(arkMessages.deletedAt),
      newerMessageThan(cursorDate, input.cursor.id),
    )).orderBy(asc(arkMessages.createdAt), asc(arkMessages.id)).limit(input.limit + 1)
    const items = rows.slice(0, input.limit)
    return messageWindow(ctx.db, items, {
      arkUserId: access.arkUser?.id,
      hasNewer: rows.length > input.limit,
      hasOlder: true,
    })
  }),
  around: baseProcedure.input(messagesAroundSchema).query(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx.session, 'messages.read')
    const [target] = await ctx.db.select().from(arkMessages).where(and(
      eq(arkMessages.id, input.messageId),
      eq(arkMessages.channelId, input.channelId),
      isNull(arkMessages.deletedAt),
    )).limit(1)
    if (!target)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' })

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
      hasNewer: newerRows.length > input.after,
      hasOlder: olderRows.length > input.before,
    })
  }),
  pinned: baseProcedure.input(messagesPinnedSchema).query(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx.session, 'messages.read')
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
    const messagesWithAttachments = await withMessageDetails(ctx.db, pageRows.map(row => row.message), access.arkUser?.id)
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
  list: baseProcedure.input(messagesListSchema).query(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx.session, 'messages.read')
    const rows = await ctx.db.select().from(arkMessages).where(eq(arkMessages.channelId, input.channelId)).orderBy(desc(arkMessages.createdAt)).limit(input.limit)
    return withMessageDetails(ctx.db, rows, access.arkUser?.id)
  }),
  create: protectedProcedure.input(messageCreateSchema).mutation(async ({ ctx, input }) => {
    const { channel } = await getChannelForAccess(input.channelId, ctx.session, 'messages.create')
    const arkUser = await currentArkUser(ctx.session)
    let rootMessageId: string | null = null
    let messageRelation: { relationType: 'forum_parent' | 'reply_quote', targetId: string, targetType: 'message' } | null = null

    if (input.replyToMessageId) {
      const [target] = await ctx.db.select().from(arkMessages).where(and(
        eq(arkMessages.id, input.replyToMessageId),
        isNull(arkMessages.deletedAt),
      )).limit(1)
      if (!target || target.channelId !== channel.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Reply target must be an existing message in this channel.',
        })
      }
      messageRelation = {
        relationType: 'reply_quote',
        targetId: target.id,
        targetType: 'message',
      }
    }

    if (input.forumParentMessageId) {
      if (channel.kind !== 'forum') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Forum parent replies are only available in forum channels.',
        })
      }
      const [target] = await ctx.db.select().from(arkMessages).where(and(
        eq(arkMessages.id, input.forumParentMessageId),
        isNull(arkMessages.deletedAt),
      )).limit(1)
      if (!target || target.channelId !== channel.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Forum parent must be an existing message in this channel.',
        })
      }
      rootMessageId = target.rootMessageId ?? target.id
      messageRelation = {
        relationType: 'forum_parent',
        targetId: target.id,
        targetType: 'message',
      }
    }

    const [message] = await ctx.db.insert(arkMessages).values({
      authorArkUserId: arkUser?.id,
      body: input.body,
      bodyJson: input.bodyJson,
      channelId: channel.id,
      rootMessageId,
      spaceId: channel.spaceId,
    }).returning()
    if (message && messageRelation) {
      await ctx.db.insert(arkMessageRelations).values({
        messageId: message.id,
        ...messageRelation,
      }).onConflictDoNothing()
    }
    await ctx.db.update(arkChannels).set({
      lastMessageAt: new Date(),
      lastMessagePreview: messagePreview({ body: input.body, bodyJson: input.bodyJson }),
      messagesCount: sql`${arkChannels.messagesCount} + 1`,
      updatedAt: new Date(),
    }).where(eq(arkChannels.id, channel.id))
    if (message) {
      publishChatEvent({
        channelId: channel.id,
        reason: 'created',
        type: 'messages:changed',
      })
    }
    return message
  }),
  react: protectedProcedure.input(z.object({ emoji: z.string().min(1).max(32), messageId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const [message] = await ctx.db.select().from(arkMessages).where(eq(arkMessages.id, input.messageId)).limit(1)
    if (!message)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' })
    const { access } = await getChannelForAccess(message.channelId, ctx.session, 'messages.read')
    if (!access.arkUser)
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
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
  pin: protectedProcedure.input(z.object({ messageId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const [message] = await ctx.db.select().from(arkMessages).where(eq(arkMessages.id, input.messageId)).limit(1)
    if (!message)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' })
    const { access, channel } = await getChannelForAccess(message.channelId, ctx.session, 'messages.manage')
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
  relate: protectedProcedure.input(z.object({
    messageId: z.uuid(),
    relationType: messageRelationKindSchema,
    targetId: z.uuid().optional(),
    targetType: messageRelationTargetTypeSchema,
  })).mutation(async ({ ctx, input }) => {
    const [message] = await ctx.db.select().from(arkMessages).where(eq(arkMessages.id, input.messageId)).limit(1)
    if (!message)
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Message not found' })
    await getChannelForAccess(message.channelId, ctx.session, 'messages.manage')
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
  markRead: protectedProcedure.input(z.object({ channelId: z.uuid(), messageId: z.uuid().optional() })).mutation(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx.session, 'messages.read')
    if (!access.arkUser)
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
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
  state: protectedProcedure.input(z.object({ channelId: z.uuid() })).query(async ({ ctx, input }) => {
    const { access } = await getChannelForAccess(input.channelId, ctx.session, 'messages.read')
    if (!access.arkUser)
      return null
    const [state] = await ctx.db.select().from(arkUserChannelStates).where(and(
      eq(arkUserChannelStates.arkUserId, access.arkUser.id),
      eq(arkUserChannelStates.channelId, input.channelId),
    )).limit(1)
    return state ?? null
  }),
})

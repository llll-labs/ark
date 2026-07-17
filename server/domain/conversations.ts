import type { ArkResourceAccountability, ArkResourceServices } from '../resources/types'
import type { arkChannels, arkMessages } from '../../db/schema'
import {
  arkChannelCategories,
  arkChannelMembers,
  arkChannels as arkChannelsTable,
  arkMessageRelations,
  arkMessages as arkMessagesTable,
} from '../../db/schema'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { registerCoreArkResources } from '../resources/core'
import { withArkResourceTransaction } from '../resources/service'
import { publishChatEvent } from '../utils/realtime'

type ChannelRow = typeof arkChannels.$inferSelect
type MessageRow = typeof arkMessages.$inferSelect
type ChannelKind = ChannelRow['kind']
type ChannelVisibility = ChannelRow['visibility']
type MessageKind = MessageRow['kind']
type MessageRelation = Pick<typeof arkMessageRelations.$inferInsert, 'relationType' | 'targetCollectionKey' | 'targetId' | 'targetRecordId' | 'targetType'>

export interface ArkConversationChannelInput {
  categoryId?: null | string
  configJson?: Record<string, unknown>
  createdByArkUserId?: null | string
  identityKey?: null | string
  kind?: ChannelKind
  memberArkUserIds?: string[]
  name: string
  slug: string
  spaceId: string
  targetId?: null | string
  targetType?: null | string
  threadParentChannelId?: null | string
  threadRootMessageId?: null | string
  topic?: null | string
  visibility?: ChannelVisibility
}

export interface ArkConversationCategoryInput {
  configJson?: Record<string, unknown>
  description?: null | string
  name: string
  position?: number
  slug: string
  spaceId: string
}

export interface ArkConversationMessageInput {
  authorArkUserId?: null | string
  body?: null | string
  bodyJson?: Record<string, unknown>
  channelId: string
  kind?: MessageKind
  relations?: MessageRelation[]
  spaceId: string
}

export interface ArkConversationService {
  createChannel: (input: ArkConversationChannelInput) => Promise<ChannelRow>
  createMessage: (input: ArkConversationMessageInput) => Promise<MessageRow>
  ensureCategory: (input: ArkConversationCategoryInput) => Promise<typeof arkChannelCategories.$inferSelect>
  ensureMembers: (channelId: string, arkUserIds: string[]) => Promise<void>
  touchChannel: (input: { channelId: string, preview?: null | string }) => Promise<ChannelRow>
}

interface ConversationImplementationOptions {
  changedChannels: Set<string>
  database: any
  services: ArkResourceServices
}

function conversationImplementation(options: ConversationImplementationOptions): ArkConversationService {
  const { changedChannels, database, services } = options

  async function ensureMembers(channelId: string, arkUserIds: string[]) {
    const uniqueIds = [...new Set(arkUserIds.filter(Boolean))]
    if (!uniqueIds.length)
      return
    await database.insert(arkChannelMembers).values(uniqueIds.map(arkUserId => ({
      arkUserId,
      channelId,
      status: 'active' as const,
    }))).onConflictDoNothing()
  }

  async function createChannel(input: ArkConversationChannelInput) {
    if (input.identityKey) {
      const [existing] = await database.select().from(arkChannelsTable).where(and(
        eq(arkChannelsTable.identityKey, input.identityKey),
        isNull(arkChannelsTable.deletedAt),
      )).limit(1)
      if (existing) {
        await ensureMembers(existing.id, input.memberArkUserIds ?? [])
        return existing
      }
    }

    const channel = await services.resource('ark.channels').create({
      categoryId: input.categoryId,
      configJson: input.configJson ?? {},
      createdByArkUserId: input.createdByArkUserId,
      identityKey: input.identityKey,
      kind: input.kind ?? 'chat',
      name: input.name,
      slug: input.slug,
      spaceId: input.spaceId,
      targetId: input.targetId,
      targetType: input.targetType,
      threadParentChannelId: input.threadParentChannelId,
      threadRootMessageId: input.threadRootMessageId,
      topic: input.topic,
      visibility: input.visibility ?? 'space',
    }) as ChannelRow
    await ensureMembers(channel.id, input.memberArkUserIds ?? [])
    return channel
  }

  async function ensureCategory(input: ArkConversationCategoryInput) {
    const [existing] = await database.select().from(arkChannelCategories).where(and(
      eq(arkChannelCategories.spaceId, input.spaceId),
      eq(arkChannelCategories.slug, input.slug),
      isNull(arkChannelCategories.deletedAt),
    )).limit(1)
    if (existing)
      return existing

    try {
      return await services.resource('ark.channel_categories').create({
        configJson: input.configJson ?? {},
        description: input.description,
        name: input.name,
        position: input.position ?? 0,
        slug: input.slug,
        spaceId: input.spaceId,
      }) as typeof arkChannelCategories.$inferSelect
    }
    catch (error) {
      const [raceWinner] = await database.select().from(arkChannelCategories).where(and(
        eq(arkChannelCategories.spaceId, input.spaceId),
        eq(arkChannelCategories.slug, input.slug),
        isNull(arkChannelCategories.deletedAt),
      )).limit(1)
      if (!raceWinner)
        throw error
      return raceWinner
    }
  }

  async function createMessage(input: ArkConversationMessageInput) {
    const [channel] = await database.select({ id: arkChannelsTable.id, spaceId: arkChannelsTable.spaceId })
      .from(arkChannelsTable)
      .where(and(eq(arkChannelsTable.id, input.channelId), isNull(arkChannelsTable.deletedAt)))
      .limit(1)
    if (!channel || channel.spaceId !== input.spaceId)
      throw new Error('Message channel does not belong to the requested Ark space.')

    let rootMessageId: null | string = null
    const relations = input.relations ?? []
    const forumParent = relations.find(relation => relation.relationType === 'forum_parent' && relation.targetType === 'message' && relation.targetId)
    if (forumParent?.targetId) {
      const [parent] = await database.select({
        channelId: arkMessagesTable.channelId,
        id: arkMessagesTable.id,
        rootMessageId: arkMessagesTable.rootMessageId,
      }).from(arkMessagesTable).where(and(
        eq(arkMessagesTable.id, forumParent.targetId),
        isNull(arkMessagesTable.deletedAt),
      )).limit(1)
      if (!parent || parent.channelId !== input.channelId)
        throw new Error('Forum parent must be an existing message in the same channel.')
      rootMessageId = parent.rootMessageId ?? parent.id
    }

    const message = await services.resource('ark.messages').create({
      authorArkUserId: input.authorArkUserId,
      body: input.body,
      bodyJson: input.bodyJson ?? {},
      channelId: input.channelId,
      kind: input.kind ?? 'message',
      rootMessageId,
      spaceId: input.spaceId,
    }) as MessageRow

    if (relations.length) {
      await database.insert(arkMessageRelations).values(relations.map(relation => ({
        messageId: message.id,
        ...relation,
      }))).onConflictDoNothing()
    }

    const preview = String(message.body ?? '').slice(0, 180)
    await services.resource('ark.channels').update(input.channelId, {
      lastMessageAt: new Date(),
      lastMessagePreview: preview,
      messagesCount: sql`${arkChannelsTable.messagesCount} + 1`,
      updatedAt: new Date(),
    })
    changedChannels.add(input.channelId)
    return message
  }

  async function touchChannel(input: { channelId: string, preview?: null | string }) {
    const updated = await services.resource('ark.channels').update(input.channelId, {
      ...(input.preview !== undefined ? { lastMessagePreview: input.preview } : {}),
      updatedAt: new Date(),
    }) as ChannelRow
    changedChannels.add(input.channelId)
    return updated
  }

  return { createChannel, createMessage, ensureCategory, ensureMembers, touchChannel }
}

export async function withArkConversationTransaction<T>(
  options: { accountability: ArkResourceAccountability, database: any },
  handler: (context: { conversations: ArkConversationService, database: any, services: ArkResourceServices }) => Promise<T>,
) {
  registerCoreArkResources()
  const changedChannels = new Set<string>()
  const result = await withArkResourceTransaction({
    accountability: options.accountability,
    authorization: 'domain',
    database: options.database,
  }, async ({ database, services }) => handler({
    conversations: conversationImplementation({ changedChannels, database, services }),
    database,
    services,
  }))
  for (const channelId of changedChannels)
    publishChatEvent({ channelId, reason: 'created', type: 'messages:changed' })
  return result
}

export function createArkConversationService(options: { accountability: ArkResourceAccountability, database: any }): ArkConversationService {
  return {
    createChannel: input => withArkConversationTransaction(options, ({ conversations }) => conversations.createChannel(input)),
    createMessage: input => withArkConversationTransaction(options, ({ conversations }) => conversations.createMessage(input)),
    ensureCategory: input => withArkConversationTransaction(options, ({ conversations }) => conversations.ensureCategory(input)),
    ensureMembers: (channelId, arkUserIds) => withArkConversationTransaction(options, ({ conversations }) => conversations.ensureMembers(channelId, arkUserIds)),
    touchChannel: input => withArkConversationTransaction(options, ({ conversations }) => conversations.touchChannel(input)),
  }
}

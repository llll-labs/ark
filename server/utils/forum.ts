import type { arkChannelCategories, arkChannels } from '../../db/schema'
import {
  arkMessageRelations,
  arkMessages,
  arkUsers,
} from '../../db/schema'
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { withArkConversationTransaction } from '../domain/conversations'
import { useDatabase } from './db'

type ArkForumChannel = typeof arkChannels.$inferSelect
type ArkForumCategory = Pick<typeof arkChannelCategories.$inferSelect, 'id' | 'name' | 'slug'>
type ArkForumMessageRow = {
  authorAvatarFileId: null | string
  authorDisplayName: null | string
  authorHandle: null | string
  body: null | string
  bodyJson: Record<string, unknown>
  createdAt: Date
  id: string
  rootMessageId: null | string
}
type ArkForumParentRow = {
  authorDisplayName: null | string
  authorHandle: null | string
  body: null | string
  id: string
}
type ArkForumRelationRow = {
  messageId: string
  targetId: null | string
}
type ArkForumChildRelationRow = {
  targetId: null | string
}

export interface ArkForumMessageInput {
  arkUserId: string
  body: string
  bodyJson?: Record<string, unknown>
  channelId: string
  db?: any
  parentMessageId?: null | string
  richTextJson?: unknown
  spaceId: string
}

export interface ArkForumTopicPayloadInput {
  category?: ArkForumCategory | null
  channel: ArkForumChannel
  db?: any
  limit?: number
  participantName?: string
  title?: string
}

export interface ArkForumTopicListItem {
  category: ArkForumCategory | null
  categoryName?: null | string
  createdAt: Date
  lastActivityAt: Date
  lastMessageAt: Date | null
  lastMessagePreview: null | string
  messagesCount: number
  repliesCount: number
  slug: string
  targetHref: string
  targetKind: string
  title: string
  updatedAt: Date
}

export interface ArkForumCategoryListItem extends ArkForumCategory {
  count: number
  lastActivityAt: Date | null
  latestTopic: null | { href: string, title: string }
  messagesCount: number
  topicsCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function arkForumRichTextJson(value: unknown) {
  if (!isRecord(value) || value.type !== 'doc' || !Array.isArray(value.content))
    return null
  return value
}

export function arkForumRichTextPlainText(value: unknown): string {
  const parts: string[] = []
  function visit(node: unknown) {
    if (!isRecord(node))
      return
    if (typeof node.text === 'string')
      parts.push(node.text)
    const content = Array.isArray(node.content) ? node.content : []
    for (const child of content)
      visit(child)
    if (['blockquote', 'bulletList', 'heading', 'listItem', 'orderedList', 'paragraph'].includes(String(node.type ?? '')))
      parts.push('\n')
  }
  visit(value)
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}

export function arkForumBodyJson(richTextJson: unknown) {
  const safeRichTextJson = arkForumRichTextJson(richTextJson)
  return {
    publicForum: true,
    ...(safeRichTextJson ? { richTextJson: safeRichTextJson } : {}),
  }
}

export function arkForumRichTextFromBodyJson(bodyJson: unknown) {
  return isRecord(bodyJson) ? arkForumRichTextJson(bodyJson.richTextJson) : null
}

export function arkForumAvatarUrl(fileId: null | string | undefined) {
  return fileId ? `/api/ark/files/${fileId}?variant=thumb` : null
}

export function arkForumTopicTitle(channel: ArkForumChannel) {
  if (channel.kind === 'job_discussion')
    return channel.name
  return channel.topic || channel.name
}

export function arkForumTopicActivityAt(channel: Pick<ArkForumChannel, 'createdAt' | 'lastMessageAt' | 'updatedAt'>) {
  return channel.lastMessageAt ?? channel.updatedAt ?? channel.createdAt
}

export function arkForumMessageBody(input: { body: string, richTextJson?: unknown }) {
  const richTextJson = arkForumRichTextJson(input.richTextJson)
  const body = (input.body.trim() || arkForumRichTextPlainText(richTextJson)).slice(0, 8000).trim()
  return {
    body,
    bodyJson: arkForumBodyJson(richTextJson),
    richTextJson,
  }
}

export function arkForumTopicListItem(input: {
  category?: ArkForumCategory | null
  channel: ArkForumChannel
  targetHref?: string
  targetKind?: string
  title?: string
}): ArkForumTopicListItem {
  const category = input.category ?? null
  const channel = input.channel
  return {
    category,
    categoryName: category?.name ?? null,
    createdAt: channel.createdAt,
    lastActivityAt: arkForumTopicActivityAt(channel),
    lastMessageAt: channel.lastMessageAt,
    lastMessagePreview: channel.lastMessagePreview,
    messagesCount: channel.messagesCount,
    repliesCount: Math.max(Number(channel.messagesCount ?? 0) - 1, 0),
    slug: channel.slug,
    targetHref: input.targetHref ?? `/forum/${channel.slug}`,
    targetKind: input.targetKind ?? 'forum',
    title: input.title ?? arkForumTopicTitle(channel),
    updatedAt: channel.updatedAt,
  }
}

export function arkForumCategoriesWithStats(categories: ArkForumCategory[], topics: ArkForumTopicListItem[]): ArkForumCategoryListItem[] {
  const statsByCategoryId = new Map<string, {
    count: number
    lastActivityAt: Date | null
    latestTopic: null | { href: string, title: string }
    messagesCount: number
  }>()
  for (const topic of topics) {
    const categoryId = topic.category?.id
    if (!categoryId)
      continue
    const current = statsByCategoryId.get(categoryId) ?? {
      count: 0,
      lastActivityAt: null,
      latestTopic: null,
      messagesCount: 0,
    }
    const activityAt = topic.lastActivityAt ? new Date(topic.lastActivityAt) : null
    const isNewLatest = activityAt && (!current.lastActivityAt || activityAt > current.lastActivityAt)
    statsByCategoryId.set(categoryId, {
      count: current.count + 1,
      lastActivityAt: isNewLatest ? activityAt : current.lastActivityAt,
      latestTopic: isNewLatest ? { href: topic.targetHref, title: topic.title } : current.latestTopic,
      messagesCount: current.messagesCount + Number(topic.messagesCount ?? 0),
    })
  }

  return categories.map((category) => {
    const stats = statsByCategoryId.get(category.id)
    return {
      count: stats?.count ?? 0,
      id: category.id,
      lastActivityAt: stats?.lastActivityAt ?? null,
      latestTopic: stats?.latestTopic ?? null,
      messagesCount: stats?.messagesCount ?? 0,
      name: category.name,
      slug: category.slug,
      topicsCount: stats?.count ?? 0,
    }
  })
}

export async function arkForumTopicPayload(input: ArkForumTopicPayloadInput) {
  const db = input.db ?? useDatabase()
  const limit = input.limit ?? 50
  const participantName = input.participantName ?? 'Member'
  const channel = input.channel

  const rows = await db.select({
    authorAvatarFileId: arkUsers.avatarFileId,
    authorDisplayName: arkUsers.displayName,
    authorHandle: arkUsers.handle,
    body: arkMessages.body,
    bodyJson: arkMessages.bodyJson,
    createdAt: arkMessages.createdAt,
    id: arkMessages.id,
    rootMessageId: arkMessages.rootMessageId,
  })
    .from(arkMessages)
    .leftJoin(arkUsers, eq(arkUsers.id, arkMessages.authorArkUserId))
    .where(and(
      eq(arkMessages.channelId, channel.id),
      isNull(arkMessages.deletedAt),
      ne(arkMessages.kind, 'system'),
    ))
    .orderBy(desc(arkMessages.createdAt))
    .limit(limit)
  const messageRows = (rows as ArkForumMessageRow[]).reverse()
  const messageIds = messageRows.map((row: ArkForumMessageRow) => row.id)
  const relationRows = messageIds.length
    ? await db.select({
        messageId: arkMessageRelations.messageId,
        targetId: arkMessageRelations.targetId,
      })
        .from(arkMessageRelations)
        .where(and(
          eq(arkMessageRelations.relationType, 'forum_parent'),
          eq(arkMessageRelations.targetType, 'message'),
          inArray(arkMessageRelations.messageId, messageIds),
          isNull(arkMessageRelations.deletedAt),
        ))
    : []
  const childRelationRows = messageIds.length
    ? await db.select({
        targetId: arkMessageRelations.targetId,
      })
        .from(arkMessageRelations)
        .where(and(
          eq(arkMessageRelations.relationType, 'forum_parent'),
          eq(arkMessageRelations.targetType, 'message'),
          inArray(arkMessageRelations.targetId, messageIds),
          isNull(arkMessageRelations.deletedAt),
        ))
    : []
  const typedRelationRows = relationRows as ArkForumRelationRow[]
  const typedChildRelationRows = childRelationRows as ArkForumChildRelationRow[]
  const parentIds = [...new Set(typedRelationRows.map((row: ArkForumRelationRow) => row.targetId).filter((id: null | string): id is string => Boolean(id)))]
  const parentRows = parentIds.length
    ? await db.select({
        authorDisplayName: arkUsers.displayName,
        authorHandle: arkUsers.handle,
        body: arkMessages.body,
        id: arkMessages.id,
      })
        .from(arkMessages)
        .leftJoin(arkUsers, eq(arkUsers.id, arkMessages.authorArkUserId))
        .where(and(
          inArray(arkMessages.id, parentIds),
          isNull(arkMessages.deletedAt),
        ))
    : []
  const typedParentRows = parentRows as ArkForumParentRow[]
  const relationByMessageId = new Map(typedRelationRows.map((row: ArkForumRelationRow) => [row.messageId, row.targetId]))
  const parentById = new Map(typedParentRows.map((row: ArkForumParentRow) => [row.id, row]))
  const childCountByMessageId = new Map<string, number>()
  for (const row of typedChildRelationRows) {
    if (row.targetId)
      childCountByMessageId.set(row.targetId, (childCountByMessageId.get(row.targetId) ?? 0) + 1)
  }

  return {
    messages: messageRows.map((row) => {
      const parentId = relationByMessageId.get(row.id) ?? null
      const parent = parentId ? parentById.get(parentId) : null
      return {
        author: {
          avatarUrl: arkForumAvatarUrl(row.authorAvatarFileId),
          displayName: row.authorDisplayName || row.authorHandle || participantName,
          handle: row.authorHandle,
        },
        body: row.body,
        childRepliesCount: childCountByMessageId.get(row.id) ?? 0,
        createdAt: row.createdAt,
        id: row.id,
        parent: parent
          ? {
              authorName: parent.authorDisplayName || parent.authorHandle || participantName,
              bodyPreview: String(parent.body ?? '').slice(0, 180),
              id: parent.id,
            }
          : null,
        parentMessageId: parentId,
        richTextJson: arkForumRichTextFromBodyJson(row.bodyJson),
        rootMessageId: row.rootMessageId,
      }
    }),
    topic: {
      category: input.category ?? null,
      categoryId: input.category?.id ?? null,
      createdAt: channel.createdAt,
      lastActivityAt: arkForumTopicActivityAt(channel),
      lastMessageAt: channel.lastMessageAt,
      lastMessagePreview: channel.lastMessagePreview,
      messagesCount: channel.messagesCount,
      repliesCount: Math.max(Number(channel.messagesCount ?? 0) - 1, 0),
      slug: channel.slug,
      title: input.title ?? arkForumTopicTitle(channel),
      updatedAt: channel.updatedAt,
    },
  }
}

export async function createArkForumMessage(input: ArkForumMessageInput) {
  const db = input.db ?? useDatabase()
  const body = input.body.trim()
  if (!body)
    return null

  return withArkConversationTransaction({
    accountability: {
      arkUserId: input.arkUserId,
      capabilities: [],
      spaceId: input.spaceId,
      system: false,
      userId: null,
    },
    database: db,
  }, async ({ conversations }) => conversations.createMessage({
      authorArkUserId: input.arkUserId,
      body,
      bodyJson: input.bodyJson ?? arkForumBodyJson(input.richTextJson),
      channelId: input.channelId,
      relations: input.parentMessageId
        ? [{ relationType: 'forum_parent', targetId: input.parentMessageId, targetType: 'message' }]
        : [],
      spaceId: input.spaceId,
    }))
}

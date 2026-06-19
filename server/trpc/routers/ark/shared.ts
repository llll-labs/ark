import type {
  arkMarketJobs,
} from '../../../../db/schema'
import type { ArkCapability, ArkCapabilityLike } from '../../../../db/zod'
import type { RequestAuthContext } from '../../../utils/authorization'
import { TRPCError } from '@trpc/server'
import { and, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm'
import { z } from 'zod/v4'
import {
  arkFiles,
  arkUsers,
  arkChannelMembers,
  arkChannels,
  marketJobCategories,
  marketJobTags,
  marketStoreCategories,
  arkMarketStores,
  marketStoreSkills,
  marketStoreStyles,
  marketStoreTags,
  marketStoreTools,
  arkMemberships,
  arkMessagePins,
  arkMessageReactions,
  arkMessageRelations,
  arkMessages,
  arkSpaces,
} from '../../../../db/schema'

import {
  canReadChannel,
  currentArkUser,
  getEffectiveCapabilities,
  getPublicSpace,
} from '../../../utils/authorization'

type AuthCapableContext = { auth?: RequestAuthContext, db: any, session: any }

function resolveSession(subject: any) {
  return subject?.session ?? subject
}

function resolveRequestAuth(subject: any) {
  return subject?.auth as RequestAuthContext | undefined
}

// Re-export the shared surface so domain router files import everything from
// `./shared` instead of reaching back across the tree for tables, zod schemas,
// drizzle operators, auth utils, and tRPC procedures.
export type { ArkCapability, ArkCapabilityLike }
export {
  arkSettings,
  arkUsers,
  arkAuthAccounts,
  arkChannelCategories,
  arkChannelMembers,
  arkChannels,
  arkCollections,
  arkFields,
  arkFiles,
  arkGrants,
  arkItems,
  arkMarketCategories,
  marketJobCategories,
  arkMarketJobs,
  marketJobTags,
  arkMarketSkills,
  marketStoreCategories,
  arkMarketStores,
  marketStoreSkills,
  marketStoreStyles,
  marketStoreTags,
  marketStoreTools,
  arkMarketStyles,
  arkMarketTags,
  arkMarketTools,
  arkMembershipRoles,
  arkMemberships,
  arkMessagePins,
  arkMessageReactions,
  arkMessageRelations,
  arkMessages,
  arkPages,
  arkRoles,
  arkSpaces,
  arkUserChannelStates,
  arkUserSettings,
} from '../../../../db/schema'
export {
  byIdSchema,
  channelCreateSchema,
  collectionCreateSchema,
  dmUpsertSchema,
  emptyListSchema,
  fieldCreateSchema,
  grantCreateSchema,
  itemCreateSchema,
  jsonRecordSchema,
  marketJobCurationSchema,
  marketJobUpsertSchema,
  marketStoreListSchema,
  marketStoreUpsertSchema,
  memberUpsertSchema,
  messageCreateSchema,
  messageRelationKindSchema,
  messageRelationTargetTypeSchema,
  messagesAfterSchema,
  messagesAroundSchema,
  messagesBeforeSchema,
  messagesLatestSchema,
  messagesListSchema,
  messagesPinnedSchema,
  pageCreateSchema,
  settingsUpdateSchema,
  spaceCreateSchema,
  spaceListSchema,
  spaceScopedListSchema,
  userProfileUpdateSchema,
  userSettingsUpdateSchema,
} from '../../../../db/zod'
export { loadArkUserExtension } from '../../../utils/app-extensions'
export {
  canReadChannel,
  currentArkUser,
  defaultArkIdentity,
  defaultArkSettingsValues,
  ensureDefaultArk,
  ensureDefaultChannelCategory,
  getDefaultArk,
  getDmSpace,
  getEffectiveCapabilities,
  getPublicSpace,
  virtualArk,
} from '../../../utils/authorization'
export { publishChatEvent } from '../../../utils/realtime'
export { baseProcedure, createTRPCRouter, protectedProcedure } from '../../init'
export { TRPCError } from '@trpc/server'
export { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm'
export { z } from 'zod/v4'

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'item'
}

export interface MessageCursor {
  createdAt: string
  id: string
}

export type MessageRow = typeof arkMessages.$inferSelect
export type ChannelRow = typeof arkChannels.$inferSelect
export type FileRow = typeof arkFiles.$inferSelect
export type ArkUserRow = typeof arkUsers.$inferSelect
export type MessageRelationRow = typeof arkMessageRelations.$inferSelect
export type MessageReactionRow = typeof arkMessageReactions.$inferSelect

export function messageCursor(message: Pick<MessageRow, 'createdAt' | 'id'>): MessageCursor {
  return {
    createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : new Date(message.createdAt).toISOString(),
    id: message.id,
  }
}

export function parseCursorDate(cursor: MessageCursor) {
  const date = new Date(cursor.createdAt)
  if (Number.isNaN(date.getTime())) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid message cursor.',
    })
  }
  return date
}

export function olderMessageThan(createdAt: Date, id: string) {
  return or(
    lt(arkMessages.createdAt, createdAt),
    and(eq(arkMessages.createdAt, createdAt), lt(arkMessages.id, id)),
  )
}

export function newerMessageThan(createdAt: Date, id: string) {
  return or(
    gt(arkMessages.createdAt, createdAt),
    and(eq(arkMessages.createdAt, createdAt), gt(arkMessages.id, id)),
  )
}

export function olderPinThan(createdAt: Date, id: string) {
  return or(
    lt(arkMessagePins.createdAt, createdAt),
    and(eq(arkMessagePins.createdAt, createdAt), lt(arkMessagePins.id, id)),
  )
}

export function attachmentFileIdsFromMessage(message: Pick<MessageRow, 'bodyJson'>) {
  const ids = message.bodyJson?.attachmentFileIds
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
}

export async function messageReactionSummaries(db: any, messageIds: string[], arkUserId?: string) {
  if (!messageIds.length)
    return new Map<string, Array<{ count: number, emoji: string, reacted: boolean }>>()

  const rows = await db.select().from(arkMessageReactions).where(and(
    inArray(arkMessageReactions.messageId, messageIds),
    isNull(arkMessageReactions.deletedAt),
  ))
  const grouped = new Map<string, Map<string, { count: number, emoji: string, reacted: boolean }>>()

  for (const row of rows as MessageReactionRow[]) {
    const byEmoji = grouped.get(row.messageId) ?? new Map<string, { count: number, emoji: string, reacted: boolean }>()
    const summary = byEmoji.get(row.emoji) ?? { count: 0, emoji: row.emoji, reacted: false }
    summary.count += 1
    summary.reacted ||= row.arkUserId === arkUserId
    byEmoji.set(row.emoji, summary)
    grouped.set(row.messageId, byEmoji)
  }

  return new Map(Array.from(grouped.entries()).map(([messageId, byEmoji]) => [
    messageId,
    Array.from(byEmoji.values()).sort((left, right) => right.count - left.count || left.emoji.localeCompare(right.emoji)),
  ]))
}

export function messagePreview(message: Pick<MessageRow, 'body' | 'bodyJson'>) {
  const body = typeof message.body === 'string' ? message.body.trim() : ''
  if (body)
    return body.slice(0, 180)
  const attachmentIds = attachmentFileIdsFromMessage(message)
  if (attachmentIds.length)
    return attachmentIds.length === 1 ? 'Attachment' : `${attachmentIds.length} attachments`
  return 'Message'
}

export async function withMessageDetails(db: any, items: MessageRow[], arkUserId?: string) {
  const messageIds = items.map(item => item.id)
  const ids = [...new Set(items.flatMap(attachmentFileIdsFromMessage))]
  const authorIds = [...new Set(items.map(item => item.authorArkUserId).filter((id): id is string => Boolean(id)))]
  const reactionsByMessageId = await messageReactionSummaries(db, messageIds, arkUserId)
  const relationRows = messageIds.length
    ? await db.select().from(arkMessageRelations).where(and(
        inArray(arkMessageRelations.messageId, messageIds),
        isNull(arkMessageRelations.deletedAt),
      ))
    : []
  const threadRows = messageIds.length
    ? await db.select().from(arkChannels).where(and(
        inArray(arkChannels.threadRootMessageId, messageIds),
        isNull(arkChannels.deletedAt),
      ))
    : []
  const childRelationRows = messageIds.length
    ? await db.select().from(arkMessageRelations).where(and(
        eq(arkMessageRelations.relationType, 'forum_parent'),
        eq(arkMessageRelations.targetType, 'message'),
        inArray(arkMessageRelations.targetId, messageIds),
        isNull(arkMessageRelations.deletedAt),
      ))
    : []

  const fileRows = ids.length
    ? await db.select().from(arkFiles).where(and(
        inArray(arkFiles.id, ids),
        isNull(arkFiles.deletedAt),
      ))
    : []
  const authorRows = authorIds.length
    ? await db.select({
        avatarFileId: arkUsers.avatarFileId,
        displayName: arkUsers.displayName,
        handle: arkUsers.handle,
        id: arkUsers.id,
        kind: arkUsers.kind,
      }).from(arkUsers).where(and(
        inArray(arkUsers.id, authorIds),
        isNull(arkUsers.deletedAt),
      ))
    : []
  const byId = new Map<string, FileRow>(fileRows.map((file: FileRow) => [file.id, file]))
  const authorById = new Map<string, Pick<ArkUserRow, 'avatarFileId' | 'displayName' | 'handle' | 'id' | 'kind'>>(
    authorRows.map((author: Pick<ArkUserRow, 'avatarFileId' | 'displayName' | 'handle' | 'id' | 'kind'>) => [author.id, author]),
  )
  const relationsByMessageId = new Map<string, MessageRelationRow[]>()
  for (const relation of relationRows as MessageRelationRow[]) {
    const existing = relationsByMessageId.get(relation.messageId) ?? []
    existing.push(relation)
    relationsByMessageId.set(relation.messageId, existing)
  }

  const replyTargetIds = [...new Set((relationRows as MessageRelationRow[])
    .filter(relation => relation.relationType === 'reply_quote' && relation.targetType === 'message' && relation.targetId)
    .map(relation => relation.targetId!))]
  const replyTargets = replyTargetIds.length
    ? await db.select().from(arkMessages).where(and(
        inArray(arkMessages.id, replyTargetIds),
        isNull(arkMessages.deletedAt),
      ))
    : []
  const replyTargetById = new Map<string, MessageRow>((replyTargets as MessageRow[]).map(message => [message.id, message]))
  const threadByRootMessageId = new Map<string, ChannelRow>((threadRows as ChannelRow[]).map(channel => [channel.threadRootMessageId!, channel]))
  const forumChildCounts = new Map<string, number>()
  for (const relation of childRelationRows as MessageRelationRow[])
    forumChildCounts.set(relation.targetId!, (forumChildCounts.get(relation.targetId!) ?? 0) + 1)

  return items.map(item => ({
    ...item,
    attachments: attachmentFileIdsFromMessage(item).map(id => byId.get(id)).filter((file): file is FileRow => Boolean(file)),
    author: item.authorArkUserId ? authorById.get(item.authorArkUserId) ?? null : null,
    forumChildCount: forumChildCounts.get(item.id) ?? 0,
    forumParentId: relationsByMessageId.get(item.id)?.find(relation => relation.relationType === 'forum_parent' && relation.targetType === 'message')?.targetId ?? null,
    reactions: reactionsByMessageId.get(item.id) ?? [],
    replyTo: (() => {
      const relation = relationsByMessageId.get(item.id)?.find(relation => relation.relationType === 'reply_quote' && relation.targetType === 'message')
      const target = relation?.targetId ? replyTargetById.get(relation.targetId) : null
      return target
        ? {
            authorArkUserId: target.authorArkUserId,
            body: messagePreview(target),
            channelId: target.channelId,
            createdAt: target.createdAt,
            id: target.id,
          }
        : null
    })(),
    threadChannel: (() => {
      const thread = threadByRootMessageId.get(item.id)
      return thread
        ? {
            id: thread.id,
            messagesCount: thread.messagesCount,
            name: thread.name,
            parentChannelId: thread.threadParentChannelId,
          }
        : null
    })(),
  }))
}

export async function messageWindow(db: any, items: MessageRow[], input: { anchorMessageId?: string, arkUserId?: string, hasNewer: boolean, hasOlder: boolean }) {
  return {
    anchorMessageId: input.anchorMessageId,
    hasNewer: input.hasNewer,
    hasOlder: input.hasOlder,
    items: await withMessageDetails(db, items, input.arkUserId),
    newerCursor: items.length ? messageCursor(items[items.length - 1]!) : null,
    olderCursor: items.length ? messageCursor(items[0]!) : null,
  }
}

export function requireCapability(capabilities: string[], capability: ArkCapabilityLike) {
  if (!capabilities.includes(capability)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Missing capability: ${capability}`,
    })
  }
}

export async function requireSpaceAccess(spaceId: string, sessionOrCtx: any, capability: ArkCapabilityLike) {
  const requestAuth = resolveRequestAuth(sessionOrCtx)
  const access = requestAuth
    ? await requestAuth.capabilitiesFor(spaceId)
    : await getEffectiveCapabilities(spaceId, resolveSession(sessionOrCtx))
  requireCapability(access.capabilities, capability)
  return access
}

export async function visibleArkUserIds(ctx: AuthCapableContext) {
  const arkUser = ctx.auth ? await ctx.auth.arkUser() : await currentArkUser(ctx.session)
  if (!arkUser)
    return []

  const root = ctx.auth ? await ctx.auth.publicSpace() : await getPublicSpace()
  if (root) {
    const access = ctx.auth ? await ctx.auth.capabilitiesFor(root.id) : await getEffectiveCapabilities(root.id, ctx.session)
    if (access.capabilities.includes('members.manage'))
      return null
  }

  const visible = new Set<string>([arkUser.id])
  const activeMemberships = await ctx.db.select().from(arkMemberships).where(and(
    eq(arkMemberships.arkUserId, arkUser.id),
    eq(arkMemberships.status, 'active'),
  ))
  if (activeMemberships.length) {
    const sharedMemberships = await ctx.db.select().from(arkMemberships).where(and(
      eq(arkMemberships.status, 'active'),
      inArray(arkMemberships.scopeId, activeMemberships.map((row: { scopeId: string }) => row.scopeId)),
    ))
    for (const row of sharedMemberships)
      visible.add(row.arkUserId)
  }

  const ownChannelMemberships = await ctx.db.select().from(arkChannelMembers).where(and(
    eq(arkChannelMembers.arkUserId, arkUser.id),
    eq(arkChannelMembers.status, 'active'),
  ))
  if (ownChannelMemberships.length) {
    const sharedChannelMemberships = await ctx.db.select().from(arkChannelMembers).where(and(
      eq(arkChannelMembers.status, 'active'),
      inArray(arkChannelMembers.channelId, ownChannelMemberships.map((row: { channelId: string }) => row.channelId)),
    ))
    for (const row of sharedChannelMemberships)
      visible.add(row.arkUserId)
  }

  const listedStores = await ctx.db.select({ ownerSpaceId: arkMarketStores.ownerSpaceId }).from(arkMarketStores).where(eq(arkMarketStores.status, 'active'))
  const listedSpaceIds = listedStores.map((row: { ownerSpaceId: string | null }) => row.ownerSpaceId).filter((id: string | null): id is string => Boolean(id))
  if (listedSpaceIds.length) {
    const ownerRows = await ctx.db.select({ ownerArkUserId: arkSpaces.ownerArkUserId }).from(arkSpaces).where(inArray(arkSpaces.id, listedSpaceIds))
    for (const row of ownerRows) {
      if (row.ownerArkUserId)
        visible.add(row.ownerArkUserId)
    }
  }

  return Array.from(visible)
}

export async function requireVisibleArkUsers(ctx: AuthCapableContext, arkUserIds: string[]) {
  const uniqueIds = Array.from(new Set(arkUserIds))
  if (!uniqueIds.length)
    return
  const visibleIds = await visibleArkUserIds(ctx)
  if (visibleIds === null)
    return
  const visible = new Set(visibleIds)
  const hidden = uniqueIds.filter(id => !visible.has(id))
  if (hidden.length) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'One or more users are not visible to this member.',
    })
  }
}

export type MarketStoreRow = typeof arkMarketStores.$inferSelect
export type MarketJobRow = typeof arkMarketJobs.$inferSelect

export const roleCreateSchema = z.object({
  description: z.string().max(2000).nullable().optional(),
  key: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/),
  name: z.string().min(1).max(160),
  rank: z.number().int().min(0).max(1000).default(0),
  scopeId: z.uuid().nullable().optional(),
  scopeType: z.enum(['global', 'space']).default('global'),
})

export async function currentArkUserOrThrow(sessionOrCtx: any) {
  const requestAuth = resolveRequestAuth(sessionOrCtx)
  const arkUser = requestAuth
    ? await requestAuth.arkUser()
    : await currentArkUser(resolveSession(sessionOrCtx))
  if (!arkUser) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Sign in to manage market data.',
    })
  }
  return arkUser
}

export async function marketManageSpaceIds(ctx: AuthCapableContext, arkUserId: string) {
  const activeMemberships = await ctx.db.select().from(arkMemberships).where(and(
    eq(arkMemberships.arkUserId, arkUserId),
    eq(arkMemberships.scopeType, 'space'),
    eq(arkMemberships.status, 'active'),
  ))
  const ids: string[] = []
  for (const membership of activeMemberships) {
    const access = ctx.auth
      ? await ctx.auth.capabilitiesFor(membership.scopeId)
      : await getEffectiveCapabilities(membership.scopeId, ctx.session)
    if (access.capabilities.includes('market.jobs.manage'))
      ids.push(membership.scopeId)
  }
  return Array.from(new Set(ids))
}

export async function requireStoreManage(ctx: AuthCapableContext, store: MarketStoreRow) {
  const arkUser = await currentArkUserOrThrow(ctx)
  if (!arkUser)
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in to manage market data.' })
  await requireSpaceAccess(store.ownerSpaceId, ctx, 'market.jobs.manage')
  return { arkUser }
}

export async function requireStoreOwnerInput(ctx: AuthCapableContext, input: { ownerSpaceId: string }) {
  const arkUser = await currentArkUserOrThrow(ctx)
  if (!arkUser)
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in to manage market data.' })
  await requireSpaceAccess(input.ownerSpaceId, ctx, 'market.jobs.manage')
  return { ownerSpaceId: input.ownerSpaceId, arkUser }
}

export async function replaceStoreTargets(ctx: { db: any }, storeId: string, input: {
  categoryIds: string[]
  skillIds: string[]
  styleIds: string[]
  tagIds: string[]
  toolIds: string[]
}) {
  const sets = [
    [marketStoreCategories, input.categoryIds],
    [marketStoreSkills, input.skillIds],
    [marketStoreTools, input.toolIds],
    [marketStoreStyles, input.styleIds],
    [marketStoreTags, input.tagIds],
  ] as const
  for (const [table, ids] of sets) {
    await ctx.db.delete(table).where(eq(table.storeId, storeId))
    if (ids.length) {
      await ctx.db.insert(table).values(ids.map(targetId => ({
        storeId,
        targetId,
      }))).onConflictDoNothing()
    }
  }
}

export async function withStoreDetails(ctx: { db: any }, rows: MarketStoreRow[]) {
  if (!rows.length)
    return []
  const ids = rows.map(row => row.id)
  const [
    categories,
    skills,
    tools,
    styles,
    tags,
  ] = await Promise.all([
    ctx.db.select().from(marketStoreCategories).where(inArray(marketStoreCategories.storeId, ids)),
    ctx.db.select().from(marketStoreSkills).where(inArray(marketStoreSkills.storeId, ids)),
    ctx.db.select().from(marketStoreTools).where(inArray(marketStoreTools.storeId, ids)),
    ctx.db.select().from(marketStoreStyles).where(inArray(marketStoreStyles.storeId, ids)),
    ctx.db.select().from(marketStoreTags).where(inArray(marketStoreTags.storeId, ids)),
  ])
  const groupIds = (items: Array<{ storeId: string, targetId: string }>) => {
    const grouped = new Map<string, string[]>()
    for (const item of items)
      grouped.set(item.storeId, [...(grouped.get(item.storeId) ?? []), item.targetId])
    return grouped
  }
  const categoryIds = groupIds(categories)
  const skillIds = groupIds(skills)
  const toolIds = groupIds(tools)
  const styleIds = groupIds(styles)
  const tagIds = groupIds(tags)
  return rows.map(row => ({
    ...row,
    categoryIds: categoryIds.get(row.id) ?? [],
    skillIds: skillIds.get(row.id) ?? [],
    styleIds: styleIds.get(row.id) ?? [],
    tagIds: tagIds.get(row.id) ?? [],
    toolIds: toolIds.get(row.id) ?? [],
  }))
}

export async function withMarketJobDetails(ctx: { db: any }, rows: MarketJobRow[]) {
  if (!rows.length)
    return []
  const ids = rows.map(row => row.id)
  const [categories, tags] = await Promise.all([
    ctx.db.select().from(marketJobCategories).where(inArray(marketJobCategories.jobId, ids)),
    ctx.db.select().from(marketJobTags).where(inArray(marketJobTags.jobId, ids)),
  ])
  const groupIds = (items: Array<{ jobId: string, targetId: string }>) => {
    const grouped = new Map<string, string[]>()
    for (const item of items)
      grouped.set(item.jobId, [...(grouped.get(item.jobId) ?? []), item.targetId])
    return grouped
  }
  const categoryIds = groupIds(categories)
  const tagIds = groupIds(tags)
  return rows.map(row => ({
    ...row,
    categoryIds: categoryIds.get(row.id) ?? [],
    tagIds: tagIds.get(row.id) ?? [],
  }))
}

export function publicMarketJob<T extends Record<string, any>>(job: T): T {
  return {
    ...job,
    contactJson: {},
    sourceRawJson: {},
    workflowJson: {},
  } as T
}

export async function replaceJobTargets(ctx: { db: any }, jobId: string, input: {
  categoryIds: string[]
  tagIds: string[]
}) {
  const sets = [
    [marketJobCategories, input.categoryIds],
    [marketJobTags, input.tagIds],
  ] as const
  for (const [table, ids] of sets) {
    await ctx.db.delete(table).where(eq(table.jobId, jobId))
    if (ids.length) {
      await ctx.db.insert(table).values(ids.map(targetId => ({
        jobId,
        targetId,
      }))).onConflictDoNothing()
    }
  }
}

export async function getChannelForAccess(channelId: string, sessionOrCtx: any, capability: ArkCapabilityLike) {
  const requestAuth = resolveRequestAuth(sessionOrCtx)
  const access = requestAuth
    ? await requestAuth.canReadChannel(channelId)
    : await canReadChannel(channelId, resolveSession(sessionOrCtx))
  if (!access.channel) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Channel not found',
    })
  }
  if (!access.allowed) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: access.reason ?? 'Channel access denied',
    })
  }
  requireCapability(access.access.capabilities, capability)
  return { access: access.access, channel: access.channel }
}

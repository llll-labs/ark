import type {
  arkUsers,
  arkAuthUsers,
  arkChannels,
  arkCollections,
  arkFields,
  arkItems,
  arkMarketJobs,
  arkMarketStores,
  arkMessages,
  arkPages,
  arkSpaces,
  arkViews,
} from './schema'
import { createInsertSchema } from 'drizzle-zod'
import { z } from 'zod/v4'
import {
  arkSettings,
} from './schema'

export const arkCapabilityValues = [
  'market.access',
  'forum.access',
  'knowledge.access',
  'agent.access',
  'dm.access',
  'app.sidebar.access',
  'settings.read',
  'settings.manage',
  'spaces.read',
  'spaces.manage',
  'members.read',
  'members.manage',
  'roles.read',
  'roles.manage',
  'channels.read',
  'channels.create',
  'channels.manage',
  'messages.read',
  'messages.create',
  'messages.manage',
  'files.read',
  'files.upload',
  'files.manage',
  'pages.read',
  'pages.manage',
  'items.read',
  'items.create',
  'items.update',
  'items.manage',
  'market.jobs.read',
  'market.jobs.create',
  'market.jobs.manage',
] as const

export const arkCapabilitySchema = z.enum(arkCapabilityValues)
export type ArkCapability = z.infer<typeof arkCapabilitySchema>

// Tenants extend the capability set at boot via registerArkCapabilities()
// (server/utils/app-extensions.ts); grants store actions as plain text, so
// tenant capabilities need no migration. This type keeps autocomplete for
// core capabilities while accepting registered tenant ones.
export type ArkCapabilityLike = ArkCapability | (string & {})

// Shape check for capability actions (dot-separated lowercase segments).
// Whether an action is actually known (core or tenant-registered) is
// enforced server-side via isKnownArkCapability().
export const arkCapabilityActionPattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/
export const arkCapabilityActionSchema = z.string().min(3).max(80).regex(arkCapabilityActionPattern)

export const scopeTypeSchema = z.enum(['global', 'space', 'channel', 'job', 'collection', 'item', 'page'])
export const spaceKindSchema = z.enum(['public_square', 'private', 'organization', 'admin', 'studio', 'task', 'system'])
export const visibilitySchema = z.enum(['public', 'registered', 'space', 'private'])
export const channelKindSchema = z.enum(['chat', 'forum', 'announcement', 'thread', 'dm', 'job_discussion', 'feed'])
export const messageRelationKindSchema = z.enum(['attachment', 'reply_quote', 'forum_parent', 'user_mention', 'channel_mention', 'role_mention', 'job_reference', 'collection_reference', 'item_reference', 'page_reference'])
export const messageRelationTargetTypeSchema = z.enum(['ark_user', 'channel', 'file', 'item', 'job', 'message', 'page', 'role', 'space'])
export const membershipStatusSchema = z.enum(['pending', 'active', 'suspended', 'blocked'])
export const marketStoreStatusSchema = z.enum(['draft', 'pending_review', 'active', 'rejected', 'suspended'])

export const idSchema = z.uuid()
export const slugSchema = z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const jsonRecordSchema = z.record(z.string(), z.unknown())

export const spaceCreateSchema = z.object({
  parentSpaceId: idSchema.nullable().optional(),
  slug: slugSchema,
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  kind: spaceKindSchema.default('private'),
  visibility: visibilitySchema.default('private'),
  inheritAccess: z.boolean().default(true),
})

export const spaceListSchema = z.object({
  parentSpaceId: idSchema.nullable().optional(),
}).default({})

export const byIdSchema = z.object({ id: idSchema })
export const emptyListSchema = z.object({}).default({})
export const spaceScopedListSchema = z.object({ spaceId: idSchema })

export const grantCreateSchema = z.object({
  subjectType: z.enum(['anon', 'authenticated', 'ark_user', 'role', 'membership']),
  subjectId: idSchema.nullable().optional(),
  scopeType: scopeTypeSchema.default('space'),
  scopeId: idSchema.nullable().optional(),
  action: arkCapabilityActionSchema,
  effect: z.enum(['allow', 'deny']).default('allow'),
})

export const memberUpsertSchema = z.object({
  arkUserId: idSchema,
  scopeType: scopeTypeSchema.default('space'),
  scopeId: idSchema,
  roleId: idSchema.nullable().optional(),
  roleIds: z.array(idSchema).optional(),
  status: membershipStatusSchema.default('active'),
})

export const userProfileUpdateSchema = z.object({
  displayName: z.string().min(1).max(160).optional(),
  handle: z.string().min(2).max(80).regex(/^[a-z0-9_]+$/).nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
  avatarFileId: idSchema.nullable().optional(),
  profileJson: jsonRecordSchema.optional(),
})

export const userSettingsUpdateSchema = z.object({
  appearanceJson: jsonRecordSchema.optional(),
  notificationsJson: jsonRecordSchema.optional(),
  privacyJson: jsonRecordSchema.optional(),
  agentJson: jsonRecordSchema.optional(),
})

export const channelCreateSchema = z.object({
  spaceId: idSchema,
  slug: slugSchema.optional(),
  name: z.string().min(1).max(160),
  kind: channelKindSchema.default('chat'),
  visibility: visibilitySchema.default('space'),
  memberArkUserIds: z.array(idSchema).default([]),
  categoryId: idSchema.optional(),
  targetType: z.string().max(80).optional(),
  targetId: idSchema.optional(),
})

export const dmUpsertSchema = z.object({
  memberArkUserIds: z.array(idSchema).min(1).max(32),
})

export const messageCreateSchema = z.object({
  channelId: idSchema,
  forumParentMessageId: idSchema.optional(),
  replyToMessageId: idSchema.optional(),
  body: z.string().max(10000),
  bodyJson: jsonRecordSchema.default({}),
}).strict().refine(input => !(input.forumParentMessageId && input.replyToMessageId), {
  message: 'Use either replyToMessageId or forumParentMessageId, not both.',
})

export const messagesListSchema = z.object({
  channelId: idSchema,
  limit: z.number().int().min(1).max(100).default(50),
})

export const messageCursorSchema = z.object({
  createdAt: z.string().min(1),
  id: idSchema,
})

export const messagesLatestSchema = z.object({
  channelId: idSchema,
  limit: z.number().int().min(1).max(100).default(50),
})

export const messagesBeforeSchema = z.object({
  channelId: idSchema,
  cursor: messageCursorSchema,
  limit: z.number().int().min(1).max(100).default(50),
})

export const messagesAfterSchema = messagesBeforeSchema

export const messagesAroundSchema = z.object({
  channelId: idSchema,
  messageId: idSchema,
  before: z.number().int().min(0).max(100).default(50),
  after: z.number().int().min(0).max(100).default(50),
})

export const messagesPinnedSchema = z.object({
  channelId: idSchema,
  cursor: messageCursorSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
})

export const pageCreateSchema = z.object({
  spaceId: idSchema,
  parentPageId: idSchema.nullable().optional(),
  slug: slugSchema,
  title: z.string().min(1).max(240),
  icon: z.string().max(120).nullable().optional(),
  kind: z.enum(['group', 'component', 'collection', 'view', 'item', 'channel', 'external']).default('group'),
  componentName: z.string().max(120).nullable().optional(),
  targetType: z.string().max(80).optional(),
  targetId: idSchema.optional(),
  position: z.number().int().optional(),
  configJson: jsonRecordSchema.default({}),
})

export const collectionCreateSchema = z.object({
  spaceId: idSchema,
  slug: slugSchema,
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
})

export const fieldCreateSchema = z.object({
  collectionId: idSchema,
  key: slugSchema,
  name: z.string().min(1).max(160),
  type: z.string().min(1).max(80).default('text'),
  slotKind: z.enum(['text', 'number', 'date', 'boolean', 'select', 'json']).nullable().optional(),
  slotIndex: z.number().int().positive().nullable().optional(),
})

export const itemCreateSchema = z.object({
  spaceId: idSchema,
  collectionId: idSchema.optional(),
  parentItemId: idSchema.optional(),
  title: z.string().min(1).max(240).default('Untitled'),
  bodyJson: jsonRecordSchema.default({}),
  dataJson: jsonRecordSchema.default({}),
})

export const marketJobUpsertSchema = z.object({
  spaceId: idSchema.optional(),
  title: z.string().min(1).max(280),
  summary: z.string().max(4000).optional(),
  description: z.string().max(20000).optional(),
  kind: z.string().min(1).max(80).default('unknown'),
  status: z.enum(['draft', 'open', 'responding', 'ordered', 'completed', 'archived']).default('draft'),
  curationStatus: z.enum(['parsed', 'approved', 'hidden']).default('parsed'),
  budgetAmount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  budgetCurrency: z.string().max(16).optional(),
  rating: z.number().int().min(0).max(100).optional(),
  ratingReason: z.string().max(1000).optional(),
  aiConfidence: z.number().min(0).max(1).optional(),
  categoryIds: z.array(idSchema).default([]),
  primaryCategoryId: idSchema.nullable().optional(),
  source: z.string().max(80).optional(),
  sourceUrl: z.url().optional(),
  sourceLocale: z.string().min(1).max(32).default('unknown'),
  sourcePublishedAt: z.coerce.date().nullable().optional(),
  externalId: z.string().max(240).optional(),
  tagIds: z.array(idSchema).default([]),
  contactJson: jsonRecordSchema.default({}),
  sourceRawJson: jsonRecordSchema.default({}),
  workflowJson: jsonRecordSchema.default({}),
})

export const marketJobCurationSchema = z.object({
  id: idSchema,
  action: z.enum(['approve', 'hide', 'archive']),
})

export const marketStoreListSchema = z.object({
  status: marketStoreStatusSchema.optional(),
  ownerSpaceId: idSchema.optional(),
  limit: z.number().int().min(1).max(200).default(100),
}).default({ limit: 100 })

export const marketStoreUpsertSchema = z.object({
  id: idSchema.optional(),
  ownerSpaceId: idSchema,
  status: marketStoreStatusSchema.default('pending_review'),
  name: z.string().min(1).max(160),
  headline: z.string().max(280).nullable().optional(),
  bio: z.string().max(4000).nullable().optional(),
  timezone: z.string().max(80).nullable().optional(),
  location: z.string().max(160).nullable().optional(),
  remote: z.boolean().default(true),
  availability: z.string().max(280).nullable().optional(),
  portfolioUrl: z.url().nullable().optional(),
  serviceSummary: z.string().max(2000).nullable().optional(),
  rateAmount: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
  rateCurrency: z.string().max(16).nullable().optional(),
  rateUnit: z.string().max(80).nullable().optional(),
  verificationJson: jsonRecordSchema.default({}),
  metaJson: jsonRecordSchema.default({}),
  categoryIds: z.array(idSchema).default([]),
  skillIds: z.array(idSchema).default([]),
  toolIds: z.array(idSchema).default([]),
  styleIds: z.array(idSchema).default([]),
  tagIds: z.array(idSchema).default([]),
})

export const telegramMiniAuthSchema = z.object({
  initData: z.string().min(1),
})

export const settingsUpdateSchema = createInsertSchema(arkSettings)
  .omit({ id: true, key: true, createdAt: true, updatedAt: true, deletedAt: true })
  .partial()

export type ArkUser = typeof arkUsers.$inferSelect
export type AuthUser = typeof arkAuthUsers.$inferSelect
export type ArkSettings = typeof arkSettings.$inferSelect
export type Space = typeof arkSpaces.$inferSelect
export type Channel = typeof arkChannels.$inferSelect
export type Message = typeof arkMessages.$inferSelect
export type Page = typeof arkPages.$inferSelect
export type Collection = typeof arkCollections.$inferSelect
export type Field = typeof arkFields.$inferSelect
export type View = typeof arkViews.$inferSelect
export type Item = typeof arkItems.$inferSelect
export type MarketStore = typeof arkMarketStores.$inferSelect
export type MarketJob = typeof arkMarketJobs.$inferSelect

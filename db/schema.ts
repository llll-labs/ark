import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { timestamps, timestampsNoSoftDelete, uuidPk } from './columns'

export const arkSchema = pgSchema('ark')
const arkTable = arkSchema.table

export const arkUserKindEnum = arkSchema.enum('user_kind', ['human', 'integration', 'system'])
export const membershipStatusEnum = arkSchema.enum('membership_status', ['pending', 'active', 'suspended', 'blocked'])
export const grantEffectEnum = arkSchema.enum('grant_effect', ['allow', 'deny'])
export const scopeTypeEnum = arkSchema.enum('scope_type', ['global', 'space', 'channel', 'job', 'collection', 'item', 'page'])
export const grantSubjectTypeEnum = arkSchema.enum('grant_subject_type', ['anon', 'authenticated', 'ark_user', 'role', 'membership'])
export const spaceKindEnum = arkSchema.enum('space_kind', ['public_square', 'private', 'organization', 'admin', 'studio', 'task', 'system'])
export const visibilityEnum = arkSchema.enum('visibility', ['public', 'registered', 'space', 'private'])
export const channelKindEnum = arkSchema.enum('channel_kind', ['chat', 'forum', 'announcement', 'thread', 'dm', 'job_discussion', 'feed'])
export const channelMemberStatusEnum = arkSchema.enum('channel_member_status', ['active', 'invited', 'muted', 'left', 'blocked'])
export const messageKindEnum = arkSchema.enum('message_kind', ['message', 'comment', 'system'])
export const messageRelationKindEnum = arkSchema.enum('message_relation_kind', [
  'attachment',
  'reply_quote',
  'forum_parent',
  'user_mention',
  'channel_mention',
  'role_mention',
  'job_reference',
  'collection_reference',
  'item_reference',
  'page_reference',
])
export const messageRelationTargetTypeEnum = arkSchema.enum('message_relation_target_type', [
  'ark_user',
  'channel',
  'file',
  'item',
  'job',
  'message',
  'page',
  'role',
  'space',
])
export const pageKindEnum = arkSchema.enum('page_kind', ['group', 'component', 'collection', 'view', 'item', 'channel', 'external'])
export const fieldSlotKindEnum = arkSchema.enum('field_slot_kind', ['text', 'number', 'date', 'boolean', 'select', 'json'])
export const fieldTypeEnum = arkSchema.enum('field_type', [
  'boolean',
  'created_by',
  'created_time',
  'date',
  'email',
  'external_relation',
  'file',
  'files',
  'json',
  'last_edited_by',
  'last_edited_time',
  'multi_select',
  'number',
  'people',
  'phone_number',
  'place',
  'relation',
  'select',
  'status',
  'text',
  'unique_id',
  'url',
  'user',
  'verification',
])
export const marketStoreStatusEnum = arkSchema.enum('market_store_status', ['draft', 'pending_review', 'active', 'rejected', 'suspended'])
export const marketJobStatusEnum = arkSchema.enum('market_job_status', ['draft', 'open', 'responding', 'ordered', 'completed', 'archived'])
export const marketJobCurationStatusEnum = arkSchema.enum('market_job_curation_status', ['parsed', 'approved', 'hidden'])
export const responsePricingModeEnum = arkSchema.enum('response_pricing_mode', ['free', 'paid_response', 'success_fee', 'manual'])
export const notificationStatusEnum = arkSchema.enum('notification_status', ['queued', 'sent', 'skipped', 'failed'])

type FieldSlotKind = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'json'

export const fieldSlotCapacity = {
  boolean: 32,
  date: 32,
  json: 8,
  number: 32,
  select: 32,
  text: 96,
} as const satisfies Record<FieldSlotKind, number>

function slotColumnName(kind: FieldSlotKind, index: number) {
  return `${kind}_${String(index).padStart(3, '0')}`
}

function slotColumns<T>(kind: FieldSlotKind, factory: (name: string) => T) {
  return Object.fromEntries(
    Array.from({ length: fieldSlotCapacity[kind] }, (_, offset) => {
      const name = slotColumnName(kind, offset + 1)
      return [name, factory(name)]
    }),
  ) as Record<string, T>
}

function scalarSlotIndexes(table: any) {
  return (['text', 'number', 'date', 'boolean', 'select'] as const).flatMap(kind =>
    Array.from({ length: fieldSlotCapacity[kind] }, (_, offset) => {
      const columnName = slotColumnName(kind, offset + 1)
      const column = table[columnName]
      return index(`ark_items_${columnName}_idx`)
        .on(table.collectionId, column)
        .where(sql`${column} is not null and ${table.deletedAt} is null`)
    }),
  )
}

export const arkAuthUsers = arkTable('auth_users', {
  id: uuidPk(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  ...timestampsNoSoftDelete(),
})

export const arkAuthSessions = arkTable('auth_sessions', {
  id: uuidPk(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  ...timestampsNoSoftDelete(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: uuid('user_id').notNull().references(() => arkAuthUsers.id, { onDelete: 'cascade' }),
}, table => [
  index('ark_auth_sessions_user_id_idx').on(table.userId),
])

export const arkAuthAccounts = arkTable('auth_accounts', {
  id: uuidPk(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: uuid('user_id').notNull().references(() => arkAuthUsers.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  ...timestampsNoSoftDelete(),
}, table => [
  uniqueIndex('ark_auth_accounts_provider_account_idx').on(table.providerId, table.accountId),
  index('ark_auth_accounts_user_id_idx').on(table.userId),
])

export const arkAuthVerifications = arkTable('auth_verifications', {
  id: uuidPk(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestampsNoSoftDelete(),
})

export const arkUsers = arkTable('users', {
  id: uuidPk(),
  authUserId: uuid('auth_user_id').references(() => arkAuthUsers.id, { onDelete: 'set null' }),
  kind: arkUserKindEnum('kind').notNull().default('human'),
  handle: text('handle'),
  displayName: text('display_name').notNull(),
  avatarFileId: uuid('avatar_file_id').references((): AnyPgColumn => arkFiles.id, { onDelete: 'set null' }),
  bio: text('bio'),
  profileJson: jsonb('profile_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_users_auth_user_unique').on(table.authUserId),
  uniqueIndex('ark_users_handle_unique').on(table.handle),
  index('ark_users_avatar_file_idx').on(table.avatarFileId),
  index('ark_users_kind_idx').on(table.kind),
])

export const arkUserSettings = arkTable('user_settings', {
  id: uuidPk(),
  arkUserId: uuid('ark_user_id').notNull().references(() => arkUsers.id, { onDelete: 'cascade' }),
  appearanceJson: jsonb('appearance_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  notificationsJson: jsonb('notifications_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  privacyJson: jsonb('privacy_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  agentJson: jsonb('agent_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_user_settings_user_unique').on(table.arkUserId),
])

export const arkFiles = arkTable('files', {
  id: uuidPk(),
  ownerArkUserId: uuid('owner_ark_user_id').references(() => arkUsers.id, { onDelete: 'set null' }),
  storage: text('storage').notNull().default('private'),
  bucket: text('bucket').notNull().default('ark-files-private'),
  path: text('path').notNull(),
  filename: text('filename').notNull(),
  originalFilename: text('original_filename'),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  width: integer('width'),
  height: integer('height'),
  checksum: text('checksum'),
  visibility: visibilityEnum('visibility').notNull().default('private'),
  metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_files_path_unique').on(table.path),
  index('ark_files_owner_idx').on(table.ownerArkUserId),
])

export const arkFileVariants = arkTable('file_variants', {
  id: uuidPk(),
  fileId: uuid('file_id').notNull().references(() => arkFiles.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  storage: text('storage').notNull().default('private'),
  bucket: text('bucket').notNull().default('ark-files-private'),
  path: text('path').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  width: integer('width'),
  height: integer('height'),
  metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_file_variants_file_kind_unique').on(table.fileId, table.kind),
  uniqueIndex('ark_file_variants_path_unique').on(table.path),
])

export const arkSettings = arkTable('settings', {
  id: uuidPk(),
  key: text('key').notNull().default('main'),
  name: text('name').notNull(),
  description: text('description'),
  logoFileId: uuid('logo_file_id').references(() => arkFiles.id, { onDelete: 'set null' }),
  iconFileId: uuid('icon_file_id').references(() => arkFiles.id, { onDelete: 'set null' }),
  primaryColor: text('primary_color').notNull().default('#0f766e'),
  accentColor: text('accent_color').notNull().default('#f59e0b'),
  themeJson: jsonb('theme_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  authJson: jsonb('auth_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  onboardingJson: jsonb('onboarding_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  portalJson: jsonb('portal_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  dataJson: jsonb('data_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_settings_key_unique').on(table.key),
])

export const arkRoles = arkTable('roles', {
  id: uuidPk(),
  scopeType: scopeTypeEnum('scope_type').notNull().default('global'),
  scopeId: uuid('scope_id'),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  rank: integer('rank').notNull().default(0),
  ...timestamps(),
}, table => [
  index('ark_roles_scope_idx').on(table.scopeType, table.scopeId),
  uniqueIndex('ark_roles_scope_key_unique').on(table.scopeType, table.scopeId, table.key),
])

export const arkSpaces = arkTable('spaces', {
  id: uuidPk(),
  parentSpaceId: uuid('parent_space_id').references((): AnyPgColumn => arkSpaces.id, { onDelete: 'set null' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  kind: spaceKindEnum('kind').notNull().default('private'),
  visibility: visibilityEnum('visibility').notNull().default('private'),
  inheritAccess: boolean('inherit_access').notNull().default(true),
  isDefault: boolean('is_default').notNull().default(false),
  ownerArkUserId: uuid('owner_ark_user_id').references(() => arkUsers.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('active'),
  settingsJson: jsonb('settings_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_spaces_parent_slug_unique').on(table.parentSpaceId, table.slug),
  // Top-level spaces (no parent) must have globally unique slugs — the composite
  // index above does not enforce this because NULL parent_space_id values are
  // treated as distinct in Postgres.
  uniqueIndex('ark_spaces_root_slug_unique')
    .on(table.slug)
    .where(sql`${table.parentSpaceId} is null and ${table.deletedAt} is null`),
  index('ark_spaces_parent_space_id_idx').on(table.parentSpaceId),
  index('ark_spaces_kind_idx').on(table.kind),
  index('ark_spaces_visibility_idx').on(table.visibility),
])

export const arkMemberships = arkTable('memberships', {
  id: uuidPk(),
  arkUserId: uuid('ark_user_id').notNull().references(() => arkUsers.id, { onDelete: 'cascade' }),
  scopeType: scopeTypeEnum('scope_type').notNull(),
  scopeId: uuid('scope_id').notNull(),
  roleId: uuid('role_id').references(() => arkRoles.id, { onDelete: 'set null' }),
  status: membershipStatusEnum('status').notNull().default('pending'),
  joinedAt: timestamp('joined_at', { withTimezone: true }),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_memberships_scope_user_unique').on(table.scopeType, table.scopeId, table.arkUserId),
  index('ark_memberships_ark_user_id_idx').on(table.arkUserId),
  index('ark_memberships_scope_idx').on(table.scopeType, table.scopeId),
])

export const arkMembershipRoles = arkTable('membership_roles', {
  id: uuidPk(),
  membershipId: uuid('membership_id').notNull().references(() => arkMemberships.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').notNull().references(() => arkRoles.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('active'),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_membership_roles_membership_role_unique').on(table.membershipId, table.roleId),
  index('ark_membership_roles_membership_idx').on(table.membershipId),
  index('ark_membership_roles_role_idx').on(table.roleId),
])

export const arkGrants = arkTable('grants', {
  id: uuidPk(),
  subjectType: grantSubjectTypeEnum('subject_type').notNull(),
  subjectId: uuid('subject_id'),
  scopeType: scopeTypeEnum('scope_type').notNull().default('global'),
  scopeId: uuid('scope_id'),
  entityType: text('entity_type'),
  action: text('action').notNull(),
  effect: grantEffectEnum('effect').notNull().default('allow'),
  conditionJson: jsonb('condition_json').$type<Record<string, unknown>>(),
  status: text('status').notNull().default('active'),
  ...timestamps(),
}, table => [
  index('ark_grants_subject_idx').on(table.subjectType, table.subjectId),
  index('ark_grants_scope_action_idx').on(table.scopeType, table.scopeId, table.action),
  index('ark_grants_active_subject_action_idx')
    .on(table.subjectType, table.subjectId, table.action, table.effect)
    .where(sql`${table.status} = 'active' and ${table.deletedAt} is null`),
  check('ark_grants_subject_check', sql`
    (${table.subjectType} in ('anon', 'authenticated') and ${table.subjectId} is null)
    or (${table.subjectType} in ('ark_user', 'role', 'membership') and ${table.subjectId} is not null)
  `),
])

export const arkChannelCategories = arkTable('channel_categories', {
  id: uuidPk(),
  spaceId: uuid('space_id').notNull().references(() => arkSpaces.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  position: integer('position').notNull().default(0),
  configJson: jsonb('config_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_channel_categories_space_slug_unique').on(table.spaceId, table.slug).where(sql`${table.deletedAt} is null`),
  index('ark_channel_categories_space_id_idx').on(table.spaceId),
  index('ark_channel_categories_space_position_idx').on(table.spaceId, table.position),
])

export const arkChannels = arkTable('channels', {
  id: uuidPk(),
  spaceId: uuid('space_id').notNull().references(() => arkSpaces.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => arkChannelCategories.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  kind: channelKindEnum('kind').notNull().default('chat'),
  visibility: visibilityEnum('visibility').notNull().default('space'),
  identityKey: text('identity_key'),
  position: integer('position').notNull().default(0),
  targetType: text('target_type'),
  targetId: uuid('target_id'),
  topic: text('topic'),
  threadParentChannelId: uuid('thread_parent_channel_id').references((): AnyPgColumn => arkChannels.id, { onDelete: 'cascade' }),
  // eslint-disable-next-line ts/no-use-before-define
  threadRootMessageId: uuid('thread_root_message_id').references((): AnyPgColumn => arkMessages.id, { onDelete: 'cascade' }),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  lastMessagePreview: text('last_message_preview'),
  messagesCount: integer('messages_count').notNull().default(0),
  configJson: jsonb('config_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdByArkUserId: uuid('created_by_ark_user_id').references(() => arkUsers.id, { onDelete: 'set null' }),
  ...timestamps(),
}, table => [
  unique('ark_channels_ark_space_id_unique').on(table.spaceId, table.id),
  uniqueIndex('ark_channels_identity_key_unique').on(table.identityKey).where(sql`${table.identityKey} is not null and ${table.deletedAt} is null`),
  uniqueIndex('ark_channels_space_slug_unique').on(table.spaceId, table.slug).where(sql`${table.deletedAt} is null`),
  index('ark_channels_space_id_idx').on(table.spaceId),
  index('ark_channels_category_id_idx').on(table.categoryId),
  index('ark_channels_kind_idx').on(table.kind),
  index('ark_channels_thread_parent_idx').on(table.threadParentChannelId),
  uniqueIndex('ark_channels_thread_root_unique').on(table.threadRootMessageId).where(sql`${table.kind} = 'thread' and ${table.deletedAt} is null`),
  check('ark_channels_private_membership_check', sql`${table.visibility} <> 'private' or ${table.kind} in ('dm', 'chat', 'job_discussion', 'thread')`),
  check('ark_channels_thread_owner_check', sql`
    (${table.kind} = 'thread' and ${table.threadParentChannelId} is not null and ${table.threadRootMessageId} is not null)
    or (${table.kind} <> 'thread' and ${table.threadParentChannelId} is null and ${table.threadRootMessageId} is null)
  `),
])

export const arkChannelMembers = arkTable('channel_members', {
  id: uuidPk(),
  channelId: uuid('channel_id').notNull().references(() => arkChannels.id, { onDelete: 'cascade' }),
  arkUserId: uuid('ark_user_id').notNull().references(() => arkUsers.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  status: channelMemberStatusEnum('status').notNull().default('active'),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_channel_members_channel_user_unique').on(table.channelId, table.arkUserId),
  index('ark_channel_members_user_idx').on(table.arkUserId),
  index('ark_channel_members_channel_idx').on(table.channelId),
])

export const arkMessages = arkTable('messages', {
  id: uuidPk(),
  spaceId: uuid('space_id').notNull().references(() => arkSpaces.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id').notNull().references(() => arkChannels.id, { onDelete: 'cascade' }),
  rootMessageId: uuid('root_message_id').references((): AnyPgColumn => arkMessages.id, { onDelete: 'set null' }),
  kind: messageKindEnum('kind').notNull().default('message'),
  authorArkUserId: uuid('author_ark_user_id').references(() => arkUsers.id, { onDelete: 'set null' }),
  body: text('body'),
  bodyJson: jsonb('body_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  ...timestamps(),
}, table => [
  unique('ark_messages_ark_channel_id_unique').on(table.channelId, table.id),
  index('ark_messages_channel_created_idx').on(table.channelId, table.createdAt),
  index('ark_messages_channel_order_idx')
    .on(table.channelId, table.createdAt.desc(), table.id.desc())
    .where(sql`${table.deletedAt} is null`),
])

export const arkMessageReactions = arkTable('message_reactions', {
  id: uuidPk(),
  messageId: uuid('message_id').notNull().references(() => arkMessages.id, { onDelete: 'cascade' }),
  arkUserId: uuid('ark_user_id').notNull().references(() => arkUsers.id, { onDelete: 'cascade' }),
  emoji: text('emoji').notNull(),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_message_reactions_unique').on(table.messageId, table.arkUserId, table.emoji),
])

export const arkMessagePins = arkTable('message_pins', {
  id: uuidPk(),
  channelId: uuid('channel_id').notNull().references(() => arkChannels.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id').notNull().references(() => arkMessages.id, { onDelete: 'cascade' }),
  pinnedByArkUserId: uuid('pinned_by_ark_user_id').references(() => arkUsers.id, { onDelete: 'set null' }),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_message_pins_message_unique').on(table.messageId),
  index('ark_message_pins_channel_idx').on(table.channelId),
  index('ark_message_pins_channel_order_idx')
    .on(table.channelId, table.createdAt.desc(), table.id.desc())
    .where(sql`${table.deletedAt} is null`),
])

export const arkMessageRelations = arkTable('message_relations', {
  id: uuidPk(),
  messageId: uuid('message_id').notNull().references(() => arkMessages.id, { onDelete: 'cascade' }),
  relationType: messageRelationKindEnum('relation_type').notNull(),
  targetType: messageRelationTargetTypeEnum('target_type').notNull(),
  targetId: uuid('target_id'),
  targetCollectionKey: text('target_collection_key'),
  targetRecordId: text('target_record_id'),
  ...timestamps(),
}, table => [
  index('ark_message_relations_message_idx').on(table.messageId),
  index('ark_message_relations_target_idx').on(table.targetType, table.targetId),
  index('ark_message_relations_message_target_idx').on(table.messageId, table.targetType, table.targetId),
  uniqueIndex('ark_message_relations_one_reply_quote').on(table.messageId).where(sql`${table.relationType} = 'reply_quote' and ${table.deletedAt} is null`),
  uniqueIndex('ark_message_relations_one_forum_parent').on(table.messageId).where(sql`${table.relationType} = 'forum_parent' and ${table.deletedAt} is null`),
])

export const arkUserChannelStates = arkTable('user_channel_states', {
  id: uuidPk(),
  arkUserId: uuid('ark_user_id').notNull().references(() => arkUsers.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id').notNull().references(() => arkChannels.id, { onDelete: 'cascade' }),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  lastSeenMessageId: uuid('last_seen_message_id').references(() => arkMessages.id, { onDelete: 'set null' }),
  unreadCount: integer('unread_count').notNull().default(0),
  mentionCount: integer('mention_count').notNull().default(0),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_user_channel_states_user_channel_unique').on(table.arkUserId, table.channelId),
])

export const arkPages = arkTable('pages', {
  id: uuidPk(),
  spaceId: uuid('space_id').notNull().references(() => arkSpaces.id, { onDelete: 'cascade' }),
  parentPageId: uuid('parent_page_id').references((): AnyPgColumn => arkPages.id, { onDelete: 'set null' }),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  icon: text('icon'),
  kind: pageKindEnum('kind').notNull().default('group'),
  componentName: text('component_name'),
  targetType: text('target_type'),
  targetId: uuid('target_id'),
  position: integer('position').notNull().default(0),
  configJson: jsonb('config_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_pages_space_slug_unique').on(table.spaceId, table.slug),
  index('ark_pages_parent_position_idx').on(table.parentPageId, table.position),
])

export const arkResourceDefinitions = arkTable('resource_definitions', {
  id: uuidPk(),
  name: text('name').notNull(),
  schemaName: text('schema_name').notNull().default('public'),
  tableName: text('table_name').notNull(),
  label: text('label'),
  primaryKey: text('primary_key').notNull().default('id'),
  deletionPolicy: text('deletion_policy').notNull().default('disabled'),
  operationsJson: jsonb('operations_json').$type<Record<string, boolean>>().notNull().default(sql`'{}'::jsonb`),
  fieldsJson: jsonb('fields_json').$type<Record<string, string[]>>().notNull().default(sql`'{}'::jsonb`),
  rowPolicyJson: jsonb('row_policy_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  ...timestampsNoSoftDelete(),
}, table => [
  uniqueIndex('ark_resource_definitions_name_unique').on(table.name),
  uniqueIndex('ark_resource_definitions_table_unique').on(table.schemaName, table.tableName),
])

export const arkCollections = arkTable('collections', {
  id: uuidPk(),
  spaceId: uuid('space_id').notNull().references(() => arkSpaces.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  createdByArkUserId: uuid('created_by_ark_user_id').references(() => arkUsers.id, { onDelete: 'set null' }),
  ...timestamps(),
}, table => [
  unique('ark_collections_ark_space_id_unique').on(table.spaceId, table.id),
  uniqueIndex('ark_collections_space_slug_unique').on(table.spaceId, table.slug),
])

export const arkFields = arkTable('fields', {
  id: uuidPk(),
  collectionId: uuid('collection_id').notNull().references(() => arkCollections.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  type: fieldTypeEnum('type').notNull().default('text'),
  slotKind: fieldSlotKindEnum('slot_kind'),
  slotIndex: integer('slot_index'),
  configJson: jsonb('config_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  position: integer('position').notNull().default(0),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_fields_collection_key_unique').on(table.collectionId, table.key),
  uniqueIndex('ark_fields_collection_slot_unique')
    .on(table.collectionId, table.slotKind, table.slotIndex)
    .where(sql`${table.slotKind} is not null and ${table.slotIndex} is not null`),
  check('ark_fields_slot_index_check', sql`${table.slotIndex} is null or ${table.slotIndex} > 0`),
])

export const arkItems = arkTable('items', {
  id: uuidPk(),
  spaceId: uuid('space_id').notNull().references(() => arkSpaces.id, { onDelete: 'cascade' }),
  collectionId: uuid('collection_id').references(() => arkCollections.id, { onDelete: 'set null' }),
  parentItemId: uuid('parent_item_id').references((): AnyPgColumn => arkItems.id, { onDelete: 'set null' }),
  rootItemId: uuid('root_item_id').references((): AnyPgColumn => arkItems.id, { onDelete: 'set null' }),
  position: integer('position').notNull().default(0),
  bodyJson: jsonb('body_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  title: text('title').notNull().default('Untitled'),
  summary: text('summary'),
  kind: text('kind').notNull().default('item'),
  visibility: visibilityEnum('visibility').notNull().default('space'),
  dataJson: jsonb('data_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdByArkUserId: uuid('created_by_ark_user_id').references(() => arkUsers.id, { onDelete: 'set null' }),
  assignedArkUserId: uuid('assigned_ark_user_id').references(() => arkUsers.id, { onDelete: 'set null' }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  sourceUrl: text('source_url'),
  ...slotColumns('text', name => text(name)),
  ...slotColumns('number', name => numeric(name, { precision: 18, scale: 6 })),
  ...slotColumns('date', name => timestamp(name, { withTimezone: true })),
  ...slotColumns('boolean', name => boolean(name)),
  ...slotColumns('select', name => text(name)),
  ...slotColumns('json', name => jsonb(name).$type<unknown>()),
  ...timestamps(),
}, table => [
  index('ark_items_collection_id_idx').on(table.collectionId),
  index('ark_items_parent_position_idx').on(table.parentItemId, table.position).where(sql`${table.deletedAt} is null`),
  index('ark_items_root_position_idx').on(table.rootItemId, table.position).where(sql`${table.deletedAt} is null`),
  index('ark_items_space_id_idx').on(table.spaceId),
  check('ark_items_position_check', sql`${table.position} >= 0`),
  ...scalarSlotIndexes(table),
])

export const arkViews = arkTable('views', {
  id: uuidPk(),
  spaceId: uuid('space_id').notNull().references(() => arkSpaces.id, { onDelete: 'cascade' }),
  collectionId: uuid('collection_id').notNull().references(() => arkCollections.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('table'),
  configJson: jsonb('config_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_views_collection_slug_unique').on(table.collectionId, table.slug),
  index('ark_views_space_id_idx').on(table.spaceId),
])

export const arkMarketCategories = arkTable('market_categories', {
  id: uuidPk(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  group: text('group'),
  position: integer('position').notNull().default(0),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_market_categories_slug_unique').on(table.slug),
])

export const arkMarketSkills = arkTable('market_skills', {
  id: uuidPk(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  group: text('group'),
  position: integer('position').notNull().default(0),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_market_skills_slug_unique').on(table.slug),
])

export const arkMarketTools = arkTable('market_tools', {
  id: uuidPk(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  group: text('group'),
  position: integer('position').notNull().default(0),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_market_tools_slug_unique').on(table.slug),
])

export const arkMarketStyles = arkTable('market_styles', {
  id: uuidPk(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  group: text('group'),
  position: integer('position').notNull().default(0),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_market_styles_slug_unique').on(table.slug),
])

export const arkMarketTags = arkTable('market_tags', {
  id: uuidPk(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  group: text('group'),
  position: integer('position').notNull().default(0),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_market_tags_slug_unique').on(table.slug),
])

// MARKET MODEL — v0 scope.
// Actor = a space (personal = org with 1 member). Selling = a standing presence
// (the store below, 1:1 per space). Buying = an act (ark.market_jobs).
//
// Planned for v2 (NOT in v0): ark_market_offers (supply listings: service /
// digital_product / gig on a store), ark_market_orders (the buyer↔seller deal,
// both are spaces), ark_market_responses (applications/bids on a job),
// ark_market_reviews (space→space, attached to a completed order; feeds the
// store/space rating). Paid responses, commissions and PRO entitlements layer on
// top of these — billed to the space, not the user.
export const arkMarketStores = arkTable('market_stores', {
  id: uuidPk(),
  ownerSpaceId: uuid('owner_space_id').notNull().references(() => arkSpaces.id, { onDelete: 'cascade' }),
  status: marketStoreStatusEnum('status').notNull().default('pending_review'),
  name: text('name').notNull(),
  headline: text('headline'),
  bio: text('bio'),
  timezone: text('timezone'),
  location: text('location'),
  remote: boolean('remote').notNull().default(true),
  availability: text('availability'),
  portfolioUrl: text('portfolio_url'),
  // Seller pricing/verification (merged from the former performer profile).
  serviceSummary: text('service_summary'),
  rateAmount: numeric('rate_amount', { precision: 12, scale: 2 }),
  rateCurrency: text('rate_currency'),
  rateUnit: text('rate_unit'),
  verificationJson: jsonb('verification_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  ratingAverage: numeric('rating_average', { precision: 4, scale: 2 }).notNull().default('0'),
  reviewsCount: integer('reviews_count').notNull().default(0),
  metaJson: jsonb('meta_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedByArkUserId: uuid('reviewed_by_ark_user_id').references(() => arkUsers.id, { onDelete: 'set null' }),
  reviewNote: text('review_note'),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_market_stores_owner_space_unique')
    .on(table.ownerSpaceId)
    .where(sql`${table.deletedAt} is null`),
  index('ark_market_stores_status_idx').on(table.status),
])

export const arkMarketJobs = arkTable('market_jobs', {
  id: uuidPk(),
  spaceId: uuid('space_id').notNull().references(() => arkSpaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  summary: text('summary'),
  description: text('description'),
  kind: text('kind').notNull().default('unknown'),
  status: marketJobStatusEnum('status').notNull().default('draft'),
  curationStatus: marketJobCurationStatusEnum('curation_status').notNull().default('parsed'),
  rating: integer('rating'),
  ratingReason: text('rating_reason'),
  aiConfidence: real('ai_confidence'),
  primaryCategoryId: uuid('primary_category_id').references(() => arkMarketCategories.id, { onDelete: 'set null' }),
  budgetAmount: numeric('budget_amount', { precision: 12, scale: 2 }),
  budgetMin: numeric('budget_min', { precision: 12, scale: 2 }),
  budgetMax: numeric('budget_max', { precision: 12, scale: 2 }),
  budgetCurrency: text('budget_currency'),
  location: text('location'),
  timezone: text('timezone'),
  remote: boolean('remote').notNull().default(true),
  responsePricingMode: responsePricingModeEnum('response_pricing_mode').notNull().default('free'),
  responseFeeAmount: numeric('response_fee_amount', { precision: 12, scale: 2 }),
  responseFeeCurrency: text('response_fee_currency'),
  commissionAmount: numeric('commission_amount', { precision: 12, scale: 2 }),
  commissionCurrency: text('commission_currency'),
  source: text('source'),
  sourceUrl: text('source_url'),
  externalId: text('external_id'),
  sourceLocale: text('source_locale').notNull().default('unknown'),
  contactJson: jsonb('contact_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  sourceRawJson: jsonb('source_raw_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  workflowJson: jsonb('workflow_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  discussionChannelId: uuid('discussion_channel_id').references(() => arkChannels.id, { onDelete: 'set null' }),
  createdByArkUserId: uuid('created_by_ark_user_id').references(() => arkUsers.id, { onDelete: 'set null' }),
  sourcePublishedAt: timestamp('source_published_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  ...timestamps(),
}, table => [
  uniqueIndex('ark_market_jobs_source_external_active_unique')
    .on(table.source, table.externalId)
    .where(sql`${table.source} is not null and ${table.externalId} is not null and ${table.deletedAt} is null`),
  index('ark_market_jobs_status_idx').on(table.status),
  index('ark_market_jobs_curation_status_idx').on(table.curationStatus),
  index('ark_market_jobs_source_published_at_idx').on(table.sourcePublishedAt),
  index('ark_market_jobs_published_at_idx').on(table.publishedAt),
  index('ark_market_jobs_rating_idx').on(table.rating),
  index('ark_market_jobs_curation_published_idx').on(table.curationStatus, table.publishedAt),
  index('ark_market_jobs_discussion_channel_idx').on(table.discussionChannelId),
  index('ark_market_jobs_primary_category_idx').on(table.primaryCategoryId),
])

function marketJoinTable(name: string, target: any) {
  return arkTable(name, {
    id: uuidPk(),
    jobId: uuid('job_id').notNull().references(() => arkMarketJobs.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id').notNull().references(() => target.id, { onDelete: 'cascade' }),
    ...timestamps(),
  }, table => [
    uniqueIndex(`${name}_job_target_unique`).on(table.jobId, table.targetId),
  ])
}

export const marketJobCategories = marketJoinTable('market_job_categories', arkMarketCategories)
export const marketJobSkills = marketJoinTable('market_job_skills', arkMarketSkills)
export const marketJobTools = marketJoinTable('market_job_tools', arkMarketTools)
export const marketJobStyles = marketJoinTable('market_job_styles', arkMarketStyles)
export const marketJobTags = marketJoinTable('market_job_tags', arkMarketTags)

function marketStoreJoinTable(name: string, target: any) {
  return arkTable(name, {
    id: uuidPk(),
    storeId: uuid('store_id').notNull().references(() => arkMarketStores.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id').notNull().references(() => target.id, { onDelete: 'cascade' }),
    ...timestamps(),
  }, table => [
    uniqueIndex(`${name}_store_target_unique`).on(table.storeId, table.targetId),
  ])
}

export const marketStoreCategories = marketStoreJoinTable('market_store_categories', arkMarketCategories)
export const marketStoreSkills = marketStoreJoinTable('market_store_skills', arkMarketSkills)
export const marketStoreTools = marketStoreJoinTable('market_store_tools', arkMarketTools)
export const marketStoreStyles = marketStoreJoinTable('market_store_styles', arkMarketStyles)
export const marketStoreTags = marketStoreJoinTable('market_store_tags', arkMarketTags)

export const arkNotifications = arkTable('notifications', {
  id: uuidPk(),
  kind: text('kind').notNull(),
  status: notificationStatusEnum('status').notNull().default('queued'),
  channel: text('channel').notNull().default('telegram'),
  targetType: text('target_type'),
  targetId: uuid('target_id'),
  recipientJson: jsonb('recipient_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  payloadJson: jsonb('payload_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  resultJson: jsonb('result_json').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  error: text('error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  ...timestamps(),
}, table => [
  index('ark_notifications_target_idx').on(table.targetType, table.targetId),
  index('ark_notifications_status_idx').on(table.status),
])

// Better Auth's adapter expects these conventional export names.
export const user = arkAuthUsers
export const session = arkAuthSessions
export const account = arkAuthAccounts
export const verification = arkAuthVerifications

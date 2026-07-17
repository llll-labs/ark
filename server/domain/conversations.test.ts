/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { eq } from 'drizzle-orm'
import { arkChannelCategories, arkChannelMembers, arkChannels, arkMessages, arkSpaces, arkUsers } from '../../db/schema'
import { resetDatabaseForTests, useDatabase } from '../utils/db'
import { withArkConversationTransaction } from './conversations'

async function withMigratedDatabase(run: (db: any) => Promise<void>) {
  const previousClient = process.env.DB_CLIENT
  const previousDir = process.env.DB_DATA_DIR
  const dir = await mkdtemp(join(tmpdir(), 'ark-conversations-'))
  process.env.DB_CLIENT = 'pglite'
  process.env.DB_DATA_DIR = join(dir, 'database')
  await resetDatabaseForTests()
  try {
    const db = useDatabase()
    await migrate(db as any, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) })
    await run(db)
  }
  finally {
    await resetDatabaseForTests()
    if (previousClient === undefined) delete process.env.DB_CLIENT
    else process.env.DB_CLIENT = previousClient
    if (previousDir === undefined) delete process.env.DB_DATA_DIR
    else process.env.DB_DATA_DIR = previousDir
    await rm(dir, { force: true, recursive: true })
  }
}

test('conversation Module owns idempotent channels, membership, messages, relations, and counters', async () => {
  await withMigratedDatabase(async (db) => {
    const [user] = await db.insert(arkUsers).values({ displayName: 'Tester', kind: 'human' }).returning()
    const [space] = await db.insert(arkSpaces).values({ kind: 'private', name: 'Test', slug: 'test', visibility: 'private' }).returning()
    const accountability = { arkUserId: user!.id, capabilities: [], spaceId: space!.id, system: false, userId: null }
    const result = await withArkConversationTransaction({ accountability, database: db }, async ({ conversations, services }) => {
      assert.ok(services.resource('ark.channels'))
      const category = await conversations.ensureCategory({
        name: 'Discussion',
        slug: 'discussion',
        spaceId: space!.id,
      })
      const sameCategory = await conversations.ensureCategory({
        name: 'Ignored',
        slug: 'discussion',
        spaceId: space!.id,
      })
      const channel = await conversations.createChannel({
        categoryId: category.id,
        createdByArkUserId: user!.id,
        identityKey: 'test:conversation',
        kind: 'forum',
        memberArkUserIds: [user!.id],
        name: 'Discussion',
        slug: 'discussion',
        spaceId: space!.id,
        visibility: 'public',
      })
      const sameChannel = await conversations.createChannel({
        identityKey: 'test:conversation',
        memberArkUserIds: [user!.id],
        name: 'Ignored',
        slug: 'ignored',
        spaceId: space!.id,
      })
      const root = await conversations.createMessage({ authorArkUserId: user!.id, body: 'Root', channelId: channel.id, spaceId: space!.id })
      const reply = await conversations.createMessage({
        authorArkUserId: user!.id,
        body: 'Reply',
        channelId: channel.id,
        relations: [{ relationType: 'forum_parent', targetId: root.id, targetType: 'message' }],
        spaceId: space!.id,
      })
      return { category, channel, reply, sameCategory, sameChannel }
    })

    assert.equal(result.sameCategory.id, result.category.id)
    assert.equal(result.sameChannel.id, result.channel.id)
    assert.equal(result.reply.rootMessageId !== null, true)
    assert.equal((await db.select().from(arkChannels).where(eq(arkChannels.id, result.channel.id)))[0]!.messagesCount, 2)
    assert.equal((await db.select().from(arkMessages)).length, 2)
    assert.equal((await db.select().from(arkChannelMembers)).length, 1)
    assert.equal((await db.select().from(arkChannelCategories)).length, 1)
  })
})

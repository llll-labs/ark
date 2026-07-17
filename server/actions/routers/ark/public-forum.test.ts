/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { arkChannels, arkFiles, arkMessages, arkSpaces } from '../../../../db/schema'
import { resetDatabaseForTests, useDatabase } from '../../../utils/db'
import { getChannelForAccess, messageWindow } from './shared'

test('public forum reads bypass portal membership without exposing other channels', async () => {
  const previousClient = process.env.DB_CLIENT
  const previousDir = process.env.DB_DATA_DIR
  const dir = await mkdtemp(join(tmpdir(), 'ark-public-forum-'))
  process.env.DB_CLIENT = 'pglite'
  process.env.DB_DATA_DIR = join(dir, 'database')
  await resetDatabaseForTests()

  try {
    const db = useDatabase()
    await migrate(db as any, {
      migrationsFolder: fileURLToPath(new URL('../../../../drizzle', import.meta.url)),
    })
    const [space] = await db.insert(arkSpaces).values({
      kind: 'public_square',
      name: 'Registered portal',
      slug: 'registered-portal',
      visibility: 'registered',
    }).returning()
    const [publicForum, privateForum, publicChannel] = await db.insert(arkChannels).values([
      { kind: 'forum', name: 'Public forum', slug: 'public-forum', spaceId: space!.id, visibility: 'public' },
      { kind: 'forum', name: 'Space forum', slug: 'space-forum', spaceId: space!.id, visibility: 'space' },
      { kind: 'chat', name: 'Public channel', slug: 'public-channel', spaceId: space!.id, visibility: 'public' },
    ]).returning()
    const ctx = {
      auth: {
        capabilitiesFor: async () => ({ arkUser: null, capabilities: [], spaceIds: [space!.id], spaces: [space] }),
        canReadChannel: async () => ({ allowed: false, channel: publicForum, reason: 'missing_capability' }),
      },
      db,
      session: null,
    }

    const result = await getChannelForAccess(publicForum!.id, ctx, 'messages.read', { publicRead: true })
    assert.equal(result.channel.id, publicForum!.id)
    assert.deepEqual(result.access.capabilities, [])
    await assert.rejects(
      getChannelForAccess(privateForum!.id, ctx, 'messages.read', { publicRead: true }),
      /Public forum access denied/,
    )
    await assert.rejects(
      getChannelForAccess(publicChannel!.id, ctx, 'messages.read', { publicRead: true }),
      /Public forum access denied/,
    )

    const [publicFile, privateFile] = await db.insert(arkFiles).values([
      {
        accessMode: 'public',
        bucket: 'public',
        filename: 'preview.png',
        mimeType: 'image/png',
        path: `public/${crypto.randomUUID()}.png`,
        storage: 'public',
        visibility: 'public',
      },
      {
        accessMode: 'space',
        bucket: 'private',
        filename: 'source.zip',
        mimeType: 'application/zip',
        path: `private/${crypto.randomUUID()}.zip`,
        storage: 'private',
        visibility: 'private',
      },
    ]).returning()
    const [message] = await db.insert(arkMessages).values({
      body: 'Public post',
      bodyJson: { attachmentFileIds: [publicFile!.id, privateFile!.id], privateTenantMetadata: 'do-not-expose', publicForum: true },
      channelId: publicForum!.id,
      spaceId: space!.id,
    }).returning()
    const window = await messageWindow(db, [message!], {
      next: false,
      previous: false,
      publicRead: true,
    })
    assert.deepEqual(window.items[0]!.attachments.map((file: any) => file.id), [publicFile!.id])
    assert.equal('path' in window.items[0]!.attachments[0], false)
    assert.deepEqual(window.items[0]!.bodyJson, { attachmentFileIds: [publicFile!.id], publicForum: true })
    await assert.rejects(
      getChannelForAccess(publicForum!.id, ctx, 'messages.create', { publicRead: true }),
      /Public forum access is read-only/,
    )
  }
  finally {
    await resetDatabaseForTests()
    if (previousClient === undefined)
      delete process.env.DB_CLIENT
    else
      process.env.DB_CLIENT = previousClient
    if (previousDir === undefined)
      delete process.env.DB_DATA_DIR
    else
      process.env.DB_DATA_DIR = previousDir
    await rm(dir, { force: true, recursive: true })
  }
})

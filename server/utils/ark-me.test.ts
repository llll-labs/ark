/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { migrate } from 'drizzle-orm/pglite/migrator'
import {
  arkAuthUsers,
  arkGrants,
  arkMembershipRoles,
  arkMemberships,
  arkRoles,
  arkSpaces,
  arkUsers,
} from '../../db/schema'
import { loadArkMeAccess } from './ark-me'
import { resetDatabaseForTests, useDatabase } from './db'

test('loadArkMeAccess returns effective access in one database round trip', async () => {
  const previousClient = process.env.DB_CLIENT
  const previousDir = process.env.DB_DATA_DIR
  const dir = await mkdtemp(join(tmpdir(), 'ark-me-access-'))
  process.env.DB_CLIENT = 'pglite'
  process.env.DB_DATA_DIR = join(dir, 'database')
  await resetDatabaseForTests()

  try {
    const db = useDatabase()
    await migrate(db as any, {
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    })
    const [authUser] = await db.insert(arkAuthUsers).values({
      email: 'me@example.test',
      emailVerified: true,
      name: 'Me User',
    }).returning()
    const [arkUser] = await db.insert(arkUsers).values({
      authUserId: authUser!.id,
      displayName: 'Me User',
      kind: 'human',
    }).returning()
    const [root] = await db.insert(arkSpaces).values({
      isDefault: true,
      kind: 'public_square',
      name: 'Public',
      slug: 'public',
      visibility: 'registered',
    }).returning()
    const [role] = await db.insert(arkRoles).values({
      key: 'member',
      name: 'Member',
      scopeId: root!.id,
      scopeType: 'space',
    }).returning()
    const [membership] = await db.insert(arkMemberships).values({
      arkUserId: arkUser!.id,
      scopeId: root!.id,
      scopeType: 'space',
      status: 'active',
    }).returning()
    await db.insert(arkMembershipRoles).values({
      membershipId: membership!.id,
      roleId: role!.id,
    })
    await db.insert(arkGrants).values([
      { action: 'channels.read', effect: 'allow', scopeId: root!.id, scopeType: 'space', subjectType: 'anon' },
      { action: 'messages.read', effect: 'allow', scopeId: root!.id, scopeType: 'space', subjectType: 'authenticated' },
      { action: 'forum.access', effect: 'allow', scopeId: root!.id, scopeType: 'space', subjectId: role!.id, subjectType: 'role' },
      { action: 'files.read', effect: 'allow', scopeId: root!.id, scopeType: 'space', subjectId: membership!.id, subjectType: 'membership' },
      { action: 'messages.read', effect: 'deny', scopeId: root!.id, scopeType: 'space', subjectId: role!.id, subjectType: 'role' },
      { action: 'spaces.read', effect: 'allow', scopeType: 'global', subjectType: 'authenticated' },
    ])

    let executeCalls = 0
    const countedDb = Object.create(db) as typeof db
    countedDb.execute = ((query: unknown) => {
      executeCalls += 1
      return db.execute(query as any)
    }) as typeof db.execute

    const access = await loadArkMeAccess(authUser!.id, countedDb)

    assert.equal(executeCalls, 1)
    assert.deepEqual(access.memberships.map(row => row.id), [membership!.id])
    assert.deepEqual(access.capabilities, [
      'channels.read',
      'files.read',
      'forum.access',
      'spaces.read',
    ])
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

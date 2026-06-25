/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { and, eq, isNull } from 'drizzle-orm'
import { arkAuthUsers, arkMemberships, arkSpaces, arkUsers } from '../../db/schema'
import { currentArkUser, ensureArkUser, ensureDefaultArk } from '../utils/authorization'
import { resetDatabaseForTests, useDatabase } from '../utils/db'

async function withMigratedDatabase(run: () => Promise<void>) {
  const previous = {
    adminEmail: process.env.ADMIN_EMAIL,
    adminPassword: process.env.ADMIN_PASSWORD,
    dbClient: process.env.DB_CLIENT,
    dbDataDir: process.env.DB_DATA_DIR,
  }
  const dir = await mkdtemp(join(tmpdir(), 'ark-hooks-'))
  process.env.DB_CLIENT = 'pglite'
  process.env.DB_DATA_DIR = join(dir, 'database')
  delete process.env.ADMIN_EMAIL
  delete process.env.ADMIN_PASSWORD
  await resetDatabaseForTests()
  try {
    await migrate(useDatabase() as any, {
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    })
    await run()
  }
  finally {
    await resetDatabaseForTests()
    restoreEnv('DB_CLIENT', previous.dbClient)
    restoreEnv('DB_DATA_DIR', previous.dbDataDir)
    restoreEnv('ADMIN_EMAIL', previous.adminEmail)
    restoreEnv('ADMIN_PASSWORD', previous.adminPassword)
    await rm(dir, { force: true, recursive: true })
  }
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined)
    delete process.env[key]
  else
    process.env[key] = value
}

test('ensureArkUser provisions a user and personal space through domain hooks', async () => {
  await withMigratedDatabase(async () => {
    const db = useDatabase()
    await ensureDefaultArk({ force: true })
    const [authUser] = await db.insert(arkAuthUsers).values({
      email: 'created@example.test',
      emailVerified: true,
      name: 'Created User',
    }).returning()

    const created = await ensureArkUser(authUser!)

    assert.equal(created.authUserId, authUser!.id)

    const personalSpaces = await db.select().from(arkSpaces).where(and(
      eq(arkSpaces.ownerArkUserId, created.id),
      eq(arkSpaces.kind, 'organization'),
      isNull(arkSpaces.deletedAt),
    ))
    assert.equal(personalSpaces.length, 1)

    const ownerMemberships = await db.select().from(arkMemberships).where(and(
      eq(arkMemberships.arkUserId, created.id),
      eq(arkMemberships.scopeId, personalSpaces[0]!.id),
      eq(arkMemberships.status, 'active'),
    ))
    assert.equal(ownerMemberships.length, 1)
  })
})

test('existing-user completion repairs personal space without duplicating it', async () => {
  await withMigratedDatabase(async () => {
    const db = useDatabase()
    await ensureDefaultArk({ force: true })
    const [authUser] = await db.insert(arkAuthUsers).values({
      email: 'existing@example.test',
      emailVerified: true,
      name: 'Existing User',
    }).returning()
    const [arkUser] = await db.insert(arkUsers).values({
      authUserId: authUser!.id,
      displayName: 'Existing User',
      kind: 'human',
    }).returning()

    await ensureArkUser(authUser!)
    await ensureArkUser(authUser!)

    const personalSpaces = await db.select().from(arkSpaces).where(and(
      eq(arkSpaces.ownerArkUserId, arkUser!.id),
      eq(arkSpaces.kind, 'organization'),
      isNull(arkSpaces.deletedAt),
    ))
    assert.equal(personalSpaces.length, 1)

    const ownerMemberships = await db.select().from(arkMemberships).where(and(
      eq(arkMemberships.arkUserId, arkUser!.id),
      eq(arkMemberships.scopeId, personalSpaces[0]!.id),
      eq(arkMemberships.status, 'active'),
    ))
    assert.equal(ownerMemberships.length, 1)
  })
})

test('currentArkUser remains read-only and does not repair personal space', async () => {
  await withMigratedDatabase(async () => {
    const db = useDatabase()
    await ensureDefaultArk({ force: true })
    const [authUser] = await db.insert(arkAuthUsers).values({
      email: 'readonly@example.test',
      emailVerified: true,
      name: 'Readonly User',
    }).returning()
    const [arkUser] = await db.insert(arkUsers).values({
      authUserId: authUser!.id,
      displayName: 'Readonly User',
      kind: 'human',
    }).returning()

    const found = await currentArkUser({ user: authUser } as any, { bypassRequestAuth: true, db })
    assert.equal(found?.id, arkUser!.id)

    const personalSpaces = await db.select().from(arkSpaces).where(and(
      eq(arkSpaces.ownerArkUserId, arkUser!.id),
      eq(arkSpaces.kind, 'organization'),
      isNull(arkSpaces.deletedAt),
    ))
    assert.equal(personalSpaces.length, 0)
  })
})

/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { eq } from 'drizzle-orm'
import { arkMarketSkills, arkMarketStores, arkSpaces, marketStoreSkills } from '../../db/schema'
import { resetDatabaseForTests, useDatabase } from '../utils/db'
import { createArkMarketService } from './market'

test('market Module owns store upserts and selectively replaces taxonomy targets', async () => {
  const previousClient = process.env.DB_CLIENT
  const previousDir = process.env.DB_DATA_DIR
  const dir = await mkdtemp(join(tmpdir(), 'ark-market-'))
  process.env.DB_CLIENT = 'pglite'
  process.env.DB_DATA_DIR = join(dir, 'database')
  await resetDatabaseForTests()
  try {
    const db = useDatabase()
    await migrate(db as any, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) })
    const [space] = await db.insert(arkSpaces).values({ kind: 'organization', name: 'Seller', slug: 'seller', visibility: 'private' }).returning()
    const [skill] = await db.insert(arkMarketSkills).values({ name: 'Modeling', slug: 'modeling' }).returning()
    const accountability = { arkUserId: null, capabilities: [], spaceId: space!.id, system: false, userId: null }
    const market = createArkMarketService({ accountability, database: db })

    const created = await market.upsertStore({
      name: 'Studio',
      ownerSpaceId: space!.id,
      skillIds: [skill!.id],
      status: 'draft',
    })
    const updated = await market.upsertStore({
      id: created.id,
      name: 'Studio Two',
      ownerSpaceId: space!.id,
      status: 'active',
    })

    assert.equal(updated.id, created.id)
    assert.equal(updated.name, 'Studio Two')
    assert.equal((await db.select().from(arkMarketStores)).length, 1)
    assert.deepEqual(
      (await db.select().from(marketStoreSkills).where(eq(marketStoreSkills.storeId, created.id))).map(row => row.targetId),
      [skill!.id],
    )
  }
  finally {
    await resetDatabaseForTests()
    if (previousClient === undefined) delete process.env.DB_CLIENT
    else process.env.DB_CLIENT = previousClient
    if (previousDir === undefined) delete process.env.DB_DATA_DIR
    else process.env.DB_DATA_DIR = previousDir
    await rm(dir, { force: true, recursive: true })
  }
})

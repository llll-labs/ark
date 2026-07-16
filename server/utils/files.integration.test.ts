/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { migrate } from 'drizzle-orm/pglite/migrator'
import test, { after, before } from 'node:test'
import { resetDatabaseForTests, useDatabase } from './db'
import { createArkPublicImageDerivative, deleteTrustedArkFileObject, storeFileFromBuffer } from './files'
import { resetStorageConfigForTests } from './storage'

const databaseDir = await mkdtemp(join(tmpdir(), 'ark-file-derivative-db-'))
process.env.DB_CLIENT = 'pglite'
process.env.DB_DATA_DIR = databaseDir

before(async () => {
  await migrate(useDatabase() as any, { migrationsFolder: resolve('drizzle') })
})

after(async () => {
  await resetDatabaseForTests()
  await rm(databaseDir, { force: true, recursive: true })
})

test('public image derivatives are separate sanitized WebP files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ark-derivative-'))
  process.env.STORAGE_LOCATIONS = 'local'
  process.env.STORAGE_LOCAL_DRIVER = 'local'
  process.env.STORAGE_LOCAL_ROOT = root
  resetStorageConfigForTests()

  const sharp = (await import('sharp')).default
  const sourceData = await sharp({
    create: { background: '#ff3300', channels: 4, height: 16, width: 16 },
  }).png().withMetadata({ comment: 'must not survive' }).toBuffer()
  const source = await storeFileFromBuffer({
    accessMode: 'signed_only',
    data: sourceData,
    mimeType: 'image/png',
    originalFilename: 'source.png',
    visibility: 'private',
  })
  const derivative = await createArkPublicImageDerivative({ sourceFileId: source.id })

  assert.notEqual(derivative.id, source.id)
  assert.equal(derivative.accessMode, 'public')
  assert.equal(derivative.visibility, 'public')
  assert.equal(derivative.mimeType, 'image/webp')
  assert.equal(derivative.metadataJson.sourceFileId, source.id)
  assert.equal(derivative.metadataJson.derivativeKind, 'sanitized_public_image')
  const deleted = await deleteTrustedArkFileObject({ expectedStorage: 'local', fileId: source.id })
  assert.equal(deleted?.id, source.id)
  await assert.rejects(() => deleteTrustedArkFileObject({ fileId: derivative.id }), /Public Ark files/)
})

/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { arkFileVariants } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import test, { after, before } from 'node:test'
import { resetDatabaseForTests, useDatabase } from './db'
import { createArkPublicImageDerivative, deleteTrustedArkFileObject, storeFileFromBuffer, uploadArkFileByUrl } from './files'
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

test('remote images keep one private original with public variants on the same file', async () => {
  const privateRoot = await mkdtemp(join(tmpdir(), 'ark-remote-private-'))
  const publicRoot = await mkdtemp(join(tmpdir(), 'ark-remote-public-'))
  process.env.STORAGE_LOCATIONS = 'private,public'
  process.env.STORAGE_PRIVATE_DRIVER = 'local'
  process.env.STORAGE_PRIVATE_ROOT = privateRoot
  process.env.STORAGE_PUBLIC_DRIVER = 'local'
  process.env.STORAGE_PUBLIC_ROOT = publicRoot
  process.env.STORAGE_PRIVATE_LOCATION = 'private'
  process.env.STORAGE_PUBLIC_LOCATION = 'public'
  resetStorageConfigForTests()

  const sharp = (await import('sharp')).default
  const sourceData = await sharp({
    create: { background: '#2255aa', channels: 4, height: 640, width: 960 },
  }).png().toBuffer()
  let fetchCount = 0
  const file = await uploadArkFileByUrl({
    metadataJson: { source: 'integration-test' },
    url: 'https://media.example.com/source.png',
  }, {
    async fetcher() {
      fetchCount++
      return new Response(sourceData, {
        headers: {
          'Content-Length': String(sourceData.length),
          'Content-Type': 'image/png',
        },
      })
    },
    async resolveHostname() {
      return ['93.184.216.34']
    },
  })

  assert.equal(fetchCount, 1)
  assert.equal(file.visibility, 'private')
  assert.equal(file.accessMode, 'signed_only')
  assert.equal(file.storage, 'private')
  assert.equal(file.mimeType, 'image/png')
  assert.equal(file.originalFilename, 'source.png')
  await access(join(privateRoot, file.path))

  const variants = await useDatabase().select().from(arkFileVariants)
    .where(eq(arkFileVariants.fileId, file.id))
  assert.deepEqual(variants.map(variant => variant.kind).sort(), ['preview', 'thumb'])
  assert.deepEqual([...new Set(variants.map(variant => variant.storage))], ['public'])
  for (const variant of variants)
    await access(join(publicRoot, variant.path))
})

test('remote file imports reject private network targets before fetching', async () => {
  let fetchCount = 0
  await assert.rejects(() => uploadArkFileByUrl({
    url: 'https://metadata.example.test/file.png',
  }, {
    async fetcher() {
      fetchCount++
      return new Response('not reached')
    },
    async resolveHostname() {
      return ['169.254.169.254']
    },
  }), /private address/)
  assert.equal(fetchCount, 0)
})

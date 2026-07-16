/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { arkFileUploads, arkSpaces, arkUsers } from '../../db/schema'
import { resetDatabaseForTests, useDatabase } from './db'
import { createDirectUploadUrl, resetStorageConfigForTests, resolveStorageLocation } from './storage'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import test, { after, before } from 'node:test'
import {
  abortArkFileUpload,
  cleanupExpiredArkFileUploads,
  createArkFileUpload,
  finalizeArkFileUpload,
  validateArkFileUploadInput,
} from './file-uploads'

const previousStorageEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('STORAGE_')))
const databaseDir = await mkdtemp(join(tmpdir(), 'ark-file-uploads-db-'))
process.env.DB_CLIENT = 'pglite'
process.env.DB_DATA_DIR = databaseDir

before(async () => {
  await migrate(useDatabase() as any, { migrationsFolder: resolve('drizzle') })
})

function configureTestS3() {
  process.env.STORAGE_LOCATIONS = 'private'
  process.env.STORAGE_PRIVATE_BUCKET = 'ark-test-private'
  process.env.STORAGE_PRIVATE_DRIVER = 's3'
  process.env.STORAGE_PRIVATE_ENDPOINT = 'https://s3.example.test'
  process.env.STORAGE_PRIVATE_KEY = 'test-key'
  process.env.STORAGE_PRIVATE_REGION = 'auto'
  process.env.STORAGE_PRIVATE_SECRET = 'test-secret'
  resetStorageConfigForTests()
}

after(async () => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('STORAGE_'))
      delete process.env[key]
  }
  Object.assign(process.env, previousStorageEnv)
  resetStorageConfigForTests()
  await resetDatabaseForTests()
  await rm(databaseDir, { force: true, recursive: true })
})

test('direct upload validation accepts the v1 5 GB limit and rejects larger files', () => {
  const input = {
    accessMode: 'signed_only' as const,
    arkUserId: crypto.randomUUID(),
    mimeType: 'application/zip',
    originalFilename: 'bundle.zip',
    sizeBytes: 5_000_000_000,
    spaceId: crypto.randomUUID(),
  }
  assert.equal(validateArkFileUploadInput(input).mimeType, 'application/zip')
  assert.throws(() => validateArkFileUploadInput({ ...input, sizeBytes: 5_000_000_001 }), /between 1 and 5000000000/)
  assert.throws(() => validateArkFileUploadInput({ ...input, mimeType: 'not-a-mime' }), /MIME type/)
})

test('presigned PUT binds size and create-only semantics without an empty-body checksum', async () => {
  configureTestS3()
  const url = new URL(await createDirectUploadUrl(
    resolveStorageLocation('private'),
    'files/test.zip',
    'application/zip',
    123,
  ))
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'content-length;host;if-none-match')
  assert.equal(url.searchParams.has('x-amz-checksum-crc32'), false)
  assert.equal(url.searchParams.has('x-amz-sdk-checksum-algorithm'), false)
})

test('single-PUT upload sessions finalize idempotently into bigint-safe signed-only files', async () => {
  configureTestS3()
  const db = useDatabase()
  const suffix = crypto.randomUUID()
  const [user] = await db.insert(arkUsers).values({ displayName: `Uploader ${suffix}` }).returning()
  const [space] = await db.insert(arkSpaces).values({
    kind: 'organization',
    name: `Space ${suffix}`,
    ownerArkUserId: user.id,
    slug: `space-${suffix}`,
  }).returning()
  const created = await createArkFileUpload({
    accessMode: 'signed_only',
    arkUserId: user.id,
    mimeType: 'application/zip',
    originalFilename: 'bundle.zip',
    sizeBytes: 5_000_000_000,
    spaceId: space.id,
  }, {
    createUploadUrl: async () => 'https://s3.example.test/upload',
  })
  assert.equal(created.method, 'PUT')
  assert.equal(created.headers['Content-Type'], 'application/zip')
  assert.equal(created.headers['If-None-Match'], '*')

  const headObject = async () => ({
    contentLength: 5_000_000_000,
    contentType: 'application/zip; charset=binary',
    etag: 'test-etag',
  })
  const file = await finalizeArkFileUpload({ arkUserId: user.id, uploadId: created.id }, { headObject })
  assert.equal(file.id, created.fileId)
  assert.equal(file.accessMode, 'signed_only')
  assert.equal(file.sizeBytes, 5_000_000_000)
  assert.equal(file.checksum, 'etag:test-etag')
  assert.equal(file.metadataJson.spaceId, space.id)

  const retried = await finalizeArkFileUpload({ arkUserId: user.id, uploadId: created.id }, { headObject })
  assert.equal(retried.id, file.id)
  await assert.rejects(
    () => abortArkFileUpload({ arkUserId: user.id, uploadId: created.id }, { deleteObject: async () => {} }),
    /finalized upload cannot be aborted/,
  )
})

test('finalization refuses object metadata that differs from the declared upload', async () => {
  configureTestS3()
  const db = useDatabase()
  const suffix = crypto.randomUUID()
  const [user] = await db.insert(arkUsers).values({ displayName: `Mismatch ${suffix}` }).returning()
  const [space] = await db.insert(arkSpaces).values({ name: `Mismatch ${suffix}`, slug: `mismatch-${suffix}` }).returning()
  const created = await createArkFileUpload({
    arkUserId: user.id,
    mimeType: 'image/png',
    originalFilename: 'preview.png',
    sizeBytes: 100,
    spaceId: space.id,
  }, { createUploadUrl: async () => 'https://s3.example.test/upload' })

  await assert.rejects(() => finalizeArkFileUpload({ arkUserId: user.id, uploadId: created.id }, {
    headObject: async () => ({ contentLength: 99, contentType: 'image/png', etag: 'wrong' }),
  }), /size does not match/)
})

test('cleanup expires only sessions whose object deletion succeeds', async () => {
  configureTestS3()
  const db = useDatabase()
  const suffix = crypto.randomUUID()
  const [user] = await db.insert(arkUsers).values({ displayName: `Cleanup ${suffix}` }).returning()
  const [space] = await db.insert(arkSpaces).values({ name: `Cleanup ${suffix}`, slug: `cleanup-${suffix}` }).returning()
  const createdAt = new Date('2026-01-01T00:00:00Z')
  const upload = await createArkFileUpload({
    arkUserId: user.id,
    mimeType: 'application/zip',
    originalFilename: 'abandoned.zip',
    sizeBytes: 100,
    spaceId: space.id,
  }, {
    createUploadUrl: async () => 'https://s3.example.test/upload',
    now: createdAt,
  })
  const deleted: string[] = []
  const result = await cleanupExpiredArkFileUploads({ now: new Date('2026-01-01T01:00:00Z') }, {
    deleteObject: async ref => void deleted.push(ref.path),
  })
  assert.deepEqual(result.expired, [upload.id])
  assert.equal(result.failed.length, 0)
  assert.equal(deleted.length, 1)
  await assert.rejects(
    () => finalizeArkFileUpload({ arkUserId: user.id, uploadId: upload.id }, { headObject: async () => ({ contentLength: 100, contentType: 'application/zip', etag: 'late' }) }),
    /expired/,
  )
})

test('abort claims the session before deletion and cleanup retries a failed delete', async () => {
  configureTestS3()
  const db = useDatabase()
  const suffix = crypto.randomUUID()
  const [user] = await db.insert(arkUsers).values({ displayName: `Abort ${suffix}` }).returning()
  const [space] = await db.insert(arkSpaces).values({ name: `Abort ${suffix}`, slug: `abort-${suffix}` }).returning()
  const createdAt = new Date('2026-01-01T00:00:00Z')
  const upload = await createArkFileUpload({
    arkUserId: user.id,
    mimeType: 'application/zip',
    originalFilename: 'abort.zip',
    sizeBytes: 100,
    spaceId: space.id,
  }, { createUploadUrl: async () => 'https://s3.example.test/upload', now: createdAt })

  await assert.rejects(() => abortArkFileUpload({ arkUserId: user.id, uploadId: upload.id }, {
    deleteObject: async () => { throw new Error('temporary storage failure') },
    now: new Date('2026-01-01T01:00:00Z'),
  }), /temporary storage failure/)
  const [claimed] = await db.select().from(arkFileUploads).where(eq(arkFileUploads.id, upload.id))
  assert.equal(claimed.status, 'aborted')
  assert.equal(claimed.objectDeletedAt, null)
  await assert.rejects(() => finalizeArkFileUpload({ arkUserId: user.id, uploadId: upload.id }), /aborted/)

  const retried = await cleanupExpiredArkFileUploads({}, { deleteObject: async () => {} })
  assert.equal(retried.failed.length, 0)
  const [cleaned] = await db.select().from(arkFileUploads).where(eq(arkFileUploads.id, upload.id))
  assert.ok(cleaned.objectDeletedAt)
})

test('abort defers object deletion until the upload URL expires', async () => {
  configureTestS3()
  const db = useDatabase()
  const suffix = crypto.randomUUID()
  const [user] = await db.insert(arkUsers).values({ displayName: `Deferred abort ${suffix}` }).returning()
  const [space] = await db.insert(arkSpaces).values({ name: `Deferred abort ${suffix}`, slug: `deferred-abort-${suffix}` }).returning()
  const createdAt = new Date('2026-01-01T00:00:00Z')
  const upload = await createArkFileUpload({
    arkUserId: user.id,
    mimeType: 'application/zip',
    originalFilename: 'deferred.zip',
    sizeBytes: 100,
    spaceId: space.id,
  }, { createUploadUrl: async () => 'https://s3.example.test/upload', now: createdAt })
  let deletions = 0
  const beforeExpiry = new Date('2026-01-01T00:05:00Z')
  const aborted = await abortArkFileUpload({ arkUserId: user.id, uploadId: upload.id }, {
    deleteObject: async () => { deletions++ },
    now: beforeExpiry,
  })
  assert.equal(aborted.status, 'aborted')
  assert.equal(deletions, 0)
  await cleanupExpiredArkFileUploads({ now: beforeExpiry }, { deleteObject: async () => { deletions++ } })
  assert.equal(deletions, 0)

  await cleanupExpiredArkFileUploads({ now: new Date('2026-01-01T01:00:00Z') }, {
    deleteObject: async () => { deletions++ },
  })
  assert.equal(deletions, 1)
})

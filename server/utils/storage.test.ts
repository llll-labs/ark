/* eslint-disable test/no-import-node-test */
import type { Readable } from 'node:stream'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  buildSignedFileUrl,
  parseStorageConfig,
  putStoredObject,
  readStoredObject,
  resetStorageConfigForTests,
  verifySignedFileUrl,
} from './storage'

async function streamToBuffer(stream: Readable) {
  const chunks: Buffer[] = []
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))

  return Buffer.concat(chunks)
}

test('parseStorageConfig defaults to a Directus-like local location', () => {
  const config = parseStorageConfig({})

  assert.equal(config.defaultPrivateLocation, 'local')
  assert.equal(config.defaultPublicLocation, 'local')
  assert.equal(config.locations.local.driver, 'local')
  assert.equal(config.locations.local.bucket, 'local')
  assert.ok(config.locations.local.root.endsWith('.ark/5400/uploads'))
})

test('parseStorageConfig scopes default local storage by PORT', () => {
  const config = parseStorageConfig({
    PORT: '5412',
  })

  assert.equal(config.locations.local.driver, 'local')
  assert.ok(config.locations.local.root.endsWith('.ark/5412/uploads'))
})

test('parseStorageConfig reads Directus-like S3 locations', () => {
  const config = parseStorageConfig({
    STORAGE_AUTO_CREATE_BUCKETS: 'true',
    STORAGE_LOCATIONS: 'private,public',
    STORAGE_PRIVATE_BUCKET: 'ark-files-private',
    STORAGE_PRIVATE_ENDPOINT: 'http://localhost:5402',
    STORAGE_PRIVATE_FORCE_PATH_STYLE: 'true',
    STORAGE_PRIVATE_KEY: 'rustfsadmin',
    STORAGE_PRIVATE_REGION: 'auto',
    STORAGE_PRIVATE_SECRET: 'rustfsadmin',
    STORAGE_PUBLIC_BUCKET: 'ark-files-public',
    STORAGE_PUBLIC_ENDPOINT: 'http://localhost:5402',
    STORAGE_PUBLIC_KEY: 'rustfsadmin',
    STORAGE_PUBLIC_PUBLIC_URL: 'https://cdn.example.test/files',
    STORAGE_PUBLIC_SECRET: 'rustfsadmin',
  })

  assert.equal(config.defaultPrivateLocation, 'private')
  assert.equal(config.defaultPublicLocation, 'public')
  assert.equal(config.autoCreateBuckets, true)
  assert.equal(config.locations.private.driver, 's3')
  assert.equal(config.locations.private.bucket, 'ark-files-private')
  assert.equal(config.locations.private.forcePathStyle, true)
  assert.equal(config.locations.public.publicUrl, 'https://cdn.example.test/files')
})

test('parseStorageConfig reads Directus-like local locations', () => {
  const config = parseStorageConfig({
    STORAGE_LOCAL_DRIVER: 'local',
    STORAGE_LOCAL_ROOT: '/tmp/ark-uploads',
    STORAGE_LOCATIONS: 'local',
  })

  assert.equal(config.defaultPrivateLocation, 'local')
  assert.equal(config.locations.local.driver, 'local')
  assert.equal(config.locations.local.root, '/tmp/ark-uploads')
})

test('parseStorageConfig rejects unknown drivers', () => {
  assert.throws(() => parseStorageConfig({
    STORAGE_LOCAL_DRIVER: 'ftp',
    STORAGE_LOCATIONS: 'local',
  }), /driver=local or driver=s3/)
})

test('parseStorageConfig requires S3 credentials and bucket', () => {
  assert.throws(() => parseStorageConfig({
    STORAGE_LOCATIONS: 'private',
    STORAGE_PRIVATE_BUCKET: 'ark-files-private',
  }), /STORAGE_PRIVATE_KEY is required/)
})

test('local storage writes and reads from the configured root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ark-storage-'))
  const previousEnv = {
    STORAGE_LOCAL_DRIVER: process.env.STORAGE_LOCAL_DRIVER,
    STORAGE_LOCAL_ROOT: process.env.STORAGE_LOCAL_ROOT,
    STORAGE_LOCATIONS: process.env.STORAGE_LOCATIONS,
  }

  process.env.STORAGE_LOCAL_DRIVER = 'local'
  process.env.STORAGE_LOCAL_ROOT = root
  process.env.STORAGE_LOCATIONS = 'local'
  resetStorageConfigForTests()

  try {
    const config = parseStorageConfig(process.env)
    const location = config.locations.local

    await putStoredObject(location, 'aa/file.txt', Buffer.from('hello'), 'text/plain')
    const body = await streamToBuffer(await readStoredObject({
      bucket: location.bucket,
      path: 'aa/file.txt',
      storage: location.name,
    }))

    assert.equal(body.toString('utf8'), 'hello')
  }
  finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value == null)
        delete process.env[key]
      else
        process.env[key] = value
    }
    resetStorageConfigForTests()
  }
})

test('local signed file URLs validate expiry and signature', () => {
  const env = {
    BETTER_AUTH_SECRET: 'test-secret',
    BETTER_AUTH_URL: 'http://localhost:5400',
    FILES_SIGNED_URL_EXPIRES: '60',
  }
  const now = 1_700_000_000_000
  const url = new URL(buildSignedFileUrl({
    disposition: 'attachment',
    id: '018f0000-0000-7000-8000-000000000000',
    variant: 'thumb',
  }, env, now))

  const input = {
    disposition: url.searchParams.get('disposition'),
    expires: url.searchParams.get('expires') ?? undefined,
    id: '018f0000-0000-7000-8000-000000000000',
    signature: url.searchParams.get('sig') ?? undefined,
    variant: url.searchParams.get('variant'),
    version: url.searchParams.get('v') ?? undefined,
  }

  assert.equal(verifySignedFileUrl(input, env, now), true)
  assert.equal(verifySignedFileUrl({ ...input, variant: 'preview' }, env, now), false)
  assert.equal(verifySignedFileUrl(input, env, now + 61_000), false)
})

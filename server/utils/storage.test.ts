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
  deleteStoredObject,
  normalizeStoragePrefix,
  parseStorageConfig,
  publicObjectUrl,
  putStoredObject,
  readStoredObject,
  resetStorageConfigForTests,
  storageObjectPath,
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
    STORAGE_PRIVATE_PREFIX: 'p3100-example/',
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
  assert.equal(config.locations.private.prefix, 'p3100-example/')
  assert.equal(config.locations.public.publicUrl, 'https://cdn.example.test/files')
})

test('storage prefixes are normalized and applied behind the storage interface', () => {
  assert.equal(normalizeStoragePrefix('cells/p3100-example/'), 'cells/p3100-example/')
  assert.equal(normalizeStoragePrefix(''), '')
  assert.equal(storageObjectPath({ prefix: 'p3100-example/' }, 'file-id.zip'), 'p3100-example/file-id.zip')
  assert.throws(() => normalizeStoragePrefix('../other-cell'), /Invalid storage prefix/)
  assert.throws(() => storageObjectPath({ prefix: 'p3100-example/' }, '../other-cell/file-id.zip'), /unsafe/)
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
    STORAGE_LOCAL_PREFIX: process.env.STORAGE_LOCAL_PREFIX,
    STORAGE_LOCAL_ROOT: process.env.STORAGE_LOCAL_ROOT,
    STORAGE_LOCATIONS: process.env.STORAGE_LOCATIONS,
  }

  process.env.STORAGE_LOCAL_DRIVER = 'local'
  process.env.STORAGE_LOCAL_ROOT = root
  process.env.STORAGE_LOCATIONS = 'local'
  process.env.STORAGE_LOCAL_PREFIX = 'p5412-local'
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

    await deleteStoredObject(location, 'aa/file.txt')
    await assert.rejects(
      async () => streamToBuffer(await readStoredObject({
        bucket: location.bucket,
        path: 'aa/file.txt',
        storage: location.name,
      })),
    )
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

test('public object URLs include the physical storage prefix', () => {
  const previousEnv = {
    STORAGE_LOCATIONS: process.env.STORAGE_LOCATIONS,
    STORAGE_PUBLIC_BUCKET: process.env.STORAGE_PUBLIC_BUCKET,
    STORAGE_PUBLIC_DRIVER: process.env.STORAGE_PUBLIC_DRIVER,
    STORAGE_PUBLIC_ENDPOINT: process.env.STORAGE_PUBLIC_ENDPOINT,
    STORAGE_PUBLIC_KEY: process.env.STORAGE_PUBLIC_KEY,
    STORAGE_PUBLIC_PREFIX: process.env.STORAGE_PUBLIC_PREFIX,
    STORAGE_PUBLIC_PUBLIC_URL: process.env.STORAGE_PUBLIC_PUBLIC_URL,
    STORAGE_PUBLIC_SECRET: process.env.STORAGE_PUBLIC_SECRET,
  }

  Object.assign(process.env, {
    STORAGE_LOCATIONS: 'public',
    STORAGE_PUBLIC_BUCKET: 'shared-public',
    STORAGE_PUBLIC_DRIVER: 's3',
    STORAGE_PUBLIC_ENDPOINT: 'https://s3.example.test',
    STORAGE_PUBLIC_KEY: 'key',
    STORAGE_PUBLIC_PREFIX: 'p3100-example',
    STORAGE_PUBLIC_PUBLIC_URL: 'https://cdn.example.test/files',
    STORAGE_PUBLIC_SECRET: 'secret',
  })
  resetStorageConfigForTests()

  try {
    assert.equal(publicObjectUrl({
      bucket: 'shared-public',
      path: 'images/cover image.webp',
      storage: 'public',
    }), 'https://cdn.example.test/files/p3100-example/images/cover%20image.webp')
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

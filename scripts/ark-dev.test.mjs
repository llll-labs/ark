import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertDestructiveCell,
  buildRuntimeOverlay,
  derivedDatabaseUrl,
  emptyBucket,
  ensureMeiliIndexes,
  resolveCell,
  resolveMeiliIndexes,
  resolveStorageLocations,
} from './ark-dev.mjs'

function fixtureEnv() {
  return {
    ARK_DEV_BASE_URL: 'https://dev.example.com',
    ARK_DEV_MEILISEARCH_INDEXES: 'MEILISEARCH_ASSETS_INDEX',
    ARK_DEV_PORT_RANGE: '3100-3199',
    ARK_DEV_SLOT: 'example-app-alice',
    ARK_DEV_STORAGE_ISOLATION: 'prefix',
    ARK_DEV_STORAGE_LOCATIONS: 'public,private,quarantine',
    BETTER_AUTH_TRUSTED_ORIGINS: 'https://stage.example.com',
    DATABASE_URL: 'postgres://user:password@pg.example.com/stage_app?sslmode=require',
    MEILISEARCH_ASSETS_INDEX: 'assets',
    STORAGE_PRIVATE_DRIVER: 's3',
    STORAGE_PRIVATE_BUCKET: 'stage-private',
    STORAGE_PRIVATE_ENDPOINT: 'https://s3.example.com',
    STORAGE_PRIVATE_KEY: 'key',
    STORAGE_PRIVATE_SECRET: 'secret',
    STORAGE_PUBLIC_DRIVER: 's3',
    STORAGE_PUBLIC_BUCKET: 'stage-public',
    STORAGE_PUBLIC_ENDPOINT: 'https://s3.example.com',
    STORAGE_PUBLIC_KEY: 'key',
    STORAGE_PUBLIC_SECRET: 'secret',
    STORAGE_QUARANTINE_DRIVER: 's3',
    STORAGE_QUARANTINE_BUCKET: 'stage-quarantine',
    STORAGE_QUARANTINE_ENDPOINT: 'https://s3.example.com',
    STORAGE_QUARANTINE_KEY: 'key',
    STORAGE_QUARANTINE_SECRET: 'secret',
  }
}

test('uses one exact Cell ID across URL, indexes, and shared bucket prefixes', () => {
  const env = fixtureEnv()
  const cell = resolveCell(env, 3150)
  const indexes = resolveMeiliIndexes(env, cell)
  const locations = resolveStorageLocations(env, cell)

  assert.equal(cell.id, 'p3150-example-app-alice')
  assert.equal(cell.publicUrl, 'https://p3150-example-app-alice.dev.example.com')
  assert.deepEqual(indexes.map(item => item.uid), ['p3150-example-app-alice-assets'])
  assert.deepEqual(locations.map(item => item.bucket), [
    'stage-public',
    'stage-private',
    'stage-quarantine',
  ])
  assert.deepEqual(locations.map(item => item.objectPrefix), [
    'p3150-example-app-alice/',
    'p3150-example-app-alice/',
    'p3150-example-app-alice/',
  ])
  assert.doesNotThrow(() => assertDestructiveCell(cell))
})

test('rejects a port outside the tenant range', () => {
  assert.throws(() => resolveCell(fixtureEnv(), 3200), /outside ARK_DEV_PORT_RANGE/)
})

test('prefix overlay keeps base env external and preserves fixed public URLs', () => {
  const env = fixtureEnv()
  const cell = resolveCell(env, 3150)
  const indexes = resolveMeiliIndexes(env, cell)
  const locations = resolveStorageLocations(env, cell)
  const overlay = buildRuntimeOverlay(env, cell, indexes, locations)

  assert.equal(overlay.MEILISEARCH_ASSETS_INDEX, 'p3150-example-app-alice-assets')
  assert.equal(overlay.STORAGE_PUBLIC_BUCKET, 'stage-public')
  assert.equal(overlay.STORAGE_PUBLIC_PREFIX, 'p3150-example-app-alice/')
  assert.equal(overlay.STORAGE_PUBLIC_PUBLIC_URL, undefined)
  assert.equal(overlay.STORAGE_AUTO_CREATE_BUCKETS, 'false')
  assert.equal(overlay.BETTER_AUTH_URL, cell.publicUrl)
  assert.match(overlay.BETTER_AUTH_TRUSTED_ORIGINS, /http:\/\/localhost:3150/)
  assert.equal(env.MEILISEARCH_ASSETS_INDEX, 'assets')
})

test('keeps per-Cell bucket isolation as the compatibility default', () => {
  const env = fixtureEnv()
  delete env.ARK_DEV_STORAGE_ISOLATION
  const cell = resolveCell(env, 3150)
  const locations = resolveStorageLocations(env, cell)
  assert.deepEqual(locations.map(item => item.bucket), [
    'p3150-example-app-alice-public',
    'p3150-example-app-alice-private',
    'p3150-example-app-alice-quarantine',
  ])
  assert.deepEqual(locations.map(item => item.objectPrefix), ['', '', ''])
})

test('shared bucket cleanup lists and deletes only the exact Cell prefix', async () => {
  const calls = []
  const client = {
    async send(command) {
      calls.push({ input: command.input, name: command.constructor.name })
      if (command.constructor.name === 'ListObjectVersionsCommand') {
        return {
          DeleteMarkers: [{ Key: 'p3150-example-app-alice/deleted.zip', VersionId: 'marker' }],
          IsTruncated: false,
          Versions: [{ Key: 'p3150-example-app-alice/file.zip', VersionId: 'version' }],
        }
      }
      if (command.constructor.name === 'ListObjectsV2Command')
        return { Contents: [{ Key: 'p3150-example-app-alice/current.zip' }] }
      return {}
    },
  }

  await emptyBucket(client, 'stage-private', 'p3150-example-app-alice/')

  const lists = calls.filter(call => call.name.startsWith('List'))
  assert.equal(lists.length, 2)
  assert.ok(lists.every(call => call.input.Prefix === 'p3150-example-app-alice/'))
  const deletedKeys = calls.filter(call => call.name === 'DeleteObjectsCommand')
    .flatMap(call => call.input.Delete.Objects.map(item => item.Key))
  assert.deepEqual(deletedKeys, [
    'p3150-example-app-alice/file.zip',
    'p3150-example-app-alice/deleted.zip',
    'p3150-example-app-alice/current.zip',
  ])
})

test('derived database URL preserves credentials and query options', () => {
  assert.equal(
    derivedDatabaseUrl('postgres://user:password@pg.example.com/stage_app?sslmode=require', 'p3150-example-app-alice'),
    'postgres://user:password@pg.example.com/p3150-example-app-alice?sslmode=require',
  )
})

test('existing Meilisearch indexes are preserved without a create task', async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url) => {
    requests.push(String(url))
    return new Response('{}', { status: 200 })
  }
  try {
    await ensureMeiliIndexes({ MEILISEARCH_URL: 'https://meili.example.com' }, [{ uid: 'p3150-example-app-alice-assets' }])
  }
  finally {
    globalThis.fetch = originalFetch
  }
  assert.deepEqual(requests, ['https://meili.example.com/indexes/p3150-example-app-alice-assets'])
})

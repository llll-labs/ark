/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveDatabaseConfig } from './db'

test('resolveDatabaseConfig defaults to PGlite without database envs', () => {
  const config = resolveDatabaseConfig({})

  assert.equal(config.client, 'pglite')
  assert.ok(config.dataDir?.endsWith('.ark/5400/database'))
})

test('resolveDatabaseConfig scopes the default PGlite path by PORT', () => {
  const config = resolveDatabaseConfig({
    PORT: '5412',
  })

  assert.equal(config.client, 'pglite')
  assert.ok(config.dataDir?.endsWith('.ark/5412/database'))
})

test('resolveDatabaseConfig selects Postgres when DATABASE_URL is present', () => {
  const config = resolveDatabaseConfig({
    DATABASE_URL: 'postgres://ark:ark@localhost:5401/ark',
  })

  assert.equal(config.client, 'postgres')
  assert.equal(config.url, 'postgres://ark:ark@localhost:5401/ark')
})

test('resolveDatabaseConfig honors explicit PGlite config', () => {
  const config = resolveDatabaseConfig({
    DATABASE_URL: 'postgres://ark:ark@localhost:5401/ark',
    DB_CLIENT: 'pglite',
    DB_DATA_DIR: 'memory://',
  })

  assert.equal(config.client, 'pglite')
  assert.equal(config.dataDir, 'memory://')
})

test('resolveDatabaseConfig requires DATABASE_URL for explicit Postgres', () => {
  assert.throws(() => resolveDatabaseConfig({
    DB_CLIENT: 'postgres',
  }), /DATABASE_URL is required/)
})

/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import { pgTable, text } from 'drizzle-orm/pg-core'
import { resetDatabaseForTests } from '../utils/db'
import { arkOpenApiDocument } from './openapi'
import { adoptArkResource, resetArkResourcesForTests } from './registry'

const notes = pgTable('openapi_notes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
})

test('OpenAPI separates knowledge Actions from Resources and declares Resource auth', async () => {
  try {
    resetArkResourcesForTests()
    adoptArkResource({ name: 'notes', table: notes })

    const document = arkOpenApiDocument() as any
    assert.ok(document.paths['/api/ark/knowledge/items/actions/create']?.post)
    assert.equal(document.paths['/api/ark/items/actions/create'], undefined)
    assert.deepEqual(document.paths['/api/ark/items/notes'].get.security, [{ betterAuth: [] }])
    assert.deepEqual(document.paths['/api/ark/items/notes'].post.security, [{ betterAuth: [] }])
    assert.deepEqual(document.paths['/api/ark/items/notes/{id}'].patch.security, [{ betterAuth: [] }])
  }
  finally {
    await resetDatabaseForTests()
  }
})

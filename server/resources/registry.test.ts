/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import { pgTable, text } from 'drizzle-orm/pg-core'
import { adoptArkResource, getArkResource, registerArkResource, replaceAdoptedArkResources, resetArkResourcesForTests } from './registry'

const jobs = pgTable('resource_registry_jobs', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
})

test('adopted Resources enable single-item CRUD but disable deletion by default', () => {
  resetArkResourcesForTests()
  const resource = adoptArkResource({ name: 'registry_jobs', table: jobs })

  assert.deepEqual(resource.operations, {
    create: true,
    delete: false,
    read: true,
    update: true,
  })
  assert.equal(resource.deletion, 'disabled')
})

test('code registration takes precedence over compatible adopted metadata', () => {
  resetArkResourcesForTests()
  registerArkResource({
    name: 'registry_jobs',
    operations: { read: true },
    table: jobs,
  })
  adoptArkResource({ name: 'registry_jobs', table: jobs })

  assert.equal(getArkResource('registry_jobs')?.source, 'code')
  assert.equal(getArkResource('registry_jobs')?.operations.create, false)
})

test('only code-owned Resources may use the ark prefix', () => {
  resetArkResourcesForTests()
  assert.throws(
    () => adoptArkResource({ name: 'ark.registry_jobs', table: jobs }),
    /Only code-owned Ark Resources/,
  )
})

test('replacing persisted Resources removes stale adopted names but preserves code registrations', () => {
  resetArkResourcesForTests()
  adoptArkResource({ name: 'old_jobs', table: jobs })
  registerArkResource({ name: 'ark.jobs', operations: { read: true }, table: jobs })

  replaceAdoptedArkResources([{ name: 'new_jobs', table: jobs }])

  assert.equal(getArkResource('old_jobs'), null)
  assert.equal(getArkResource('new_jobs')?.source, 'adopted')
  assert.equal(getArkResource('ark.jobs')?.source, 'code')
})

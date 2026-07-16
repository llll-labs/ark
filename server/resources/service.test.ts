/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { arkResourceHooks, resetArkResourceHooksForTests } from './hooks'
import { adoptArkResource, getArkResource, registerArkResource, resetArkResourcesForTests } from './registry'
import { ArkResourceService } from './service'

const jobs = pgTable('resource_service_jobs', {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  title: text('title').notNull(),
})

const jobAudits = pgTable('resource_service_job_audits', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull(),
})

const relationAuthors = pgTable('resource_relation_authors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})

const relationPosts = pgTable('resource_relation_posts', {
  authorId: text('author_id').notNull(),
  id: text('id').primaryKey(),
  title: text('title').notNull(),
})

test('Resource reads explicitly expand relations through target permissions', async () => {
  const client = new PGlite()
  const database = drizzle(client)
  await database.execute(sql`create table resource_relation_authors (id text primary key, name text not null)`)
  await database.execute(sql`create table resource_relation_posts (id text primary key, author_id text not null references resource_relation_authors(id), title text not null)`)
  await database.execute(sql`insert into resource_relation_authors values ('author-a', 'Ada')`)
  await database.execute(sql`insert into resource_relation_posts values ('post-a', 'author-a', 'Notes')`)

  resetArkResourcesForTests()
  resetArkResourceHooksForTests()
  adoptArkResource({ name: 'relation_authors', table: relationAuthors })
  const posts = adoptArkResource({
    name: 'relation_posts',
    relations: { author: { field: 'authorId', resource: 'relation_authors' } },
    table: relationPosts,
  })
  const accountability = {
    arkUserId: 'user-a',
    capabilities: ['relation_posts.items.read', 'relation_authors.items.read'],
    spaceId: 'space-a',
    system: false,
    userId: 'auth-a',
  }
  const service = new ArkResourceService(posts, { accountability, database })
  const result = await service.readMany({ fields: ['id', 'author.name'], limit: 10, offset: 0, sort: [] })
  assert.deepEqual(result.data, [{ author: { name: 'Ada' }, id: 'post-a' }])

  const denied = new ArkResourceService(posts, { accountability: { ...accountability, capabilities: ['relation_posts.items.read'] }, database })
  const deniedResult = await denied.readMany({ fields: ['id', 'author.name'], limit: 10, offset: 0, sort: [] })
  assert.deepEqual(deniedResult.data, [{ id: 'post-a' }])
  await client.close()
})

test('Domain Resource reads preserve authorization while expanding relations', async () => {
  const client = new PGlite()
  const database = drizzle(client)
  await database.execute(sql`create table resource_relation_authors (id text primary key, name text not null)`)
  await database.execute(sql`create table resource_relation_posts (id text primary key, author_id text not null references resource_relation_authors(id), title text not null)`)
  await database.execute(sql`insert into resource_relation_authors values ('author-a', 'Ada')`)
  await database.execute(sql`insert into resource_relation_posts values ('post-a', 'author-a', 'Notes')`)

  resetArkResourcesForTests()
  resetArkResourceHooksForTests()
  registerArkResource({
    name: 'ark.relation_authors',
    operations: { create: false, delete: false, read: false, update: false },
    table: relationAuthors,
  })
  const posts = registerArkResource({
    name: 'ark.relation_posts',
    operations: { create: false, delete: false, read: false, update: false },
    relations: { author: { field: 'authorId', resource: 'ark.relation_authors' } },
    table: relationPosts,
  })
  const service = new ArkResourceService(posts, {
    accountability: {
      arkUserId: 'user-a',
      capabilities: [],
      spaceId: 'space-a',
      system: false,
      userId: 'auth-a',
    },
    authorization: 'domain',
    database,
  })

  const result = await service.readMany({ fields: ['id', 'author.name'], limit: 10, offset: 0, sort: [] })
  assert.deepEqual(result.data, [{ author: { name: 'Ada' }, id: 'post-a' }])
  await client.close()
})

test('Resource Service applies lifecycle, policy, CRUD, and soft deletion in PGlite', async () => {
  const client = new PGlite()
  const database = drizzle(client)
  await database.execute(sql`
    create table resource_service_jobs (
      id text primary key,
      owner_id text not null,
      title text not null,
      deleted_at timestamptz
    )
  `)
  await database.execute(sql`create table resource_service_job_audits (id text primary key, job_id text not null)`)

  resetArkResourcesForTests()
  resetArkResourceHooksForTests()
  const definition = adoptArkResource({
    deletion: 'soft',
    fields: { read: ['id', 'title'] },
    name: 'service_jobs',
    operations: { delete: true },
    rowPolicy: {
      create: { ownerId: { _eq: 'space-a' } },
      delete: { ownerId: { _eq: 'space-a' } },
      read: { ownerId: { _eq: 'space-a' } },
      update: { ownerId: { _eq: 'space-a' } },
    },
    table: jobs,
  })
  adoptArkResource({ name: 'service_job_audits', table: jobAudits })
  const calls: string[] = []
  let releaseBestEffort!: () => void
  const bestEffortGate = new Promise<void>((resolve) => {
    releaseBestEffort = resolve
  })
  arkResourceHooks.filter('service_jobs.items.create', payload => ({
    ...payload,
    title: `${payload.title} filtered`,
  }), { key: 'service-test-filter' })
  arkResourceHooks.action('service_jobs.items.create', () => {
    calls.push('required')
  }, { key: 'service-test-required' })
  arkResourceHooks.action('service_jobs.items.create', async ({ key }, { services }) => {
    await services.resource('service_job_audits', { emitEvents: false }).create({
      id: `audit-${key}`,
      jobId: key,
    })
  }, { key: 'service-test-injected-service' })
  arkResourceHooks.action('service_jobs.items.create', ({ key }) => {
    if (key === 'job-rollback')
      throw new Error('rollback nested Resource write')
  }, { key: 'service-test-rollback' })
  arkResourceHooks.action('service_jobs.items.create', async () => {
    await bestEffortGate
    calls.push('best-effort')
  }, { bestEffort: true, key: 'service-test-best-effort' })

  const accountability = {
    arkUserId: 'user-a',
    capabilities: [
      'service_jobs.items.create',
      'service_jobs.items.delete',
      'service_jobs.items.read',
      'service_jobs.items.update',
      'service_job_audits.items.create',
      'service_job_audits.items.read',
    ],
    spaceId: 'space-a',
    system: false,
    userId: 'auth-a',
  }
  const service = new ArkResourceService(definition, { accountability, database })

  const created = await service.create({ id: 'job-a', ownerId: 'space-a', title: 'Build' })
  assert.equal(created.title, 'Build filtered')
  assert.equal('ownerId' in created, false)
  assert.deepEqual(calls, ['required'])
  releaseBestEffort()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(calls, ['required', 'best-effort'])

  const auditService = new ArkResourceService(getArkResource('service_job_audits')!, { accountability, database })
  assert.equal((await auditService.readMany({ limit: 10, offset: 0, sort: [] })).meta.filter_count, 1)

  await assert.rejects(
    service.create({ id: 'job-rollback', ownerId: 'space-a', title: 'Rollback' }),
    /rollback nested Resource write/,
  )
  assert.equal((await auditService.readMany({ limit: 10, offset: 0, sort: [] })).meta.filter_count, 1)

  await assert.rejects(
    service.create({ id: 'job-b', ownerId: 'space-b', title: 'Hidden' }),
    /does not satisfy the Resource Row Policy/,
  )

  const listed = await service.readMany({ limit: 25, offset: 0, sort: [] })
  assert.equal(listed.meta.filter_count, 1)
  assert.equal(listed.data[0]?.id, 'job-a')

  const updated = await service.update('job-a', { title: 'Ship' })
  assert.equal(updated.title, 'Ship')

  await assert.rejects(
    service.update('job-a', { id: 'job-renamed' }),
    /Fields are not writable: id/,
  )

  await service.delete('job-a')
  const afterDelete = await service.readMany({ limit: 25, offset: 0, sort: [] })
  assert.equal(afterDelete.meta.filter_count, 0)

  await client.close()
})

test('trusted Domain lifecycle authority propagates into nested Hook services', async () => {
  const client = new PGlite()
  const database = drizzle(client)
  await database.execute(sql`
    create table resource_service_jobs (
      id text primary key,
      owner_id text not null,
      title text not null,
      deleted_at timestamptz
    )
  `)
  await database.execute(sql`create table resource_service_job_audits (id text primary key, job_id text not null)`)

  resetArkResourcesForTests()
  resetArkResourceHooksForTests()
  const definition = registerArkResource({
    name: 'ark.test_jobs',
    operations: { create: false, delete: false, read: false, update: false },
    table: jobs,
  })
  registerArkResource({
    name: 'ark.test_job_audits',
    operations: { create: false, delete: false, read: false, update: false },
    table: jobAudits,
  })
  arkResourceHooks.action('ark.test_jobs.items.create', async ({ key }, { services }) => {
    await services.resource('ark.test_job_audits').create({
      id: `audit-${key}`,
      jobId: key,
    })
  }, { key: 'domain-authority-propagation' })

  const accountability = {
    arkUserId: 'user-a',
    capabilities: [],
    spaceId: 'space-a',
    system: false,
    userId: 'auth-a',
  }
  const service = new ArkResourceService(definition, {
    accountability,
    authorization: 'domain',
    database,
  })
  await service.create({ id: 'job-a', ownerId: 'space-a', title: 'Build' })

  const rows = await database.select().from(jobAudits)
  assert.deepEqual(rows, [{ id: 'audit-job-a', jobId: 'job-a' }])
  await client.close()
})

test('Resource services reject unmanaged transaction objects', async () => {
  resetArkResourcesForTests()
  resetArkResourceHooksForTests()
  const definition = adoptArkResource({ name: 'transaction_guard_jobs', table: jobs })
  const service = new ArkResourceService(definition, {
    accountability: {
      arkUserId: 'user-a',
      capabilities: ['transaction_guard_jobs.items.create'],
      spaceId: 'space-a',
      system: false,
      userId: 'auth-a',
    },
    database: {},
    transaction: {},
  })

  await assert.rejects(
    service.create({ id: 'job-a', ownerId: 'space-a', title: 'Build' }),
    /must be created with withArkResourceTransaction/,
  )
})

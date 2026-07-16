/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import { getTableColumns } from 'drizzle-orm'
import { PgDialect, pgTable, text } from 'drizzle-orm/pg-core'
import { compileArkResourceFilter, parseArkResourceQuery } from './query'

const jobs = pgTable('resource_query_jobs', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  title: text('title').notNull(),
})

test('parses Directus-style list query parameters', () => {
  const query = parseArkResourceQuery({
    fields: 'id,title',
    'filter[status][_eq]': 'open',
    limit: '25',
    offset: '50',
    sort: '-title,id',
  })

  assert.deepEqual(query, {
    fields: ['id', 'title'],
    filter: { status: { _eq: 'open' } },
    limit: 25,
    offset: 50,
    sort: [
      { direction: 'desc', field: 'title' },
      { direction: 'asc', field: 'id' },
    ],
  })
})

test('compiles the supported filter subset for SQL and final-state policy checks', () => {
  const filter = compileArkResourceFilter({
    _or: [
      { status: { _eq: 'open' } },
      { title: { _icontains: 'ark' } },
    ],
  }, getTableColumns(jobs), ['id', 'status', 'title'])

  assert.ok(filter.sql)
  assert.equal(filter.predicate({ id: '1', status: 'closed', title: 'Build Ark' }), true)
  assert.equal(filter.predicate({ id: '2', status: 'closed', title: 'Other' }), false)
})

test('rejects filtering by fields outside the readable Field Policy', () => {
  assert.throws(
    () => compileArkResourceFilter({ status: { _eq: 'open' } }, getTableColumns(jobs), ['id', 'title']),
    /Filtering by field "status" is not allowed/,
  )
})

test('treats LIKE wildcard characters as literal filter input', () => {
  const filter = compileArkResourceFilter(
    { title: { _contains: '100%_done\\now' } },
    getTableColumns(jobs),
    ['title'],
  )
  const query = new PgDialect().sqlToQuery(filter.sql!)

  assert.deepEqual(query.params, ['%100\\%\\_done\\\\now%'])
  assert.equal(filter.predicate({ title: '100%_done\\now' }), true)
  assert.equal(filter.predicate({ title: '100XXdone\\now' }), false)
})

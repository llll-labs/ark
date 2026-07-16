/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { sql } from 'drizzle-orm'
import { adoptDiscoveredArkResource, discoverArkResourceTables } from './discovery'
import { getArkResource, resetArkResourcesForTests } from './registry'

test('public tables require adoption and adopted foreign keys become explicit relations', async () => {
  const client = new PGlite()
  const database = drizzle(client)
  await database.execute(sql`create schema ark`)
  await database.execute(sql`create function public.uuidv7() returns uuid language sql as 'select gen_random_uuid()'`)
  await database.execute(sql`
    create table ark.resource_definitions (
      id uuid primary key default uuidv7(), name text not null unique,
      schema_name text not null default 'public', table_name text not null,
      label text, primary_key text not null default 'id', deletion_policy text not null default 'disabled',
      operations_json jsonb not null default '{}', fields_json jsonb not null default '{}',
      row_policy_json jsonb not null default '{}', created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(), unique (schema_name, table_name)
    )
  `)
  await database.execute(sql`create table public.authors (id uuid primary key default uuidv7(), name text not null, deleted_at timestamptz)`)
  await database.execute(sql`create table public.posts (id uuid primary key default uuidv7(), author_id uuid not null references public.authors(id), title text not null)`)

  resetArkResourcesForTests()
  const discovered = await discoverArkResourceTables(database)
  assert.deepEqual(discovered.map(table => table.table), ['authors', 'posts'])
  assert.equal(getArkResource('authors'), null)

  await adoptDiscoveredArkResource({ deletion: 'soft', table: 'authors' }, database)
  await adoptDiscoveredArkResource({ table: 'posts' }, database)
  const posts = getArkResource('posts')
  const authors = getArkResource('authors')
  assert.equal(authors?.deletion, 'soft')
  assert.equal(authors?.softDeleteField, 'deleted_at')
  assert.equal(posts?.deletion, 'disabled')
  assert.deepEqual(posts?.relations?.author, { field: 'author_id', resource: 'authors', targetField: 'id' })

  await adoptDiscoveredArkResource({ deletion: 'soft', name: 'writers', table: 'authors' }, database)
  assert.equal(getArkResource('authors'), null)
  assert.equal(getArkResource('writers')?.softDeleteField, 'deleted_at')
  await client.close()
})

test('soft deletion adoption requires a conventional soft-delete column', async () => {
  const client = new PGlite()
  const database = drizzle(client)
  await database.execute(sql`create schema ark`)
  await database.execute(sql`create function public.uuidv7() returns uuid language sql as 'select gen_random_uuid()'`)
  await database.execute(sql`
    create table ark.resource_definitions (
      id uuid primary key default uuidv7(), name text not null unique,
      schema_name text not null default 'public', table_name text not null,
      label text, primary_key text not null default 'id', deletion_policy text not null default 'disabled',
      operations_json jsonb not null default '{}', fields_json jsonb not null default '{}',
      row_policy_json jsonb not null default '{}', created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(), unique (schema_name, table_name)
    )
  `)
  await database.execute(sql`create table public.notes (id uuid primary key default uuidv7(), body text not null)`)

  await assert.rejects(
    adoptDiscoveredArkResource({ deletion: 'soft', table: 'notes' }, database),
    /needs a deleted_at column/,
  )
  await client.close()
})

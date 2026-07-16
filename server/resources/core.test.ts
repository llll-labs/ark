/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { registerCoreArkResources } from './core'
import { arkResourceHooks, resetArkResourceHooksForTests } from './hooks'
import { getArkResource, resetArkResourcesForTests } from './registry'
import { ArkResourceService, withArkResourceTransaction } from './service'

test('aggregate roots are code-owned with generic CRUD disabled', () => {
  resetArkResourcesForTests()
  resetArkResourceHooksForTests()
  registerCoreArkResources()

  for (const name of [
    'ark.channels',
    'ark.files',
    'ark.market_jobs',
    'ark.market_stores',
    'ark.messages',
    'ark.pages',
    'ark.spaces',
    'ark.users',
  ]) {
    const resource = getArkResource(name)
    assert.equal(resource?.source, 'code', name)
    assert.deepEqual(resource?.operations, {
      create: false,
      delete: false,
      read: false,
      update: false,
    }, name)
  }
})

test('ark.messages Domain Service creation runs the targeted Resource lifecycle', async () => {
  const client = new PGlite()
  const database = drizzle(client)
  await database.execute(sql`create schema ark`)
  await database.execute(sql`
    create table ark.messages (
      id uuid primary key,
      space_id uuid not null,
      channel_id uuid not null,
      root_message_id uuid,
      kind text not null default 'message',
      author_ark_user_id uuid,
      body text,
      body_json jsonb not null default '{}'::jsonb,
      edited_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    )
  `)

  resetArkResourcesForTests()
  resetArkResourceHooksForTests()
  registerCoreArkResources()
  const accountability = {
    arkUserId: '01911111-1111-7111-8111-111111111111',
    capabilities: [],
    spaceId: '01922222-2222-7222-8222-222222222222',
    system: false,
    userId: 'better-auth-user-a',
  }
  let requiredActions = 0
  arkResourceHooks.filter('ark.messages.items.create', payload => ({
    ...payload,
    body: `${payload.body} filtered`,
  }), { key: 'core-messages-lifecycle-filter' })
  arkResourceHooks.action('ark.messages.items.create', (_meta, context) => {
    assert.equal(context.accountability.userId, accountability.userId)
    requiredActions += 1
  }, { key: 'core-messages-lifecycle-action' })

  const created = await withArkResourceTransaction({
    accountability,
    authorization: 'domain',
    database,
  }, ({ services }) => services.resource('ark.messages').create({
    authorArkUserId: accountability.arkUserId,
    body: 'Hello',
    channelId: '01933333-3333-7333-8333-333333333333',
    id: '01944444-4444-7444-8444-444444444444',
    spaceId: accountability.spaceId,
  }))

  assert.equal(created.body, 'Hello filtered')
  assert.equal(requiredActions, 1)

  const genericService = new ArkResourceService(getArkResource('ark.messages')!, {
    accountability: {
      ...accountability,
      capabilities: ['ark.messages.items.create'],
    },
    database,
  })
  await assert.rejects(
    genericService.create({
      body: 'Generic write',
      channelId: '01933333-3333-7333-8333-333333333333',
      id: '01955555-5555-7555-8555-555555555555',
      spaceId: accountability.spaceId,
    }),
    /create is disabled for Resource "ark.messages"/,
  )

  await client.close()
})

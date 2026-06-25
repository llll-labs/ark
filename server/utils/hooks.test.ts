/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import { registerArkUserCompletedAction } from './app-extensions'
import { arkHooks, createArkHookRegistry } from './hooks'

const ctx = { db: {} as any }

function authUser() {
  return {
    email: 'user@example.test',
    id: '019e4a9a-b79b-70b4-87d8-c8314c2bff2a',
    image: null,
    name: 'User',
  }
}

function arkUser() {
  return {
    authUserId: authUser().id,
    avatarFileId: null,
    bio: null,
    createdAt: new Date(),
    deletedAt: null,
    displayName: 'User',
    handle: null,
    id: '019e4a9a-b79b-70b4-87d8-c8314c2bff2b',
    kind: 'human',
    notificationsJson: {},
    profileJson: {},
    status: 'active',
    updatedAt: new Date(),
  }
}

test('filters run in registration order and feed the next filter', async () => {
  const hooks = createArkHookRegistry()
  hooks.filter('ark.users.creating', payload => ({
    ...payload,
    values: { ...payload.values, displayName: `${payload.values.displayName} One` },
  }))
  hooks.filter('ark.users.creating', payload => ({
    ...payload,
    values: { ...payload.values, displayName: `${payload.values.displayName} Two` },
  }))

  const result = await hooks.applyFilter('ark.users.creating', {
    authUser: authUser(),
    values: {
      authUserId: authUser().id,
      displayName: 'User',
      kind: 'human',
    },
  }, ctx)

  assert.equal(result.values.displayName, 'User One Two')
})

test('actions run in registration order and are awaited', async () => {
  const hooks = createArkHookRegistry()
  const calls: string[] = []
  hooks.action('ark.users.completed', async () => {
    await Promise.resolve()
    calls.push('first')
  })
  hooks.action('ark.users.completed', () => {
    calls.push('second')
  })

  await hooks.runAction('ark.users.completed', {
    arkUser: arkUser() as any,
    authUser: authUser(),
    created: true,
  }, ctx)

  assert.deepEqual(calls, ['first', 'second'])
})

test('missing actions are a no-op', async () => {
  const hooks = createArkHookRegistry()
  await hooks.runAction('ark.users.completed', {
    arkUser: arkUser() as any,
    authUser: authUser(),
    created: false,
  }, ctx)
})

test('required action errors bubble and stop later actions', async () => {
  const hooks = createArkHookRegistry()
  const calls: string[] = []
  hooks.action('ark.users.completed', () => {
    calls.push('first')
    throw new Error('required failed')
  })
  hooks.action('ark.users.completed', () => {
    calls.push('second')
  })

  await assert.rejects(
    hooks.runAction('ark.users.completed', {
      arkUser: arkUser() as any,
      authUser: authUser(),
      created: false,
    }, ctx),
    /required failed/,
  )
  assert.deepEqual(calls, ['first'])
})

test('optional action errors are logged and do not stop later actions', async () => {
  const hooks = createArkHookRegistry()
  const calls: string[] = []
  const warnings: unknown[] = []
  const warn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }
  try {
    hooks.action('ark.users.completed', () => {
      calls.push('first')
      throw new Error('optional failed')
    }, { key: 'optional', required: false })
    hooks.action('ark.users.completed', () => {
      calls.push('second')
    })

    await hooks.runAction('ark.users.completed', {
      arkUser: arkUser() as any,
      authUser: authUser(),
      created: false,
    }, ctx)
  }
  finally {
    console.warn = warn
  }

  assert.deepEqual(calls, ['first', 'second'])
  assert.equal(warnings.length, 1)
})

test('tenant completed actions register as required by default', async () => {
  registerArkUserCompletedAction('hooks-test-required', () => {
    throw new Error('tenant failed')
  })

  await assert.rejects(
    arkHooks.runAction('ark.users.completed', {
      arkUser: arkUser() as any,
      authUser: authUser(),
      created: false,
    }, ctx),
    /tenant failed/,
  )

  registerArkUserCompletedAction('hooks-test-required', () => {})
})

test('tenant completed actions can be best effort', async () => {
  const warnings: unknown[] = []
  const warn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }
  try {
    registerArkUserCompletedAction('hooks-test-optional', () => {
      throw new Error('tenant optional failed')
    }, { required: false })

    await arkHooks.runAction('ark.users.completed', {
      arkUser: arkUser() as any,
      authUser: authUser(),
      created: false,
    }, ctx)
  }
  finally {
    console.warn = warn
    registerArkUserCompletedAction('hooks-test-optional', () => {}, { required: false })
  }

  assert.equal(warnings.length, 1)
})

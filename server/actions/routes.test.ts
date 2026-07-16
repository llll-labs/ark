/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import { arkActionPath } from './routes'

test('Ark knowledge Actions do not collide with the Resource items mount', () => {
  assert.equal(
    arkActionPath(['knowledge', 'items', 'create'], 'mutation'),
    '/api/ark/knowledge/items/actions/create',
  )
  assert.equal(
    arkActionPath(['knowledge', 'items', 'list'], 'query'),
    '/api/ark/knowledge/items',
  )
})

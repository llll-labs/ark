/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canUseFileAsProfileAvatar,
} from './avatar'

test('canUseFileAsProfileAvatar requires owned public image file', () => {
  const baseFile = {
    deletedAt: null,
    id: 'file-id',
    mimeType: 'image/png',
    ownerArkUserId: 'user-id',
    visibility: 'public',
  }
  assert.equal(canUseFileAsProfileAvatar(baseFile, 'user-id'), true)
  assert.equal(canUseFileAsProfileAvatar({ ...baseFile, ownerArkUserId: 'other-user' }, 'user-id'), false)
  assert.equal(canUseFileAsProfileAvatar({ ...baseFile, visibility: 'private' }, 'user-id'), false)
  assert.equal(canUseFileAsProfileAvatar({ ...baseFile, mimeType: 'text/plain' }, 'user-id'), false)
  assert.equal(canUseFileAsProfileAvatar({ ...baseFile, deletedAt: new Date() }, 'user-id'), false)
})

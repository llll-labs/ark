/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  providerAvatarSourceHash,
  shouldReplaceProviderAvatar,
} from './provider-avatar-rules'

test('providerAvatarSourceHash is stable per provider and source URL', () => {
  const left = providerAvatarSourceHash('telegram', 'https://example.test/avatar.jpg')
  const right = providerAvatarSourceHash('telegram', 'https://example.test/avatar.jpg')
  const other = providerAvatarSourceHash('discord', 'https://example.test/avatar.jpg')

  assert.equal(left, right)
  assert.notEqual(left, other)
})

test('shouldReplaceProviderAvatar fills empty avatar', () => {
  assert.equal(shouldReplaceProviderAvatar(null, {}, 'hash'), true)
})

test('shouldReplaceProviderAvatar does not overwrite manual avatar', () => {
  assert.equal(shouldReplaceProviderAvatar('manual-file-id', {}, 'hash'), false)
})

test('shouldReplaceProviderAvatar replaces prior provider-synced avatar when source changes', () => {
  assert.equal(shouldReplaceProviderAvatar('file-1', {
    fileId: 'file-1',
    sourceUrlHash: 'old',
  }, 'new'), true)
})

test('shouldReplaceProviderAvatar keeps provider-synced avatar when source is unchanged', () => {
  assert.equal(shouldReplaceProviderAvatar('file-1', {
    fileId: 'file-1',
    sourceUrlHash: 'same',
  }, 'same'), false)
})

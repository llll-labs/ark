/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import { messageCreateSchema, messageRelationKindSchema, messageRelationTargetTypeSchema } from '../../db/zod'

test('messageCreateSchema rejects parentMessageId', () => {
  const result = messageCreateSchema.safeParse({
    body: 'old reply',
    channelId: '019e4a9a-b79b-70b4-87d8-c8314c2bff2a',
    parentMessageId: '019e4a9b-85cb-49ec-90ff-8d489994205d',
  })

  assert.equal(result.success, false)
})

test('messageCreateSchema accepts flat reply quote and forum parent fields', () => {
  assert.equal(messageCreateSchema.safeParse({
    body: 'reply',
    channelId: '019e4a9a-b79b-70b4-87d8-c8314c2bff2a',
    replyToMessageId: '019e4a9b-85cb-49ec-90ff-8d489994205d',
  }).success, true)

  assert.equal(messageCreateSchema.safeParse({
    body: 'forum reply',
    channelId: '019e4a9a-b79b-70b4-87d8-c8314c2bff2a',
    forumParentMessageId: '019e4a9b-85cb-49ec-90ff-8d489994205d',
  }).success, true)
})

test('message relation schemas accept message targets for replies', () => {
  assert.equal(messageRelationKindSchema.safeParse('reply_quote').success, true)
  assert.equal(messageRelationKindSchema.safeParse('forum_parent').success, true)
  assert.equal(messageRelationTargetTypeSchema.safeParse('message').success, true)
})

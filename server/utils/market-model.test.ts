/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  marketJobCurationSchema,
  marketStoreUpsertSchema,
  spaceKindSchema,
} from '../../db/zod'

const id = '019e4a9a-b79b-70b4-87d8-c8314c2bff2a'

test('space kind accepts organization as the neutral account container', () => {
  assert.equal(spaceKindSchema.safeParse('organization').success, true)
})

test('store schema is always owned by a space and carries seller pricing inline', () => {
  const result = marketStoreUpsertSchema.safeParse({
    name: 'Studio X',
    ownerSpaceId: id,
    rateAmount: '1500',
    rateCurrency: 'USD',
    rateUnit: 'project',
    serviceSummary: 'Architectural visualization and 3D production.',
    portfolioUrl: 'https://example.com/studio-x',
    status: 'active',
  })

  assert.equal(result.success, true)
})

test('store schema rejects input without an owning space', () => {
  const result = marketStoreUpsertSchema.safeParse({
    name: 'No owner',
    status: 'active',
  })

  assert.equal(result.success, false)
})

test('market job curation schema accepts archive action', () => {
  assert.equal(marketJobCurationSchema.safeParse({
    action: 'archive',
    id,
  }).success, true)
})

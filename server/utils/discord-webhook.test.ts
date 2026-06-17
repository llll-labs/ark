/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDiscordWebhookDigestPayload,
  sendDiscordWebhookDigest,
} from './discord-webhook'

test('buildDiscordWebhookDigestPayload builds embeds without mentions', () => {
  const payload = buildDiscordWebhookDigestPayload({
    jobs: [{
      budgetAmount: '100',
      budgetCurrency: 'USD',
      kind: 'freelance_project',
      source: 'fixture',
      sourceUrl: 'https://example.test/source',
      summary: 'Need a model',
      title: 'Model a product',
    }],
    title: 'New jobs: 1',
  })

  assert.deepEqual(payload.allowed_mentions, { parse: [] })
  assert.equal(payload.content, 'New jobs: 1')
  assert.equal(payload.embeds.length, 1)
  assert.equal(payload.embeds[0]?.url, 'https://example.test/source')
  assert.equal(payload.embeds[0]?.fields.length, 3)
})

test('sendDiscordWebhookDigest chunks embeds by Discord limit', async () => {
  const calls: any[] = []
  const result = await sendDiscordWebhookDigest({
    fetcher: async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)))
      return new Response(null, { status: 204 })
    },
    jobs: Array.from({ length: 11 }, (_, index) => ({
      sourceUrl: `https://example.test/${index}`,
      title: `Job ${index}`,
    })),
    webhookUrl: 'https://discord.com/api/webhooks/test',
  })

  assert.equal(result.ok, true)
  assert.equal(result.chunks, 2)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].embeds.length, 10)
  assert.equal(calls[1].embeds.length, 1)
})

test('sendDiscordWebhookDigest reports failed webhook response', async () => {
  const result = await sendDiscordWebhookDigest({
    fetcher: async () => new Response(JSON.stringify({ message: 'bad webhook' }), { status: 400 }),
    jobs: [{ title: 'Job' }],
    webhookUrl: 'https://discord.com/api/webhooks/test',
  })

  assert.equal(result.ok, false)
  assert.equal(result.results[0]?.status, 400)
  assert.deepEqual(result.results[0]?.body, { message: 'bad webhook' })
})

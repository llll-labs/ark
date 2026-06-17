/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { Dispatcher } from 'undici'
import {
  createOutboundProxyFetch,
  parseOutboundProxyHosts,
  redactProxyUrl,
  resolveOutboundProxyConfig,
} from './outbound-proxy'

test('parseOutboundProxyHosts keeps exact normalized hostnames', () => {
  const hosts = parseOutboundProxyHosts('api.telegram.org, HTTPS://OpenRouter.ai/path, invalid host, api.telegram.org.')

  assert.deepEqual([...hosts].sort(), ['api.telegram.org', 'openrouter.ai'])
})

test('resolveOutboundProxyConfig redacts credentials and requires hosts', () => {
  const { config, warnings } = resolveOutboundProxyConfig({
    OUTBOUND_PROXY_URL: 'http://user-name:secret-pass@ddc.oxylabs.io:8001',
    OUTBOUND_PROXY_HOSTS: 'api.telegram.org,openrouter.ai',
  })

  assert.deepEqual(warnings, [])
  assert.equal(config?.redactedProxyUrl, 'http://user-...:***@ddc.oxylabs.io:8001')
  assert.deepEqual([...(config?.hosts ?? [])].sort(), ['api.telegram.org', 'openrouter.ai'])
})

test('resolveOutboundProxyConfig warns when hosts are configured without proxy url', () => {
  const { config, warnings } = resolveOutboundProxyConfig({
    OUTBOUND_PROXY_HOSTS: 'api.telegram.org',
  })

  assert.equal(config, null)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0] ?? '', /OUTBOUND_PROXY_URL is missing/)
})

test('redactProxyUrl never returns the proxy password', () => {
  const redacted = redactProxyUrl('http://abcg_proxy_R9pDu:WA~YDxOL3Wb38E@ddc.oxylabs.io:8001')

  assert.equal(redacted.includes('WA~YDxOL3Wb38E'), false)
  assert.equal(redacted, 'http://abcg_...:***@ddc.oxylabs.io:8001')
})

test('createOutboundProxyFetch injects dispatcher only for listed hosts', async () => {
  const calls: Array<{ init?: RequestInit & { dispatcher?: Dispatcher }, url: string }> = []
  const dispatcher = {} as Dispatcher
  const fetcher = createOutboundProxyFetch(async (input, init) => {
    calls.push({
      init: init as RequestInit & { dispatcher?: Dispatcher },
      url: String(input),
    })
    return new Response('{}')
  }, dispatcher, new Set(['api.telegram.org']))

  await fetcher('https://api.telegram.org/bot123/getMe')
  await fetcher('https://openrouter.ai/api/v1/models')

  assert.equal(calls[0]?.init?.dispatcher, dispatcher)
  assert.equal(calls[1]?.init?.dispatcher, undefined)
})

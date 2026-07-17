import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  autoLabel,
  mappingLabel,
  main,
  migrateHorseConfig,
  overlapErrors,
  renderFrpcToml,
  resolvedMappings,
  validateConfig,
} from './ark-tunnels.mjs'

function backend(overrides = {}) {
  return {
    id: 'cgburn',
    name: 'CGBurn',
    domain: 'dev.example.com',
    serverAddr: 'frps.example.com',
    serverPort: 7000,
    token: 'test-token',
    slug: 'cgburn-alice',
    autoExpose: { enabled: true, ranges: ['3100-3199'] },
    mappings: [],
    ...overrides,
  }
}

test('auto and explicit labels use port or label followed by backend slug', () => {
  const item = backend()
  assert.equal(autoLabel(item, 3150), 'p3150-cgburn-alice')
  assert.equal(mappingLabel(item, { label: 'web' }), 'web-cgburn-alice')

  const mappings = resolvedMappings(item, new Map([[3150, { command: 'node', pid: 1 }]]))
  assert.equal(mappings[0].resolvedLabel, 'p3150-cgburn-alice')
})

test('rejects overlapping auto ranges on one domain', () => {
  const config = {
    backends: [
      backend({ id: 'podhodik', slug: 'podhodik-alice', autoExpose: { ranges: ['3000-3120'] } }),
      backend({ id: 'cgburn', slug: 'cgburn-alice', autoExpose: { ranges: ['3100-3199'] } }),
    ],
  }
  assert.match(overlapErrors(config)[0], /overlap/)
  assert.match(validateConfig(config).join('\n'), /overlap/)
})

test('allows overlapping ranges on different domains', () => {
  const config = {
    backends: [
      backend({ id: 'one', slug: 'one-alice', domain: 'dev.one.example.com' }),
      backend({ id: 'two', slug: 'two-alice', domain: 'dev.two.example.com' }),
    ],
  }
  assert.deepEqual(overlapErrors(config), [])
})

test('allows disabled backends to remain incomplete templates', () => {
  assert.deepEqual(validateConfig({
    backends: [{ id: 'later', enabled: false }],
  }), [])
})

test('renders frpc mappings from live listeners', () => {
  const item = backend()
  const rendered = renderFrpcToml({ backends: [item] }, item, new Map([[3150, { command: 'node', pid: 1 }]]))
  assert.match(rendered.toml, /subdomain = "p3150-cgburn-alice"/)
  assert.match(rendered.toml, /localPort = 3150/)
})

test('migrates Horse suffix and mapping slug into the new vocabulary', () => {
  const migrated = migrateHorseConfig({
    backends: [{
      id: 'abcg',
      domain: 'dev.abcg.to',
      serverAddr: 'frps.dev.abcg.to',
      serverPort: 7000,
      suffix: '-horse',
      token: 'token',
      autoExpose: { ranges: ['6000-7000'] },
      mappings: [{ slug: 'web', localPort: 6500 }],
    }],
  })
  assert.equal(migrated.backends[0].slug, 'abcg-horse')
  assert.equal(migrated.backends[0].mappings[0].label, 'web')
})

test('agent writes status through the same backend interface', async () => {
  const home = mkdtempSync(join(tmpdir(), 'ark-tunnels-test-'))
  const configRoot = join(home, '.config', 'ark-tunnels')
  const fakeFrpc = join(home, 'frpc')
  mkdirSync(configRoot, { recursive: true })
  writeFileSync(fakeFrpc, '#!/bin/sh\nsleep 30\n')
  chmodSync(fakeFrpc, 0o755)
  writeFileSync(join(configRoot, 'backends.json'), `${JSON.stringify({
    frpcBin: fakeFrpc,
    backends: [backend({ autoExpose: { enabled: true, ranges: ['65534'] } })],
  })}\n`)

  await main(['agent', '--once'], home)

  const status = JSON.parse(readFileSync(join(configRoot, 'status.json'), 'utf8'))
  assert.equal(status.errors.length, 0)
  assert.equal(status.backends[0].id, 'cgburn')
  assert.equal(status.backends[0].running, false)
})

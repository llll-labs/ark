import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import {
  composeDevEnv,
  devPostgresEnv,
  envWithPortCell,
  resetPortCell,
  resolveDevPostgresConfig,
  tenantSetupCommands,
} from './ark.mjs'

test('composeDevEnv lets CLI public URL override process and file env', () => {
  const env = composeDevEnv({
    args: { 'public-url': 'https://p4800-dev.example.test' },
    baseEnv: {
      BETTER_AUTH_URL: 'https://env.example.test',
      BETTER_AUTH_TRUSTED_ORIGINS: 'https://trusted.example.test',
      VITE_ALLOWED_HOSTS: 'manual.example.test',
    },
    host: '127.0.0.1',
    localOrigin: 'http://127.0.0.1:4800',
    port: 4800,
  })

  assert.equal(env.BETTER_AUTH_URL, 'https://p4800-dev.example.test')
  assert.equal(env.NUXT_PUBLIC_SITE_URL, 'https://p4800-dev.example.test')
  assert.equal(env.VITE_HMR_ORIGIN, 'https://p4800-dev.example.test')
  assert.equal(env.VITE_HMR_PROTOCOL, 'wss')
  assert.equal(env.VITE_HMR_CLIENT_PORT, '443')
  assert.equal(env.VITE_HMR_HOST, undefined)
  assert.deepEqual(env.BETTER_AUTH_TRUSTED_ORIGINS.split(','), [
    'https://p4800-dev.example.test',
    'http://127.0.0.1:4800',
    'http://localhost:4800',
    'https://trusted.example.test',
  ])
  assert.deepEqual(env.VITE_ALLOWED_HOSTS.split(','), [
    'manual.example.test',
    'p4800-dev.example.test',
  ])
})

test('composeDevEnv preserves explicit HMR host and port', () => {
  const env = composeDevEnv({
    args: {},
    baseEnv: {
      BETTER_AUTH_URL: 'https://env.example.test',
      VITE_HMR_HOST: '127.0.0.1',
      VITE_HMR_PORT: '14800',
    },
    host: '127.0.0.1',
    localOrigin: 'http://127.0.0.1:4800',
    port: 4800,
  })

  assert.equal(env.BETTER_AUTH_URL, 'https://env.example.test')
  assert.equal(env.VITE_HMR_HOST, '127.0.0.1')
  assert.equal(env.VITE_HMR_PORT, '14800')
  assert.equal(env.NUXT_HMR_PORT, '14800')
})

test('tenantSetupCommands reads ark dev setup hooks', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'ark-setup-hooks-'))
  writeFileSync(resolve(root, 'package.json'), JSON.stringify({
    ark: {
      dev: {
        setup: ['tsx scripts/seed.ts'],
      },
    },
  }))

  assert.deepEqual(tenantSetupCommands(root), ['tsx scripts/seed.ts'])
})

test('envWithPortCell pins data paths to the active workspace', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'ark-port-cell-'))
  writeFileSync(resolve(root, 'pnpm-workspace.yaml'), 'packages: []\n')
  const previousCwd = process.cwd()
  process.chdir(root)
  try {
    const realRoot = process.cwd()
    const { env, port } = envWithPortCell({ PATH: process.env.PATH }, { port: 4800 })
    assert.equal(port, 4800)
    assert.equal(env.DB_DATA_DIR, resolve(realRoot, '.ark', '4800', 'database'))
    assert.equal(env.STORAGE_LOCAL_ROOT, resolve(realRoot, '.ark', '4800', 'uploads'))
  }
  finally {
    process.chdir(previousCwd)
  }
})

test('resolveDevPostgresConfig derives a per-port database from DATABASE_URL', () => {
  const config = resolveDevPostgresConfig({
    DATABASE_URL: 'postgres://u:p@h:5432/stage?sslmode=require',
  }, {
    pgprefix: 'app_dev',
    port: 5412,
  })

  assert.equal(config.targetDatabase, 'app_dev_5412')
  assert.equal(config.runtimeUrl, 'postgres://u:p@h:5432/app_dev_5412?sslmode=require')
  assert.equal(config.sourceDatabase, 'stage')
})

test('resolveDevPostgresConfig can use DATABASE_PREFIX from env', () => {
  const config = resolveDevPostgresConfig({
    DATABASE_PREFIX: 'app_dev',
    DATABASE_URL: 'postgres://u:p@h:5432/postgres',
  }, {
    port: 4800,
  })

  assert.equal(config.targetDatabase, 'app_dev_4800')
  assert.equal(config.runtimeUrl, 'postgres://u:p@h:5432/app_dev_4800')
  assert.equal(config.sourceDatabase, 'postgres')
})

test('resolveDevPostgresConfig rejects unsafe prefixes and source target collisions', () => {
  assert.throws(() => resolveDevPostgresConfig({
    DATABASE_URL: 'postgres://u:p@h:5432/stage',
  }, {
    pgprefix: true,
    port: 5412,
  }), /DATABASE_PREFIX is required/)

  assert.throws(() => resolveDevPostgresConfig({
    DATABASE_PREFIX: 'app_dev',
  }, {
    port: 5412,
  }), /DATABASE_URL is required/)

  assert.throws(() => resolveDevPostgresConfig({
    DATABASE_URL: 'postgres://u:p@h:5432/stage',
  }, {
    pgprefix: 'bad-prefix',
    port: 5412,
  }), /Invalid database prefix/)

  assert.throws(() => resolveDevPostgresConfig({
    DATABASE_URL: 'postgres://u:p@h:5432/app_dev_5412',
  }, {
    pgprefix: 'app_dev',
    port: 5412,
  }), /Refusing to target source database/)
})

test('devPostgresEnv sets runtime postgres env without mutating base env', () => {
  const baseEnv = {
    DATABASE_URL: 'postgres://u:p@h:5432/stage',
  }
  const config = resolveDevPostgresConfig(baseEnv, {
    pgprefix: 'app_dev',
    port: 5412,
  })
  const env = devPostgresEnv(baseEnv, config)

  assert.equal(env.DB_CLIENT, 'postgres')
  assert.equal(env.DATABASE_PREFIX, 'app_dev')
  assert.equal(env.DATABASE_URL, 'postgres://u:p@h:5432/app_dev_5412')
  assert.equal(env.PORT, '5412')
  assert.equal(baseEnv.DATABASE_URL, 'postgres://u:p@h:5432/stage')
})

test('resetPortCell removes only the selected port cell', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'ark-reset-'))
  mkdirSync(resolve(root, '.ark', '4800'), { recursive: true })
  mkdirSync(resolve(root, '.ark', '4801'), { recursive: true })

  resetPortCell(root, 4800)

  assert.equal(existsSync(resolve(root, '.ark', '4800')), false)
  assert.equal(existsSync(resolve(root, '.ark', '4801')), true)
})

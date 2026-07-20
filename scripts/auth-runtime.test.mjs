import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const appRoot = join(root, 'app')

function appSourceFiles(directory = appRoot) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory())
      return appSourceFiles(path)
    return ['.ts', '.vue'].includes(extname(entry.name)) ? [path] : []
  })
}

test('auth initialization is owned by the Pinia preload plugin', () => {
  const pluginPath = join(appRoot, 'plugins/ark-auth-preload.ts')
  const legacyClientPluginPath = join(appRoot, 'plugins/ark-auth-preload.client.ts')
  assert.equal(existsSync(pluginPath), true)
  assert.equal(existsSync(legacyClientPluginPath), false)

  const plugin = readFileSync(pluginPath, 'utf8')
  assert.match(plugin, /await authRuntime\.initialize\(\)/)

  const forbiddenCallers = appSourceFiles()
    .filter(path => path !== pluginPath)
    .filter(path => /\b(?:auth|authRuntime)\.initialize\(/.test(readFileSync(path, 'utf8')))
    .map(path => relative(root, path))
  assert.deepEqual(forbiddenCallers, [])
})

test('auth consumers cannot start generic session checks', () => {
  const callers = appSourceFiles()
    .filter(path => /\b(?:auth|authRuntime)\.check\(/.test(readFileSync(path, 'utf8')))
    .map(path => relative(root, path))
  assert.deepEqual(callers, [])
})

test('the auth runtime owns exactly one me request implementation', () => {
  const store = readFileSync(join(appRoot, 'stores/arkAuthRuntime.ts'), 'utf8')
  assert.equal(store.match(/\$arkApi\.query\(['"]me['"]\)/g)?.length, 1)
})

test('me is identity-only and access has its own lazy store request', () => {
  const router = readFileSync(join(root, 'server/actions/routers/ark.ts'), 'utf8')
  const store = readFileSync(join(appRoot, 'stores/arkAuthRuntime.ts'), 'utf8')

  const meHandler = router.slice(router.indexOf('me: baseAction.query'), router.indexOf('\n\n  profile:'))
  assert.doesNotMatch(meHandler, /loadArkAccess/)
  assert.doesNotMatch(meHandler, /currentArkUser/)
  assert.doesNotMatch(meHandler, /loadArkUserExtension/)
  assert.doesNotMatch(meHandler, /arkUser:/)
  assert.doesNotMatch(meHandler, /capabilities:/)
  assert.doesNotMatch(meHandler, /memberships:/)
  assert.match(router, /access: baseAction\.query/)
  assert.match(router, /profile: baseAction\.query/)
  assert.equal(store.match(/\$arkApi\.query\(['"]access['"]\)/g)?.length, 1)
  assert.equal(store.match(/\$arkApi\.query\(['"]profile['"]\)/g)?.length, 1)
  assert.match(store, /function loadAccess\(/)
  assert.match(store, /function loadProfile\(/)
})

test('the one-round-trip access loader ships in the tenant package', () => {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(packageJson.files.includes('server/utils/ark-access.ts'), true)
})

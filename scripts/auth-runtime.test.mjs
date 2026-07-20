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

test('the one-round-trip me loader ships in the tenant package', () => {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(packageJson.files.includes('server/utils/ark-me.ts'), true)
})

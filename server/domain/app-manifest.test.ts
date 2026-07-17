/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { arkModuleForPage } from '../../modules/ark-app'
import { normalizeArkAppConfig } from '../../types/ark-app'

test('Ark app manifest maps core pages to explicit modules', () => {
  const root = resolve(import.meta.dirname, '../../app/pages')
  assert.equal(arkModuleForPage(resolve(root, 'app/channels/[channelId].vue')), 'channels')
  assert.equal(arkModuleForPage(resolve(root, 'app/spaces/[spaceId]/jobs.vue')), 'market')
  assert.equal(arkModuleForPage(resolve(root, 'app/user/settings.vue')), 'user-settings')
  assert.equal(arkModuleForPage(resolve(root, 'app/index.vue')), null)
})

test('Ark app manifest preserves an explicit empty module list', () => {
  const config = normalizeArkAppConfig({ home: '/app/overview', modules: [], navigation: [] })
  assert.deepEqual(config.modules, [])
  assert.equal(config.home, '/app/overview')
})

test('Ark app manifest deduplicates Nuxt-merged module and navigation arrays', () => {
  const config = normalizeArkAppConfig({
    modules: ['channels', 'channels', 'user-settings'],
    navigation: [
      { id: 'home', icon: 'i-lucide-home', label: 'Home', to: '/app/home' },
      { id: 'home', icon: 'i-lucide-house', label: 'Replacement', to: '/app/replacement' },
    ],
  })
  assert.deepEqual(config.modules, ['channels', 'user-settings'])
  assert.deepEqual(config.navigation, [
    { id: 'home', icon: 'i-lucide-house', label: 'Replacement', to: '/app/replacement' },
  ])
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')

test('Ark channel query keys include response-changing viewer inputs', () => {
  const source = readFileSync(join(root, 'app/composables/useArkChannels.ts'), 'utf8')
  const scope = readFileSync(join(root, 'app/utils/arkQueryScope.ts'), 'utf8')

  assert.match(source, /detail: \(channelId: string, viewerScope: ArkViewerScope\)/)
  assert.match(source, /messageWindow: \(channelId: string, anchor: ArkMessageAnchor, limit: number, viewerScope: ArkViewerScope\)/)
  assert.match(source, /pinnedMessages: \(channelId: string, viewerScope: ArkViewerScope\)/)
  assert.match(source, /state: \(channelId: string, viewerScope: ArkViewerScope\)/)
  assert.match(scope, /publicRead \? 'public' : `viewer:\$\{userId \|\| 'anonymous'\}`/)
})

test('Vue Query state is dehydrated by Nuxt and awaited for server-rendered channels', () => {
  const plugin = readFileSync(join(root, 'app/plugins/vue-query.ts'), 'utf8')
  const channelView = readFileSync(join(root, 'app/components/core/ArkChannelView.vue'), 'utf8')

  assert.match(plugin, /hydrate\(queryClient, dehydratedState\.value\)/)
  assert.match(plugin, /dehydratedState\.value = dehydrate\(queryClient\)/)
  assert.match(channelView, /channelQuery\.suspense\(\)/)
  assert.match(channelView, /messagesWindow\.suspense\(\)/)
  assert.match(channelView, /pinnedQuery\.suspense\(\)/)
})

test('Ark shell resources share Vue Query invalidation with mutations and realtime', () => {
  const shell = readFileSync(join(root, 'app/composables/useArkShell.ts'), 'utf8')
  const channels = readFileSync(join(root, 'app/composables/useArkChannels.ts'), 'utf8')
  const realtime = readFileSync(join(root, 'app/composables/useArkRealtime.ts'), 'utf8')

  assert.doesNotMatch(shell, /useAsyncData\(/)
  assert.match(shell, /useQuery\(/)
  assert.match(shell, /async function ready\(\)/)
  assert.match(channels, /invalidateArkShell\(queryClient\)/)
  assert.match(realtime, /invalidateArkShell\(queryClient\)/)
})

test('dynamic Ark routes use reactive Vue Query keys', () => {
  const guard = readFileSync(join(root, 'app/composables/useChannelRouteGuard.ts'), 'utf8')
  const job = readFileSync(join(root, 'app/pages/app/jobs/[jobId].vue'), 'utf8')
  const space = readFileSync(join(root, 'app/pages/app/spaces/[spaceId]/index.vue'), 'utf8')

  assert.doesNotMatch(guard, /useAsyncData\(/)
  assert.match(guard, /useArkChannelQuery\(id\)/)
  assert.match(job, /queryKey: computed\(\(\) => .*jobId\.value/)
  assert.match(space, /queryKey: computed\(\(\) => .*spaceId\.value/)
})

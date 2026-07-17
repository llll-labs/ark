import type { NuxtPage } from '@nuxt/schema'
import type { ArkAppModule, ArkConfig } from '../types/ark-app'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineNuxtModule } from 'nuxt/kit'
import { normalizeArkAppConfig } from '../types/ark-app'

const arkRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const arkPagesRoot = resolve(arkRoot, 'app/pages')

function normalizedRelativePage(file: string) {
  return relative(arkPagesRoot, file).split(sep).join('/')
}

export function arkModuleForPage(file: string): ArkAppModule | null {
  if (!resolve(file).startsWith(`${arkPagesRoot}${sep}`))
    return null

  const page = normalizedRelativePage(file)
  if (page.startsWith('app/channels/') || page.includes('/channels/'))
    return 'channels'
  if (page === 'app/forum.vue')
    return 'forum'
  if (page.startsWith('app/jobs/') || page === 'app/jobs/index.vue' || page.endsWith('/jobs.vue'))
    return 'market'
  if (page === 'app/knowledge.vue')
    return 'knowledge'
  if (page === 'app/user/settings.vue')
    return 'user-settings'
  if (page === 'app/settings.vue')
    return 'workspace-settings'
  if (page.startsWith('app/admin/'))
    return 'admin'
  if (page.startsWith('app/spaces/'))
    return 'spaces'
  return null
}

function filterPages(pages: NuxtPage[], enabled: Set<ArkAppModule>) {
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const page = pages[index]!
    const owner = page.file ? arkModuleForPage(page.file) : null
    if (owner && !enabled.has(owner)) {
      pages.splice(index, 1)
      continue
    }
    if (page.children?.length)
      filterPages(page.children, enabled)
  }
}

export default defineNuxtModule({
  meta: {
    name: '@kurark/ark-app',
  },
  setup(_options, nuxt) {
    const config = normalizeArkAppConfig((nuxt.options as typeof nuxt.options & { ark?: ArkConfig }).ark?.app)
    const publicRuntime = nuxt.options.runtimeConfig.public as Record<string, unknown>
    publicRuntime.arkApp = config
    const enabled = new Set(config.modules)
    nuxt.hook('pages:extend', pages => filterPages(pages, enabled))
  },
})

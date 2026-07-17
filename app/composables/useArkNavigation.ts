import type { MaybeRefOrGetter } from 'vue'
import type { ArkCapabilityLike } from '../../db/zod'

interface CoreNavigationItem {
  capability?: ArkCapabilityLike
  icon: string
  label: string
  to: string
}

const navigationItems: CoreNavigationItem[] = [
  { capability: 'forum.access', icon: 'i-lucide-messages-square', label: 'nav.forum', to: '/app/forum' },
  { capability: 'market.access', icon: 'i-lucide-store', label: 'nav.market', to: '/app/jobs' },
  { capability: 'knowledge.access', icon: 'i-lucide-file-text', label: 'nav.knowledge', to: '/app/knowledge' },
]

export function useArkNavigation(capabilities: MaybeRefOrGetter<readonly ArkCapabilityLike[]> = []) {
  const appConfig = useArkAppConfig()
  return computed(() => {
    const enabled = new Set(toValue(capabilities))
    const modules = new Set(appConfig.value.modules)
    const core = navigationItems.filter((item) => {
      if (item.to === '/app/forum' && !modules.has('forum'))
        return false
      if (item.to === '/app/jobs' && !modules.has('market'))
        return false
      if (item.to === '/app/knowledge' && !modules.has('knowledge'))
        return false
      return !item.capability || enabled.has(item.capability)
    })
    const tenant = appConfig.value.navigation.filter(item => !item.capability || enabled.has(item.capability))
    return [...core, ...tenant]
  })
}

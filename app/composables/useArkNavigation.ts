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
  return computed(() => {
    const enabled = new Set(toValue(capabilities))
    return navigationItems.filter(item => !item.capability || enabled.has(item.capability))
  })
}

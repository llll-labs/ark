import type { ArkCapabilityLike } from '../db/zod'

export const arkAppModuleValues = [
  'channels',
  'spaces',
  'market',
  'forum',
  'knowledge',
  'user-settings',
  'workspace-settings',
  'admin',
] as const

export type ArkAppModule = typeof arkAppModuleValues[number]

export interface ArkAppNavigationItem {
  capability?: ArkCapabilityLike
  icon: string
  id: string
  label: string
  to: `/app${string}`
}

export interface ArkAppConfig {
  home: `/app${string}`
  modules: ArkAppModule[]
  navigation: ArkAppNavigationItem[]
}

export interface ArkConfig {
  app?: Partial<ArkAppConfig>
}

export const defaultArkAppConfig: ArkAppConfig = {
  home: '/app/channels/general',
  modules: [...arkAppModuleValues],
  navigation: [],
}

export function normalizeArkAppConfig(value: Partial<ArkAppConfig> | null | undefined): ArkAppConfig {
  const enabled = new Set(arkAppModuleValues)
  const modules = Array.isArray(value?.modules)
    ? value.modules.filter((item): item is ArkAppModule => enabled.has(item as ArkAppModule))
    : [...defaultArkAppConfig.modules]
  const home = typeof value?.home === 'string' && value.home.startsWith('/app')
    ? value.home as `/app${string}`
    : defaultArkAppConfig.home
  const navigation = Array.isArray(value?.navigation)
    ? value.navigation.filter(item => Boolean(
        item
        && typeof item.id === 'string'
        && typeof item.label === 'string'
        && typeof item.icon === 'string'
        && typeof item.to === 'string'
        && item.to.startsWith('/app'),
      ))
    : []

  return { home, modules, navigation }
}

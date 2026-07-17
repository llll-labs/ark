import type { ArkAppConfig } from '../../types/ark-app'
import { normalizeArkAppConfig } from '../../types/ark-app'

export function useArkAppConfig() {
  const runtime = useRuntimeConfig()
  return computed<ArkAppConfig>(() => normalizeArkAppConfig(runtime.public.arkApp as Partial<ArkAppConfig> | undefined))
}

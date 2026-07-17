import type { ArkApiClient } from '../app/plugins/ark-api'
import type { ArkAppConfig, ArkConfig } from './ark-app'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    ark?: ArkConfig
  }

  interface PublicRuntimeConfig {
    arkApp: ArkAppConfig
  }
}

declare module 'nuxt/app' {
  interface NuxtApp {
    $arkApi: ArkApiClient
  }
}

declare global {
  const defineAppConfig: typeof import('nuxt/app')['defineAppConfig']
  const defineNuxtPlugin: typeof import('nuxt/app')['defineNuxtPlugin']
  const useNuxtApp: typeof import('nuxt/app')['useNuxtApp']
}

export {}

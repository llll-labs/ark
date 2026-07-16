import type { ArkApiClient } from '../app/plugins/ark-api'

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

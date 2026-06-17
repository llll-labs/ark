import type { createTRPCNuxtClient } from 'trpc-nuxt/client'
import type { AppRouter } from '../server/trpc/routers'

type ArkTRPCClient = ReturnType<typeof createTRPCNuxtClient<AppRouter>>

declare module 'nuxt/app' {
  interface NuxtApp {
    $trpc: ArkTRPCClient
  }
}

declare global {
  const defineAppConfig: typeof import('nuxt/app')['defineAppConfig']
  const defineNuxtPlugin: typeof import('nuxt/app')['defineNuxtPlugin']
  const useNuxtApp: typeof import('nuxt/app')['useNuxtApp']
}

export {}

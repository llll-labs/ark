import type { ArkCapabilityLike } from '../../db/zod'

/**
 * Page guard: ensures the visitor is authenticated and holds `capability`.
 * Reads the shared session from `useArkAuth` (already populated by the auth
 * middleware) instead of issuing its own `ark.me` request.
 */
export async function useArkCapabilityGate(capability: ArkCapabilityLike) {
  const route = useRoute()
  const nuxtApp = useNuxtApp()
  const auth = useArkAuth()
  await auth.check()

  if (!auth.me.value?.authenticated) {
    const redirect = encodeURIComponent(route.fullPath)
    await nuxtApp.runWithContext(() => navigateTo(`/login?redirect=${redirect}`, { replace: true }))
    return auth.me
  }

  if (!auth.me.value.capabilities.includes(capability)) {
    throw createError({
      statusCode: 403,
      statusMessage: `Missing capability: ${capability}`,
    })
  }

  return auth.me
}

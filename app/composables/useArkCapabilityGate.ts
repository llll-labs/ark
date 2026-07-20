import type { ArkCapabilityLike } from '../../db/zod'

/**
 * Page guard: ensures the visitor is authenticated and holds `capability`.
 * Reads the shared session from `useArkAuth`, then opts into the separately
 * cached access projection for routes that actually require authorization.
 */
export async function useArkCapabilityGate(capability: ArkCapabilityLike) {
  const route = useRoute()
  const nuxtApp = useNuxtApp()
  const auth = useArkAuth()
  await auth.ready()

  if (!auth.me.value?.authenticated) {
    const redirect = encodeURIComponent(route.fullPath)
    await nuxtApp.runWithContext(() => navigateTo(`/login?redirect=${redirect}`, { replace: true }))
    return auth.access
  }

  const access = await auth.loadAccess()
  if (!access.capabilities.includes(capability)) {
    throw createError({
      statusCode: 403,
      statusMessage: `Missing capability: ${capability}`,
    })
  }

  return auth.access
}

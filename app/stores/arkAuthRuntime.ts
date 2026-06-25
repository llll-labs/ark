import { useNuxtApp } from '#app'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

export interface ArkMeState {
  ark: { id: string, name: string, slug: string }
  arkUser: null | Record<string, any>
  arkUserExtension: null | Record<string, any>
  authenticated: boolean
  capabilities: string[]
  memberships: Record<string, any>[]
  session: null | Record<string, any>
  user: null | Record<string, any>
}

export interface ArkOAuthStatus {
  configured: boolean
}

export interface ArkPublicSettings {
  authJson?: unknown
  [key: string]: unknown
}

function authRuntimeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message)
    return error.message
  if (error && typeof error === 'object') {
    const data = 'data' in error ? (error as { data?: any }).data : null
    if (data?.statusMessage)
      return String(data.statusMessage)
    if (data?.message)
      return String(data.message)
  }
  return fallback
}

export const useArkAuthRuntimeStore = defineStore('ark-auth-runtime', () => {
  const me = shallowRef<ArkMeState | null>(null)
  const checked = ref(false)
  const checking = ref(false)
  const error = ref<string | null>(null)
  const publicSettings = shallowRef<ArkPublicSettings | null>(null)
  const authUiLoaded = ref(false)
  const authUiLoading = ref(false)
  const telegramOAuthStatus = shallowRef<ArkOAuthStatus>({ configured: false })
  const discordOAuthStatus = shallowRef<ArkOAuthStatus>({ configured: false })

  let checkPromise: Promise<ArkMeState | null> | null = null
  let authUiPromise: Promise<void> | null = null

  const authenticated = computed(() => Boolean(me.value?.authenticated))

  async function check(force = false) {
    if (checked.value && !force)
      return me.value
    if (!force && checkPromise)
      return checkPromise

    const nuxtApp = useNuxtApp()
    const run = async () => {
      checking.value = true
      error.value = null
      try {
        const result = await (nuxtApp.$trpc as any).ark.me.query()
        me.value = result
        checked.value = true
        return result as ArkMeState
      }
      catch (cause) {
        me.value = null
        checked.value = true
        error.value = authRuntimeErrorMessage(cause, 'Session check failed')
        return null
      }
      finally {
        checking.value = false
      }
    }

    checkPromise = run().finally(() => {
      checkPromise = null
    })
    return checkPromise
  }

  async function loadAuthUi(force = false) {
    if (authUiLoaded.value && !force)
      return
    if (!force && authUiPromise)
      return authUiPromise

    const nuxtApp = useNuxtApp()
    authUiPromise = (async () => {
      authUiLoading.value = true
      try {
        const [settings, telegramStatus, discordStatus] = await Promise.all([
          (nuxtApp.$trpc as any).ark.settings.public.query().catch(() => null),
          $fetch<ArkOAuthStatus>('/api/ark/auth/telegram-oauth/status').catch(() => ({ configured: false })),
          $fetch<ArkOAuthStatus>('/api/ark/auth/discord-oauth/status').catch(() => ({ configured: false })),
        ])

        publicSettings.value = settings
        telegramOAuthStatus.value = telegramStatus ?? { configured: false }
        discordOAuthStatus.value = discordStatus ?? { configured: false }
        authUiLoaded.value = true
      }
      finally {
        authUiLoading.value = false
      }
    })().finally(() => {
      authUiPromise = null
    })

    return authUiPromise
  }

  async function preload() {
    await Promise.allSettled([
      check(),
      loadAuthUi(),
    ])
  }

  function resetSession() {
    me.value = null
    checked.value = false
  }

  return {
    authUiLoaded,
    authUiLoading,
    authenticated,
    check,
    checked,
    checking,
    discordOAuthStatus,
    error,
    loadAuthUi,
    me,
    preload,
    publicSettings,
    resetSession,
    telegramOAuthStatus,
  }
})

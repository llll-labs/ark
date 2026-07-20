import { useNuxtApp } from '#app'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { arkApiErrorMessage } from '../utils/arkApiError'

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

  let requestPromise: Promise<ArkMeState | null> | null = null
  let initializationPromise: Promise<ArkMeState | null> | null = null
  let authUiPromise: Promise<void> | null = null

  const authenticated = computed(() => Boolean(me.value?.authenticated))

  function requestMe() {
    if (requestPromise)
      return requestPromise
    const nuxtApp = useNuxtApp()
    const run = async () => {
      checking.value = true
      error.value = null
      try {
        const result = await nuxtApp.$arkApi.query('me')
        me.value = result
        checked.value = true
        return result as ArkMeState
      }
      catch (cause) {
        me.value = null
        checked.value = true
        error.value = arkApiErrorMessage(cause, 'Session check failed')
        return null
      }
      finally {
        checking.value = false
      }
    }

    requestPromise = run().finally(() => {
      requestPromise = null
    })
    return requestPromise
  }

  function initialize() {
    initializationPromise ??= checked.value
      ? Promise.resolve(me.value)
      : requestMe()
    return initializationPromise
  }

  function ready() {
    return initializationPromise ?? Promise.resolve(me.value)
  }

  async function refresh() {
    if (requestPromise)
      await requestPromise
    return requestMe()
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
          nuxtApp.$arkApi.query('settings.public').catch(() => null),
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

  function resetSession() {
    me.value = null
    checked.value = false
  }

  return {
    authUiLoaded,
    authUiLoading,
    authenticated,
    checked,
    checking,
    discordOAuthStatus,
    error,
    initialize,
    loadAuthUi,
    me,
    publicSettings,
    ready,
    refresh,
    resetSession,
    telegramOAuthStatus,
  }
})

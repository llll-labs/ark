import { useNuxtApp } from '#app'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { arkApiErrorMessage } from '../utils/arkApiError'

export interface ArkMeState {
  ark: { id: string, name: string, slug: string }
  authenticated: boolean
  session: null | Record<string, any>
  user: null | Record<string, any>
}

export interface ArkProfileState {
  arkUser: null | Record<string, any>
  arkUserExtension: null | Record<string, any>
}

export interface ArkAccessState {
  capabilities: string[]
  memberships: Record<string, any>[]
}

export interface ArkOAuthStatus {
  configured: boolean
}

export interface ArkPublicSettings {
  authJson?: unknown
  [key: string]: unknown
}

export const useArkAuthRuntimeStore = defineStore('ark-auth-runtime', () => {
  const nuxtApp = useNuxtApp()
  const me = shallowRef<ArkMeState | null>(null)
  const access = shallowRef<ArkAccessState | null>(null)
  const accessLoaded = ref(false)
  const accessLoading = ref(false)
  const accessError = ref<string | null>(null)
  const profileState = shallowRef<ArkProfileState | null>(null)
  const profileLoaded = ref(false)
  const profileLoading = ref(false)
  const profileError = ref<string | null>(null)
  const checked = ref(false)
  const checking = ref(false)
  const error = ref<string | null>(null)
  const publicSettings = shallowRef<ArkPublicSettings | null>(null)
  const authUiLoaded = ref(false)
  const authUiLoading = ref(false)
  const telegramOAuthStatus = shallowRef<ArkOAuthStatus>({ configured: false })
  const discordOAuthStatus = shallowRef<ArkOAuthStatus>({ configured: false })

  let requestPromise: Promise<ArkMeState | null> | null = null
  let accessPromise: Promise<ArkAccessState> | null = null
  let profilePromise: Promise<ArkProfileState> | null = null
  let initializationPromise: Promise<ArkMeState | null> | null = null
  let authUiPromise: Promise<void> | null = null

  const authenticated = computed(() => Boolean(me.value?.authenticated))

  function requestMe() {
    if (requestPromise)
      return requestPromise
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
    if (!checked.value)
      return initialize()
    return requestPromise ?? Promise.resolve(me.value)
  }

  async function refresh() {
    if (requestPromise)
      await requestPromise
    resetAccess()
    resetProfile()
    return requestMe()
  }

  function loadProfile(force = false) {
    if (profileLoaded.value && !force)
      return Promise.resolve(profileState.value ?? { arkUser: null, arkUserExtension: null })
    if (profilePromise)
      return profilePromise

    profilePromise = (async () => {
      await ready()
      if (!authenticated.value) {
        const empty = { arkUser: null, arkUserExtension: null }
        profileState.value = empty
        profileLoaded.value = true
        return empty
      }

      profileLoading.value = true
      profileError.value = null
      try {
        const result = await nuxtApp.$arkApi.query('profile') as ArkProfileState
        profileState.value = result
        profileLoaded.value = true
        return result
      }
      catch (cause) {
        profileError.value = arkApiErrorMessage(cause, 'Profile load failed')
        throw cause
      }
      finally {
        profileLoading.value = false
      }
    })().finally(() => {
      profilePromise = null
    })
    return profilePromise
  }

  function loadAccess(force = false) {
    if (accessLoaded.value && !force)
      return Promise.resolve(access.value ?? { capabilities: [], memberships: [] })
    if (accessPromise)
      return accessPromise

    accessPromise = (async () => {
      await ready()
      if (!authenticated.value) {
        const empty = { capabilities: [], memberships: [] }
        access.value = empty
        accessLoaded.value = true
        return empty
      }

      accessLoading.value = true
      accessError.value = null
      try {
        const result = await nuxtApp.$arkApi.query('access') as ArkAccessState
        access.value = result
        accessLoaded.value = true
        return result
      }
      catch (cause) {
        accessError.value = arkApiErrorMessage(cause, 'Access check failed')
        throw cause
      }
      finally {
        accessLoading.value = false
      }
    })().finally(() => {
      accessPromise = null
    })
    return accessPromise
  }

  function resetAccess() {
    access.value = null
    accessLoaded.value = false
    accessError.value = null
  }

  function resetProfile() {
    profileState.value = null
    profileLoaded.value = false
    profileError.value = null
  }

  async function loadAuthUi(force = false) {
    if (authUiLoaded.value && !force)
      return
    if (!force && authUiPromise)
      return authUiPromise

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
    initializationPromise = null
    resetAccess()
    resetProfile()
  }

  return {
    access,
    accessError,
    accessLoaded,
    accessLoading,
    authUiLoaded,
    authUiLoading,
    authenticated,
    checked,
    checking,
    discordOAuthStatus,
    error,
    initialize,
    loadAccess,
    loadAuthUi,
    loadProfile,
    me,
    profileError,
    profileLoaded,
    profileLoading,
    profileState,
    publicSettings,
    ready,
    refresh,
    resetSession,
    telegramOAuthStatus,
  }
})

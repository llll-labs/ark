import { emailOTPClient, genericOAuthClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'
import { storeToRefs } from 'pinia'
import { useArkAuthRuntimeStore } from '../stores/arkAuthRuntime'
import { arkApiErrorMessage } from '../utils/arkApiError'

export const arkAuthClient = createAuthClient({
  plugins: [emailOTPClient(), genericOAuthClient()],
})

export const {
  signIn,
  signOut,
  signUp,
} = arkAuthClient

interface ArkAuthRegisterInput {
  email: string
  name?: string
  password: string
}

function defaultName(email: string) {
  return email.split('@')[0] || 'Ark user'
}

function absoluteAuthUrl(path: string) {
  if (typeof window === 'undefined')
    return path
  return new URL(path, window.location.origin).toString()
}

export function useArkAuth() {
  const runtime = useArkAuthRuntimeStore()
  const {
    access,
    accessError,
    accessLoaded,
    accessLoading,
    checked,
    checking,
    error,
    me,
    profileError,
    profileLoaded,
    profileLoading,
    profileState,
  } = storeToRefs(runtime)
  const nuxtApp = useNuxtApp()

  const user = computed(() => me.value?.user ?? null)
  const profile = computed(() => profileState.value?.arkUser ?? null)
  const profileExtension = computed(() => profileState.value?.arkUserExtension ?? null)
  const authenticated = computed(() => runtime.authenticated)
  const capabilities = computed(() => access.value?.capabilities ?? [])
  const memberships = computed(() => access.value?.memberships ?? [])

  function localeHeaders(): Record<string, string> {
    const locale = (nuxtApp.$i18n as { locale?: string | { value?: string } } | undefined)?.locale
    const code = typeof locale === 'string' ? locale : locale?.value
    return code ? { 'x-ark-locale': code } : {}
  }

  async function login(email: string, password: string) {
    error.value = null
    try {
      await $fetch('/api/auth/sign-in/email', {
        body: { email, password },
        credentials: 'include',
        headers: localeHeaders(),
        method: 'POST',
      })
      await completeAuthProfile()
      return await runtime.refresh()
    }
    catch (cause) {
      error.value = arkApiErrorMessage(cause, 'Login failed')
      throw new Error(error.value)
    }
  }

  async function register(input: ArkAuthRegisterInput) {
    error.value = null
    try {
      await $fetch('/api/auth/sign-up/email', {
        body: {
          email: input.email,
          name: input.name?.trim() || defaultName(input.email),
          password: input.password,
        },
        credentials: 'include',
        headers: localeHeaders(),
        method: 'POST',
      })
      await sendEmailVerificationOtp(input.email)
      return { verificationRequired: true }
    }
    catch (cause) {
      error.value = arkApiErrorMessage(cause, 'Registration failed')
      throw new Error(error.value)
    }
  }

  async function requestPasswordReset(email: string) {
    error.value = null
    try {
      await $fetch('/api/auth/request-password-reset', {
        body: {
          email,
          redirectTo: absoluteAuthUrl('/login'),
        },
        credentials: 'include',
        headers: localeHeaders(),
        method: 'POST',
      })
      return { sent: true }
    }
    catch (cause) {
      error.value = arkApiErrorMessage(cause, 'Password reset request failed')
      throw new Error(error.value)
    }
  }

  async function resetPassword(token: string, newPassword: string) {
    error.value = null
    try {
      await $fetch('/api/auth/reset-password', {
        body: { newPassword, token },
        credentials: 'include',
        headers: localeHeaders(),
        method: 'POST',
      })
      return { reset: true }
    }
    catch (cause) {
      error.value = arkApiErrorMessage(cause, 'Password reset failed')
      throw new Error(error.value)
    }
  }

  async function sendEmailVerificationOtp(email: string) {
    error.value = null
    try {
      await $fetch('/api/ark/auth/email-verification-otp', {
        body: { email },
        credentials: 'include',
        headers: localeHeaders(),
        method: 'POST',
      })
      return { sent: true }
    }
    catch (cause) {
      error.value = arkApiErrorMessage(cause, 'Verification code send failed')
      throw new Error(error.value)
    }
  }

  async function resendEmailVerificationOtp(email: string) {
    return sendEmailVerificationOtp(email)
  }

  async function verifyEmailOtp(email: string, otp: string) {
    error.value = null
    try {
      await $fetch('/api/auth/email-otp/verify-email', {
        body: { email, otp },
        credentials: 'include',
        method: 'POST',
      })
      await completeAuthProfile()
      return await runtime.refresh()
    }
    catch (cause) {
      error.value = arkApiErrorMessage(cause, 'Verification failed')
      throw new Error(error.value)
    }
  }

  async function loginWithTelegramMini(initData: string) {
    error.value = null
    try {
      await $fetch('/api/auth/telegram-mini', {
        body: { initData },
        credentials: 'include',
        method: 'POST',
      })
      await completeAuthProfile()
      return await runtime.refresh()
    }
    catch (cause) {
      error.value = arkApiErrorMessage(cause, 'Telegram login failed')
      throw new Error(error.value)
    }
  }

  async function loginWithTelegramOAuth(redirect?: unknown) {
    error.value = null
    try {
      const target = safeRedirect(redirect) || '/app/jobs'
      const result = await arkAuthClient.signIn.oauth2({
        callbackURL: absoluteAuthUrl(target),
        errorCallbackURL: absoluteAuthUrl('/login?telegram_error=oauth'),
        providerId: 'telegram',
      })
      const url = result.data?.url
      if (url && typeof window !== 'undefined') {
        window.location.href = url
        return null
      }
      return result
    }
    catch (cause) {
      error.value = arkApiErrorMessage(cause, 'Telegram login failed')
      throw new Error(error.value)
    }
  }

  async function completeAuthProfile() {
    await $fetch('/api/ark/auth/complete', {
      credentials: 'include',
      method: 'POST',
    })
  }

  async function completeProfile() {
    error.value = null
    try {
      await completeAuthProfile()
      const me = await runtime.refresh()
      await runtime.loadProfile(true)
      return me
    }
    catch (cause) {
      error.value = arkApiErrorMessage(cause, 'Profile completion failed')
      throw new Error(error.value)
    }
  }

  async function loginWithDiscordOAuth(redirect?: unknown) {
    error.value = null
    try {
      const target = safeRedirect(redirect) || '/app/jobs'
      const result = await arkAuthClient.signIn.oauth2({
        callbackURL: absoluteAuthUrl(target),
        errorCallbackURL: absoluteAuthUrl('/login?discord_error=oauth'),
        providerId: 'discord',
      })
      const url = result.data?.url
      if (url && typeof window !== 'undefined') {
        window.location.href = url
        return null
      }
      return result
    }
    catch (cause) {
      error.value = arkApiErrorMessage(cause, 'Discord login failed')
      throw new Error(error.value)
    }
  }

  async function logout() {
    error.value = null
    runtime.resetSession()
    if (import.meta.client) {
      suppressTelegramMiniAutoAuth()
      window.location.assign('/api/ark/auth/logout')
      return
    }
    await signOut().catch(() => null)
  }

  return {
    access,
    accessError,
    accessLoaded,
    accessLoading,
    authenticated,
    capabilities,
    checked,
    checking,
    completeProfile,
    error,
    login,
    loginWithDiscordOAuth,
    loginWithTelegramMini,
    loginWithTelegramOAuth,
    loadAccess: runtime.loadAccess,
    loadProfile: runtime.loadProfile,
    logout,
    me,
    memberships,
    profile,
    profileError,
    profileExtension,
    profileLoaded,
    profileLoading,
    register,
    requestPasswordReset,
    ready: runtime.ready,
    refresh: runtime.refresh,
    resendEmailVerificationOtp,
    resetPassword,
    user,
    verifyEmailOtp,
  }
}

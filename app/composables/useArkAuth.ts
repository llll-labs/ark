import { emailOTPClient, genericOAuthClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'

export const arkAuthClient = createAuthClient({
  plugins: [emailOTPClient(), genericOAuthClient()],
})

export const {
  signIn,
  signOut,
  signUp,
  useSession,
} = arkAuthClient

interface ArkAuthRegisterInput {
  email: string
  name?: string
  password: string
}

interface ArkMeState {
  ark: { id: string, name: string, slug: string }
  arkUser: null | Record<string, any>
  authenticated: boolean
  capabilities: string[]
  memberships: Record<string, any>[]
  session: null | Record<string, any>
  user: null | Record<string, any>
}

function authErrorMessage(error: unknown, fallback: string) {
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

function defaultName(email: string) {
  return email.split('@')[0] || 'Ark user'
}

function absoluteAuthUrl(path: string) {
  if (typeof window === 'undefined')
    return path
  return new URL(path, window.location.origin).toString()
}

export function useArkAuth() {
  const me = useState<ArkMeState | null>('ark-auth-me', () => null)
  const checked = useState('ark-auth-checked', () => false)
  const checking = useState('ark-auth-checking', () => false)
  const error = useState<string | null>('ark-auth-error', () => null)
  const nuxtApp = useNuxtApp()

  const user = computed(() => me.value?.user ?? null)
  const profile = computed(() => me.value?.arkUser ?? null)
  const authenticated = computed(() => Boolean(me.value?.authenticated))

  function localeHeaders(): Record<string, string> {
    const locale = (nuxtApp.$i18n as { locale?: string | { value?: string } } | undefined)?.locale
    const code = typeof locale === 'string' ? locale : locale?.value
    return code ? { 'x-ark-locale': code } : {}
  }

  async function check(force = false) {
    if (checked.value && !force)
      return me.value

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
      error.value = authErrorMessage(cause, 'Session check failed')
      return null
    }
    finally {
      checking.value = false
    }
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
      return await check(true)
    }
    catch (cause) {
      error.value = authErrorMessage(cause, 'Login failed')
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
      error.value = authErrorMessage(cause, 'Registration failed')
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
      error.value = authErrorMessage(cause, 'Verification code send failed')
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
      return await check(true)
    }
    catch (cause) {
      error.value = authErrorMessage(cause, 'Verification failed')
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
      return await check(true)
    }
    catch (cause) {
      error.value = authErrorMessage(cause, 'Telegram login failed')
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
      error.value = authErrorMessage(cause, 'Telegram login failed')
      throw new Error(error.value)
    }
  }

  async function completeAuthProfile() {
    await $fetch('/api/ark/auth/complete', {
      credentials: 'include',
      method: 'POST',
    })
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
      error.value = authErrorMessage(cause, 'Discord login failed')
      throw new Error(error.value)
    }
  }

  async function logout() {
    error.value = null
    me.value = null
    checked.value = false
    if (import.meta.client) {
      suppressTelegramMiniAutoAuth()
      window.location.assign('/api/ark/auth/logout')
      return
    }
    await signOut().catch(() => null)
  }

  return {
    authenticated,
    check,
    checked,
    checking,
    error,
    login,
    loginWithDiscordOAuth,
    loginWithTelegramMini,
    loginWithTelegramOAuth,
    logout,
    me,
    profile,
    register,
    resendEmailVerificationOtp,
    user,
    verifyEmailOtp,
  }
}

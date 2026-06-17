<script setup lang="ts">
definePageMeta({
  layout: false,
})

const route = useRoute()
const auth = useArkAuth()
const telegram = useTelegramMiniAuth()
const { $trpc } = useNuxtApp()
const { t } = useI18n()

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const verificationCode = ref('')
const verificationEmail = ref('')
const pending = ref(false)
const discordOauthPending = ref(false)
const telegramOauthPending = ref(false)
const hasTelegramMiniLaunch = ref(false)
const errorMessage = ref('')
const infoMessage = ref('')

const { data: settings } = await useAsyncData('ark-login-settings', () => $trpc.ark.settings.public.query().catch(() => null))
const { data: telegramOAuthStatus } = await useAsyncData('ark-telegram-oauth-status', () =>
  $fetch<{ configured: boolean }>('/api/ark/auth/telegram-oauth/status').catch(() => ({ configured: false })))
const { data: discordOAuthStatus } = await useAsyncData('ark-discord-oauth-status', () =>
  $fetch<{ configured: boolean }>('/api/ark/auth/discord-oauth/status').catch(() => ({ configured: false })))

const authJson = computed<Record<string, any>>(() => {
  const value = settings.value?.authJson
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
})
const emailPasswordEnabled = computed(() => authJson.value.email_password_enabled !== false)
const telegramEnabled = computed(() => Boolean(authJson.value.telegram_enabled))
const registrationMode = computed(() => String(authJson.value.registration_mode ?? (authJson.value.registration_enabled === false ? 'closed' : 'open')))
const registrationEnabled = computed(() => registrationMode.value === 'open')
const inviteLikeRegistration = computed(() => ['invite', 'invited', 'invite_only', 'invite-only'].includes(registrationMode.value))
const telegramOauthConfigured = computed(() => Boolean(telegramOAuthStatus.value?.configured))
const discordOauthConfigured = computed(() => Boolean(discordOAuthStatus.value?.configured))
const discordEnabled = computed(() => Boolean(authJson.value.discord_enabled) && discordOauthConfigured.value)
const telegramDisabled = computed(() => telegramEnabled.value && !hasTelegramMiniLaunch.value && !telegramOauthConfigured.value)
const verifyingEmail = computed(() => Boolean(verificationEmail.value))
const loginTabs = computed<Array<{ icon: string, id: 'login' | 'register', label: string }>>(() => [
  { icon: 'i-lucide-log-in', id: 'login', label: t('auth.tabLogin') },
  ...(registrationEnabled.value ? [{ icon: 'i-lucide-user-plus', id: 'register' as const, label: t('auth.tabRegister') }] : []),
])

const inputUi = {
  base: 'h-11 rounded-lg border border-default bg-default px-10 text-default placeholder:text-muted focus:border-primary focus:ring-0',
  leadingIcon: 'text-muted',
}

function redirectTarget() {
  return safeRedirect(route.query.redirect) || '/'
}

async function postAuthTarget(target = redirectTarget()) {
  const me = await auth.check(true)
  const finalTarget = target === '/onboarding' ? '/app/jobs' : target
  return onboardingRedirectTarget(settings.value, me, finalTarget) || finalTarget
}

async function finishAuthenticated() {
  const me = await auth.check(true)
  if (me?.authenticated)
    await navigateTo(await postAuthTarget(), { replace: true })
}

function isEmailVerificationError(message: string) {
  return /email.*verified|EMAIL_NOT_VERIFIED/i.test(message)
}

function startEmailVerification(targetEmail: string) {
  verificationEmail.value = targetEmail.trim().toLowerCase()
  verificationCode.value = ''
  password.value = ''
  mode.value = 'login'
}

function cancelEmailVerification() {
  verificationEmail.value = ''
  verificationCode.value = ''
}

function normalizedVerificationCode() {
  return verificationCode.value.replace(/\D/g, '').slice(0, 6)
}

async function resendVerificationCode() {
  if (!verificationEmail.value || pending.value)
    return
  errorMessage.value = ''
  infoMessage.value = ''
  pending.value = true
  try {
    await auth.resendEmailVerificationOtp(verificationEmail.value)
    infoMessage.value = t('auth.verificationCodeSent')
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.failed')
  }
  finally {
    pending.value = false
  }
}

async function submit() {
  if (!emailPasswordEnabled.value || pending.value)
    return
  if (!verifyingEmail.value && mode.value === 'register' && !registrationEnabled.value)
    return
  errorMessage.value = ''
  infoMessage.value = ''
  pending.value = true
  try {
    if (verifyingEmail.value) {
      await auth.verifyEmailOtp(verificationEmail.value, normalizedVerificationCode())
      await navigateTo(await postAuthTarget(), { replace: true })
      return
    }
    else if (mode.value === 'register') {
      // Name is collected later in onboarding; Better Auth requires a non-empty
      // name, so seed it from the email local-part as a placeholder.
      const trimmedEmail = email.value.trim()
      await auth.register({
        email: trimmedEmail,
        name: trimmedEmail.split('@')[0] || trimmedEmail,
        password: password.value,
      })
      startEmailVerification(trimmedEmail)
      infoMessage.value = t('auth.verificationCodeSent')
      return
    }
    else {
      await auth.login(email.value.trim(), password.value)
    }
    await navigateTo(await postAuthTarget(), { replace: true })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (isEmailVerificationError(message)) {
      const trimmedEmail = email.value.trim()
      if (trimmedEmail) {
        try {
          await auth.resendEmailVerificationOtp(trimmedEmail)
          startEmailVerification(trimmedEmail)
          infoMessage.value = t('auth.verificationCodeSent')
        }
        catch (sendError) {
          errorMessage.value = sendError instanceof Error ? sendError.message : t('auth.failed')
        }
      }
      else {
        errorMessage.value = t('auth.verifyEmailCodeFirst')
      }
    }
    else {
      errorMessage.value = message || t('auth.failed')
    }
  }
  finally {
    pending.value = false
  }
}

async function loginWithTelegram() {
  if (pending.value || telegram.pending.value || telegramOauthPending.value)
    return
  errorMessage.value = ''
  infoMessage.value = ''
  try {
    if (telegram.hasLaunchParams()) {
      const target = await telegram.authenticate(route.query.redirect)
      await navigateTo(await postAuthTarget(target), { replace: true })
      return
    }

    if (!telegramOauthConfigured.value)
      throw new Error(t('auth.telegramUnavailable'))

    telegramOauthPending.value = true
    await auth.loginWithTelegramOAuth(route.query.redirect)
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.telegramFailed')
  }
  finally {
    telegramOauthPending.value = false
  }
}

async function loginWithDiscord() {
  if (pending.value || discordOauthPending.value)
    return
  errorMessage.value = ''
  infoMessage.value = ''
  try {
    if (!discordOauthConfigured.value)
      throw new Error(t('auth.discordUnavailable'))

    discordOauthPending.value = true
    await auth.loginWithDiscordOAuth(route.query.redirect)
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.discordFailed')
  }
  finally {
    discordOauthPending.value = false
  }
}

onMounted(async () => {
  hasTelegramMiniLaunch.value = telegram.hasLaunchParams()
  await finishAuthenticated()
  if (telegramEnabled.value && hasTelegramMiniLaunch.value && !isTelegramMiniAutoAuthSuppressed()) {
    await loginWithTelegram()
  }
})
</script>

<template>
  <main class="grid min-h-dvh place-items-center bg-muted px-4 py-8 text-default">
    <section class="w-full max-w-[420px] overflow-hidden rounded-xl border border-default bg-default shadow-2xl ring-1 ring-default">
      <header class="flex justify-center border-b border-default px-6 pb-5 pt-6">
        <ArkLogo />
      </header>

      <div class="space-y-4 px-6 py-6">
        <UAlert v-if="infoMessage" color="primary" variant="subtle" :title="infoMessage" />
        <UAlert v-if="errorMessage || auth.error.value || telegram.error.value" color="error" variant="subtle" :title="errorMessage || auth.error.value || telegram.error.value" />

        <button
          v-if="discordEnabled"
          type="button"
          class="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-muted px-3 text-sm font-semibold text-highlighted transition hover:bg-accented disabled:cursor-not-allowed disabled:opacity-60"
          @click="loginWithDiscord"
        >
          <UIcon :name="discordOauthPending ? 'i-lucide-loader-circle' : 'i-lucide-hash'" class="size-4 text-primary" :class="{ 'animate-spin': discordOauthPending }" />
          <span>{{ $t('auth.continueDiscord') }}</span>
        </button>
        <button
          v-if="telegramEnabled"
          type="button"
          class="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-accented px-3 text-sm font-semibold text-highlighted transition hover:bg-accented/80 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="telegramDisabled"
          @click="loginWithTelegram"
        >
          <UIcon :name="telegram.pending.value || telegramOauthPending ? 'i-lucide-loader-circle' : 'i-lucide-send'" class="size-4" :class="{ 'animate-spin': telegram.pending.value || telegramOauthPending }" />
          {{ $t('auth.continueTelegram') }}
        </button>
        <p v-if="telegramDisabled" class="text-xs text-muted">
          {{ $t('auth.telegramUnavailable') }}
        </p>

        <div v-if="emailPasswordEnabled" class="space-y-5">
          <form v-if="verifyingEmail" class="space-y-4" @submit.prevent="submit">
            <UInput
              :model-value="verificationEmail"
              class="w-full"
              disabled
              icon="i-lucide-mail"
              size="md"
              type="email"
              variant="none"
              :ui="inputUi"
            />
            <UInput
              v-model="verificationCode"
              autofocus
              class="w-full"
              icon="i-lucide-key-round"
              inputmode="numeric"
              maxlength="6"
              :placeholder="$t('auth.verificationCode')"
              size="md"
              type="text"
              variant="none"
              :ui="inputUi"
            />

            <div class="grid gap-3 border-t border-default pt-4">
              <UButton
                type="submit"
                block
                color="primary"
                size="lg"
                icon="i-lucide-check"
                :loading="pending"
                :disabled="normalizedVerificationCode().length !== 6"
              >
                {{ $t('auth.verifyCode') }}
              </UButton>
              <div class="flex items-center justify-between gap-2">
                <UButton type="button" color="neutral" variant="ghost" @click="cancelEmailVerification">
                  {{ $t('common.back') }}
                </UButton>
                <UButton type="button" color="neutral" variant="soft" icon="i-lucide-refresh-cw" :loading="pending" @click="resendVerificationCode">
                  {{ $t('auth.resendCode') }}
                </UButton>
              </div>
            </div>
          </form>

          <div v-else class="grid grid-cols-2 rounded-lg bg-muted p-1">
            <button
              v-for="tab in loginTabs"
              :key="tab.id"
              type="button"
              class="flex h-9 items-center justify-center gap-2 rounded-md text-sm font-semibold transition"
              :class="mode === tab.id ? 'bg-accented text-highlighted' : 'text-muted hover:text-default'"
              @click="mode = tab.id"
            >
              <UIcon :name="tab.icon" class="size-4" />
              <span>{{ tab.label }}</span>
            </button>
          </div>

          <form v-if="!verifyingEmail" class="space-y-4" @submit.prevent="submit">
            <UInput
              v-model="email"
              autofocus
              class="w-full"
              icon="i-lucide-mail"
              :placeholder="$t('auth.email')"
              size="md"
              type="email"
              variant="none"
              :ui="inputUi"
            />
            <UInput
              v-model="password"
              class="w-full"
              icon="i-lucide-lock"
              :placeholder="$t('auth.password')"
              size="md"
              type="password"
              variant="none"
              :ui="inputUi"
            />

            <div class="flex items-center justify-end gap-2 border-t border-default pt-4">
              <UButton type="button" color="neutral" variant="ghost" to="/">
                {{ $t('common.back') }}
              </UButton>
              <UButton
                type="submit"
                color="primary"
                variant="soft"
                :icon="mode === 'register' ? 'i-lucide-user-plus' : 'i-lucide-log-in'"
                :loading="pending"
                :disabled="!email.trim() || !password"
              >
                {{ mode === 'register' ? $t('auth.createAccount') : $t('auth.login') }}
              </UButton>
            </div>
          </form>
        </div>

        <p v-else class="text-sm text-muted">
          {{ $t('auth.emailDisabled') }}
        </p>

        <p v-if="inviteLikeRegistration" class="text-xs text-muted">
          {{ $t('auth.inviteOnly') }}
        </p>
        <p v-else-if="!registrationEnabled && registrationMode !== 'open'" class="text-xs text-muted">
          {{ $t('auth.registrationStatus', { mode: registrationMode }) }}
        </p>

        <ArkLocaleSelect />
      </div>
    </section>
  </main>
</template>

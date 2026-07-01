<script setup lang="ts">
import { storeToRefs } from 'pinia'

interface AuthPanelStat {
  label: string
  value: string
}

const props = withDefaults(defineProps<{
  autoTelegramMiniAuth?: boolean
  brandSubtitle?: string
  brandTitle?: string
  compact?: boolean
  intentTitle?: string
  oauthRedirect?: unknown
  showBack?: boolean
  stats?: AuthPanelStat[]
}>(), {
  autoTelegramMiniAuth: false,
  brandSubtitle: '',
  brandTitle: '',
  compact: false,
  intentTitle: '',
  oauthRedirect: undefined,
  showBack: false,
  stats: () => [],
})

const emit = defineEmits<{
  'authenticated': [target?: string]
  'navigate': []
}>()

const auth = useArkAuth()
const authRuntime = useArkAuthRuntimeStore()
const telegram = useTelegramMiniAuth()
const { discordOAuthStatus, publicSettings: settings, telegramOAuthStatus } = storeToRefs(authRuntime)
const { t } = useI18n()
const route = useRoute()

const mode = ref<'forgot' | 'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const resetEmail = ref('')
const resetPassword = ref('')
const resetPasswordConfirm = ref('')
const verificationCode = ref('')
const verificationEmail = ref('')
const legalAccepted = ref(false)
const legalRequired = ref(false)
const pending = ref(false)
const discordOauthPending = ref(false)
const telegramOauthPending = ref(false)
const hasTelegramMiniLaunch = ref(false)
const telegramMiniAutoAuthStarted = ref(false)
const errorMessage = ref('')
const infoMessage = ref('')

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
const legalReady = computed(() => verifyingEmail.value || !legalRequired.value || legalAccepted.value)
const passwordConfirmRequired = computed(() => mode.value === 'register' && !verifyingEmail.value)
const passwordsMatch = computed(() => !passwordConfirmRequired.value || password.value === passwordConfirm.value)
const resetPasswordToken = computed(() => {
  const token = route.query.token
  return Array.isArray(token) ? String(token[0] ?? '').trim() : String(token ?? '').trim()
})
const resetPasswordsMatch = computed(() => !resetPasswordConfirm.value || resetPassword.value === resetPasswordConfirm.value)
const canSubmit = computed(() => {
  if (!email.value.trim() || !password.value)
    return false
  if (!passwordsMatch.value)
    return false
  return legalReady.value
})
const canRequestPasswordReset = computed(() => Boolean(resetEmail.value.trim()) && !pending.value)
const canResetPassword = computed(() => Boolean(resetPasswordToken.value) && resetPassword.value.length >= 8 && resetPassword.value === resetPasswordConfirm.value && !pending.value)
const loginTabs = computed<Array<{ icon: string, id: 'login' | 'register', label: string }>>(() => [
  { icon: 'i-lucide-log-in', id: 'login', label: t('auth.tabLogin') },
  ...(registrationEnabled.value ? [{ icon: 'i-lucide-user-plus', id: 'register' as const, label: t('auth.tabRegister') }] : []),
])
const oauthRedirectTarget = computed(() => props.oauthRedirect)

const inputUi = computed(() => ({
  base: `${props.compact ? 'h-11' : 'h-12'} rounded-lg border border-default bg-default px-10 text-default placeholder:text-muted focus:border-primary focus:ring-0`,
  leadingIcon: 'text-muted',
}))

async function finishAuth(target?: string) {
  await auth.check(true)
  emit('authenticated', target)
}

function isEmailVerificationError(message: string) {
  return /email.*verified|EMAIL_NOT_VERIFIED/i.test(message)
}

function startEmailVerification(targetEmail: string) {
  verificationEmail.value = targetEmail.trim().toLowerCase()
  verificationCode.value = ''
  password.value = ''
  passwordConfirm.value = ''
  mode.value = 'login'
}

function cancelEmailVerification() {
  verificationEmail.value = ''
  verificationCode.value = ''
}

function normalizedVerificationCode() {
  return verificationCode.value.replace(/\D/g, '').slice(0, 6)
}

function startPasswordResetRequest() {
  resetEmail.value = email.value.trim()
  password.value = ''
  passwordConfirm.value = ''
  errorMessage.value = ''
  infoMessage.value = ''
  mode.value = 'forgot'
}

async function requestPasswordReset() {
  if (!canRequestPasswordReset.value)
    return
  errorMessage.value = ''
  infoMessage.value = ''
  pending.value = true
  try {
    await auth.requestPasswordReset(resetEmail.value.trim())
    infoMessage.value = t('auth.passwordResetEmailSent')
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.passwordResetRequestFailed')
  }
  finally {
    pending.value = false
  }
}

async function submitPasswordReset() {
  if (!canResetPassword.value)
    return
  errorMessage.value = ''
  infoMessage.value = ''
  pending.value = true
  try {
    await auth.resetPassword(resetPasswordToken.value, resetPassword.value)
    resetPassword.value = ''
    resetPasswordConfirm.value = ''
    mode.value = 'login'
    await navigateTo('/login', { replace: true })
    infoMessage.value = t('auth.passwordResetComplete')
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.passwordResetFailed')
  }
  finally {
    pending.value = false
  }
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
  if (!emailPasswordEnabled.value || pending.value || !legalReady.value)
    return
  if (!verifyingEmail.value && mode.value === 'register' && !registrationEnabled.value)
    return
  if (!verifyingEmail.value && mode.value === 'register' && !passwordsMatch.value) {
    errorMessage.value = t('auth.passwordMismatch')
    return
  }
  errorMessage.value = ''
  infoMessage.value = ''
  pending.value = true
  try {
    if (verifyingEmail.value) {
      await auth.verifyEmailOtp(verificationEmail.value, normalizedVerificationCode())
      await finishAuth()
      return
    }
    else if (mode.value === 'register') {
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
    await finishAuth()
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
      const target = await telegram.authenticate(oauthRedirectTarget.value)
      await finishAuth(target)
      return
    }

    if (!telegramOauthConfigured.value)
      throw new Error(t('auth.telegramUnavailable'))

    telegramOauthPending.value = true
    await auth.loginWithTelegramOAuth(oauthRedirectTarget.value)
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
    await auth.loginWithDiscordOAuth(oauthRedirectTarget.value)
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.discordFailed')
  }
  finally {
    discordOauthPending.value = false
  }
}

function maybeAutoTelegramMiniAuth() {
  if (telegramMiniAutoAuthStarted.value || !props.autoTelegramMiniAuth || !telegramEnabled.value || !hasTelegramMiniLaunch.value || isTelegramMiniAutoAuthSuppressed())
    return
  telegramMiniAutoAuthStarted.value = true
  void loginWithTelegram()
}

onMounted(() => {
  void authRuntime.loadAuthUi()
  hasTelegramMiniLaunch.value = telegram.hasLaunchParams()
  maybeAutoTelegramMiniAuth()
})

watch(telegramEnabled, maybeAutoTelegramMiniAuth)

watch(mode, () => {
  passwordConfirm.value = ''
  legalAccepted.value = false
})

watch(() => route.query.error, (error) => {
  if (String(error ?? '') === 'INVALID_TOKEN')
    errorMessage.value = t('auth.passwordResetInvalid')
}, { immediate: true })

watch(legalRequired, (required) => {
  if (!required)
    legalAccepted.value = true
})
</script>

<template>
  <div>
    <header v-if="brandTitle || intentTitle || brandSubtitle || stats.length" class="text-center">
      <div v-if="brandTitle" class="flex justify-center text-primary">
        <ArkLogo size="md" />
      </div>
      <h2 v-else class="text-3xl font-semibold text-primary">
        {{ brandTitle || intentTitle || $t('auth.tabLogin') }}
      </h2>
      <p v-if="intentTitle && brandTitle && intentTitle !== brandTitle" class="mt-2 text-sm font-semibold text-highlighted">
        {{ intentTitle }}
      </p>
      <p v-if="brandSubtitle" class="mt-2 text-sm leading-6 text-muted">
        {{ brandSubtitle }}
      </p>
    </header>

    <div v-if="stats.length" class="mt-6 grid grid-cols-3 gap-3 text-center">
      <div v-for="stat in stats" :key="`${stat.value}-${stat.label}`" class="min-w-0">
        <div class="truncate text-2xl font-semibold text-primary">
          {{ stat.value }}
        </div>
        <div class="mt-1 text-xs leading-4 text-muted">
          {{ stat.label }}
        </div>
      </div>
    </div>

    <div :class="brandTitle || intentTitle || brandSubtitle || stats.length ? 'mt-6 space-y-4' : 'space-y-4'">
      <UAlert v-if="infoMessage" color="primary" variant="subtle" :title="infoMessage" />
      <UAlert v-if="errorMessage || auth.error.value || telegram.error.value" color="error" variant="subtle" :title="errorMessage || auth.error.value || telegram.error.value" />

      <button
        v-if="discordEnabled"
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-md bg-muted px-3 text-sm font-semibold text-highlighted transition hover:bg-accented disabled:cursor-not-allowed disabled:opacity-60"
        :class="compact ? 'h-9' : 'h-11'"
        @click="loginWithDiscord"
      >
        <UIcon v-if="discordOauthPending" name="i-lucide-loader-circle" class="size-4 animate-spin text-primary" />
        <svg v-else class="size-4 shrink-0 text-primary" viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden="true">
          <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 57.18.54 81.37A105.73 105.73 0 0 0 32.71 96.36a77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2.03a75.57 75.57 0 0 0 64.25 0c.87.71 1.76 1.39 2.66 2.03a68.68 68.68 0 0 1-10.87 5.19 77.6 77.6 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-14.99c2.64-28.05-4.51-52.39-18.83-73.3ZM42.45 66.47c-6.27 0-11.45-5.76-11.45-12.84s5.08-12.85 11.45-12.85S53.57 46.55 53.5 53.63s-5.05 12.84-11.05 12.84Zm42.24 0c-6.27 0-11.45-5.76-11.45-12.84s5.08-12.85 11.45-12.85 11.16 5.77 11.05 12.85-5.05 12.84-11.05 12.84Z" />
        </svg>
        <span>{{ $t('auth.continueDiscord') }}</span>
      </button>
      <button
        v-if="telegramEnabled"
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-md bg-accented px-3 text-sm font-semibold text-highlighted transition hover:bg-accented/80 disabled:cursor-not-allowed disabled:opacity-60"
        :class="compact ? 'h-9' : 'h-11'"
        :disabled="telegramDisabled"
        @click="loginWithTelegram"
      >
        <UIcon v-if="telegram.pending.value || telegramOauthPending" name="i-lucide-loader-circle" class="size-4 animate-spin" />
        <svg v-else class="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M9.99 15.67 9.6 21.18c.57 0 .82-.25 1.11-.54l2.67-2.55 5.54 4.06c1.02.56 1.73.27 2.01-.94l3.64-17.05c.32-1.5-.54-2.09-1.52-1.73L1.64 10.66c-1.46.57-1.44 1.39-.25 1.76l5.47 1.7L19.58 6.16c.6-.4 1.14-.18.69.22z" />
        </svg>
        {{ $t('auth.continueTelegram') }}
      </button>
      <p v-if="telegramDisabled" class="text-xs text-muted">
        {{ $t('auth.telegramUnavailable') }}
      </p>

      <div v-if="emailPasswordEnabled" class="space-y-5">
        <form v-if="resetPasswordToken" class="space-y-4" @submit.prevent="submitPasswordReset">
          <UInput
            v-model="resetPassword"
            autofocus
            class="w-full"
            icon="i-lucide-lock"
            :placeholder="$t('auth.newPassword')"
            size="md"
            type="password"
            variant="none"
            :ui="inputUi"
          />
          <UInput
            v-model="resetPasswordConfirm"
            class="w-full"
            icon="i-lucide-lock-keyhole"
            :placeholder="$t('auth.passwordConfirm')"
            size="md"
            type="password"
            variant="none"
            :ui="inputUi"
          />
          <p v-if="resetPasswordConfirm && !resetPasswordsMatch" class="text-xs text-error">
            {{ $t('auth.passwordMismatch') }}
          </p>

          <div class="grid gap-2 border-t border-default pt-4">
            <UButton
              type="submit"
              color="primary"
              variant="solid"
              block
              icon="i-lucide-key-round"
              :loading="pending"
              :disabled="!canResetPassword"
            >
              {{ $t('auth.setNewPassword') }}
            </UButton>
          </div>
        </form>

        <form v-else-if="verifyingEmail" class="space-y-4" @submit.prevent="submit">
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

        <div v-else-if="mode !== 'forgot'" class="grid grid-cols-2 rounded-lg bg-muted p-1">
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

        <form v-if="!resetPasswordToken && mode === 'forgot'" class="space-y-4" @submit.prevent="requestPasswordReset">
          <UInput
            v-model="resetEmail"
            autofocus
            class="w-full"
            icon="i-lucide-mail"
            :placeholder="$t('auth.email')"
            size="md"
            type="email"
            variant="none"
            :ui="inputUi"
          />

          <div class="grid gap-2 border-t border-default pt-4">
            <UButton
              type="submit"
              color="primary"
              variant="solid"
              block
              icon="i-lucide-mail-check"
              :loading="pending"
              :disabled="!canRequestPasswordReset"
            >
              {{ $t('auth.sendPasswordReset') }}
            </UButton>
            <UButton type="button" color="neutral" variant="ghost" block @click="mode = 'login'">
              {{ $t('common.back') }}
            </UButton>
          </div>
        </form>

        <form v-else-if="!verifyingEmail && !resetPasswordToken" class="space-y-4" @submit.prevent="submit">
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
          <UInput
            v-if="mode === 'register'"
            v-model="passwordConfirm"
            class="w-full"
            icon="i-lucide-lock-keyhole"
            :placeholder="$t('auth.passwordConfirm')"
            size="md"
            type="password"
            variant="none"
            :ui="inputUi"
          />
          <p v-if="mode === 'register' && passwordConfirm && !passwordsMatch" class="text-xs text-error">
            {{ $t('auth.passwordMismatch') }}
          </p>

          <ArkAuthLegalLinks
            v-model:accepted="legalAccepted"
            :mode="mode === 'register' ? 'register' : 'login'"
            @navigate="emit('navigate')"
            @update:required="legalRequired = $event"
          />

          <div class="grid gap-2 border-t border-default pt-4">
            <UButton
              type="submit"
              color="primary"
              variant="solid"
              block
              :loading="pending"
              :disabled="!canSubmit"
            >
              {{ mode === 'register' ? $t('auth.createAccount') : $t('auth.login') }}
            </UButton>
            <UButton v-if="showBack && mode === 'login'" type="button" color="neutral" variant="ghost" block to="/">
              {{ $t('common.back') }}
            </UButton>
            <UButton v-if="mode === 'login'" type="button" color="neutral" variant="ghost" block icon="i-lucide-circle-help" @click="startPasswordResetRequest">
              {{ $t('auth.forgotPassword') }}
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
    </div>
  </div>
</template>

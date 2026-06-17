<script setup lang="ts">
interface AuthModalStat {
  label: string
  value: string
}

const props = withDefaults(defineProps<{
  brandSubtitle?: string
  brandTitle?: string
  legalAgreementUrl?: string
  legalOfferUrl?: string
  legalPrivacyUrl?: string
  intentTitle?: string
  modelValue: boolean
  stats?: AuthModalStat[]
}>(), {
  brandSubtitle: '',
  brandTitle: '',
  intentTitle: '',
  legalAgreementUrl: '',
  legalOfferUrl: '',
  legalPrivacyUrl: '',
  stats: () => [],
})

const emit = defineEmits<{
  'authenticated': []
  'update:modelValue': [value: boolean]
}>()

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
const legalAccepted = ref(false)
const pending = ref(false)
const discordOauthPending = ref(false)
const telegramOauthPending = ref(false)
const hasTelegramMiniLaunch = ref(false)
const errorMessage = ref('')
const infoMessage = ref('')

const open = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const { data: settings } = await useAsyncData('ark-auth-modal-settings', () => $trpc.ark.settings.public.query().catch(() => null))
const { data: telegramOAuthStatus } = await useAsyncData('ark-auth-modal-telegram-oauth-status', () =>
  $fetch<{ configured: boolean }>('/api/ark/auth/telegram-oauth/status').catch(() => ({ configured: false })))
const { data: discordOAuthStatus } = await useAsyncData('ark-auth-modal-discord-oauth-status', () =>
  $fetch<{ configured: boolean }>('/api/ark/auth/discord-oauth/status').catch(() => ({ configured: false })))

const authJson = computed<Record<string, any>>(() => {
  const value = settings.value?.authJson
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
})
const emailPasswordEnabled = computed(() => authJson.value.email_password_enabled !== false)
const telegramEnabled = computed(() => Boolean(authJson.value.telegram_enabled))
const registrationMode = computed(() => String(authJson.value.registration_mode ?? (authJson.value.registration_enabled === false ? 'closed' : 'open')))
const registrationEnabled = computed(() => registrationMode.value === 'open')
const telegramOauthConfigured = computed(() => Boolean(telegramOAuthStatus.value?.configured))
const discordOauthConfigured = computed(() => Boolean(discordOAuthStatus.value?.configured))
const discordEnabled = computed(() => Boolean(authJson.value.discord_enabled) && discordOauthConfigured.value)
const telegramDisabled = computed(() => telegramEnabled.value && !hasTelegramMiniLaunch.value && !telegramOauthConfigured.value)
const legalRequired = computed(() => Boolean(props.legalAgreementUrl || props.legalOfferUrl || props.legalPrivacyUrl))
const legalRequiredForRegistration = computed(() => legalRequired.value && mode.value === 'register')
const verifyingEmail = computed(() => Boolean(verificationEmail.value))
const legalReady = computed(() => verifyingEmail.value || !legalRequiredForRegistration.value || legalAccepted.value)
const loginTabs = computed<Array<{ icon: string, id: 'login' | 'register', label: string }>>(() => [
  { icon: 'i-lucide-log-in', id: 'login', label: t('auth.tabLogin') },
  ...(registrationEnabled.value ? [{ icon: 'i-lucide-user-plus', id: 'register' as const, label: t('auth.tabRegister') }] : []),
])

const inputUi = {
  base: 'h-12 rounded-lg border border-default bg-default px-10 text-default placeholder:text-muted focus:border-primary focus:ring-0',
  leadingIcon: 'text-muted',
}
const modalUi = {
  body: '!p-0',
  content: 'w-[min(520px,calc(100vw-1.5rem))] !max-w-none divide-y-0 overflow-hidden bg-default text-default ring-1 ring-default shadow-2xl',
  header: 'hidden',
  overlay: 'bg-black/70 backdrop-blur-sm',
}

async function finishAuth() {
  await auth.check(true)
  emit('authenticated')
  open.value = false
}

function closeForNavigation() {
  open.value = false
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
  if (!emailPasswordEnabled.value || pending.value || !legalReady.value)
    return
  if (!verifyingEmail.value && mode.value === 'register' && !registrationEnabled.value)
    return
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
      await telegram.authenticate(route.fullPath)
      await finishAuth()
      return
    }

    if (!telegramOauthConfigured.value)
      throw new Error(t('auth.telegramUnavailable'))

    telegramOauthPending.value = true
    await auth.loginWithTelegramOAuth(route.fullPath)
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
    await auth.loginWithDiscordOAuth(route.fullPath)
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.discordFailed')
  }
  finally {
    discordOauthPending.value = false
  }
}

onMounted(() => {
  hasTelegramMiniLaunch.value = telegram.hasLaunchParams()
})
</script>

<template>
  <UModal v-model:open="open" :title="intentTitle || $t('auth.tabLogin')" :ui="modalUi">
    <template #header>
      <div />
    </template>
    <template #body>
      <div class="relative p-6 sm:p-7">
        <button
          type="button"
          class="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-accented hover:text-default"
          aria-label="Закрыть"
          @click="open = false"
        >
          <UIcon name="i-lucide-x" class="size-5" />
        </button>

        <header class="text-center">
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

        <div class="mt-6 space-y-4">
          <UAlert v-if="infoMessage" color="primary" variant="subtle" :title="infoMessage" />
          <UAlert v-if="errorMessage || auth.error.value || telegram.error.value" color="error" variant="subtle" :title="errorMessage || auth.error.value || telegram.error.value" />

          <button
            v-if="discordEnabled"
            type="button"
            class="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-muted px-3 text-sm font-semibold text-highlighted transition hover:bg-accented disabled:cursor-not-allowed disabled:opacity-60"
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
            class="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accented px-3 text-sm font-semibold text-highlighted transition hover:bg-accented/80 disabled:cursor-not-allowed disabled:opacity-60"
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
              <UButton
                type="submit"
                block
                color="primary"
                size="lg"
                :loading="pending"
                :disabled="!email.trim() || !password || !legalReady"
              >
                {{ mode === 'register' ? $t('auth.createAccount') : $t('auth.login') }}
              </UButton>
            </form>

            <label v-if="legalRequiredForRegistration" class="flex gap-3 rounded-lg border border-default bg-muted/50 p-3 text-xs leading-5 text-toned">
              <input
                v-model="legalAccepted"
                type="checkbox"
                class="mt-0.5 size-4 shrink-0 rounded border border-default bg-default accent-primary"
              >
              <span>
                {{ $t('auth.legalAcceptPrefix') }}
                <NuxtLink v-if="legalAgreementUrl" :to="legalAgreementUrl" class="text-primary hover:underline" @click="closeForNavigation">{{ $t('auth.legalAgreement') }}</NuxtLink><span v-if="legalAgreementUrl && (legalOfferUrl || legalPrivacyUrl)">, </span>
                <NuxtLink v-if="legalOfferUrl" :to="legalOfferUrl" class="text-primary hover:underline" @click="closeForNavigation">{{ $t('auth.legalOffer') }}</NuxtLink><span v-if="legalOfferUrl && legalPrivacyUrl"> {{ $t('auth.legalAnd') }} </span>
                <NuxtLink v-if="legalPrivacyUrl" :to="legalPrivacyUrl" class="text-primary hover:underline" @click="closeForNavigation">{{ $t('auth.legalPrivacy') }}</NuxtLink>.
              </span>
            </label>

            <p v-else-if="legalRequired" class="text-center text-xs leading-5 text-muted">
              {{ $t('auth.oauthLegalPrefix') }}
              <NuxtLink v-if="legalAgreementUrl" :to="legalAgreementUrl" class="text-primary hover:underline" @click="closeForNavigation">
                {{ $t('auth.legalAgreement') }}
              </NuxtLink><span v-if="legalAgreementUrl && (legalOfferUrl || legalPrivacyUrl)">, </span>
              <NuxtLink v-if="legalOfferUrl" :to="legalOfferUrl" class="text-primary hover:underline" @click="closeForNavigation">
                {{ $t('auth.legalOffer') }}
              </NuxtLink><span v-if="legalOfferUrl && legalPrivacyUrl"> {{ $t('auth.legalAnd') }} </span>
              <NuxtLink v-if="legalPrivacyUrl" :to="legalPrivacyUrl" class="text-primary hover:underline" @click="closeForNavigation">
                {{ $t('auth.legalPrivacy') }}
              </NuxtLink>.
            </p>

            <ArkLocaleSelect />
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

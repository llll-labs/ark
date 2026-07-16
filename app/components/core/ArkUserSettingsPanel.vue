<script setup lang="ts">
import ArkAvatar from './ArkAvatar.vue'
import ArkSettingField from './ArkSettingField.vue'
import ArkSettingsSection from './ArkSettingsSection.vue'
import ArkStoreForm from './ArkStoreForm.vue'

const props = withDefaults(defineProps<{
  isNarrowWindow?: boolean
  maximized?: boolean
  showClose?: boolean
  showMaximize?: boolean
  showOpenPage?: boolean
}>(), {
  isNarrowWindow: false,
  maximized: false,
  showClose: false,
  showMaximize: false,
  showOpenPage: false,
})
const emit = defineEmits<{
  close: []
  toggleMaximized: []
}>()

const { $arkApi } = useNuxtApp()
const { t, locale, locales, setLocale } = useI18n()
const auth = useArkAuth()

// Persist the explicit language choice across reloads without enabling browser
// auto-detection (the app keeps `ru` as the default for new visitors). The
// `ark-locale` plugin reads this cookie on boot and applies it before render.
const localeCookie = useCookie<string | null>('ark_locale', { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' })
const localeItems = computed(() => (locales.value as Array<{ code: string, name?: string }>).map(item => ({
  label: item.name ?? item.code,
  value: item.code,
})))
const localeModel = computed({
  get: () => locale.value,
  set: (code: string) => {
    if (code === locale.value)
      return
    localeCookie.value = code
    void setLocale(code as typeof locale.value)
  },
})
const sections = computed(() => [
  { id: 'profile', label: t('userSettings.sectionProfile'), icon: 'i-lucide-user-round' },
  { id: 'store', label: t('userSettings.sectionStore'), icon: 'i-lucide-briefcase' },
  { id: 'appearance', label: t('userSettings.sectionAppearance'), icon: 'i-lucide-monitor-cog' },
  { id: 'notifications', label: t('userSettings.sectionNotifications'), icon: 'i-lucide-bell' },
  { id: 'account', label: t('userSettings.sectionAccount'), icon: 'i-lucide-circle-user-round' },
] as const)

type SectionId = typeof sections['value'][number]['id']

const activeSection = ref<SectionId>('profile')
const loading = ref(false)
const profile = ref<any>(null)
const loginInfo = ref<{ providers: string[], email: string | null }>({ providers: [], email: null })
const loginMethod = computed(() => loginInfo.value.providers.includes('telegram')
  ? { detail: '', icon: 'i-lucide-send', label: t('userSettings.loginTelegram') }
  : { detail: loginInfo.value.email ?? '', icon: 'i-lucide-mail', label: t('userSettings.loginEmail') })
const { pending: saving, error: errorMessage, success: successMessage, run } = useAsyncAction()

const themeItems = computed(() => [
  { label: t('userSettings.themeSystem'), value: 'system' },
  { label: t('userSettings.themeDark'), value: 'dark' },
  { label: t('userSettings.themeLight'), value: 'light' },
])
const densityItems = computed(() => [
  { label: t('userSettings.densityComfortable'), value: 'comfortable' },
  { label: t('userSettings.densityCompact'), value: 'compact' },
  { label: t('userSettings.densitySpacious'), value: 'spacious' },
])
const avatarInput = ref<HTMLInputElement | null>(null)
const avatarUploadPending = ref(false)

const profileForm = reactive({
  avatarFileId: null as null | string,
  avatarPreviewUrl: '',
  bio: '',
  displayName: '',
  handle: '',
})

const settingsForm = reactive({
  agentEnabled: true,
  agentInstructions: '',
  agentModel: '',
  agentTone: 'concise',
  appearanceCompactNav: false,
  appearanceDensity: 'comfortable',
  appearanceReduceMotion: false,
  appearanceTheme: 'system',
  notificationsDigest: false,
  notificationsEmail: false,
  notificationsInApp: true,
  notificationsJobUpdates: true,
  notificationsMentions: true,
  privacyAllowDirectMessages: true,
  privacyShowOnlineStatus: true,
  privacyShowProfile: true,
})

const rawSettings = reactive({
  agentJson: '{}',
  appearanceJson: '{}',
  notificationsJson: '{}',
  privacyJson: '{}',
})

const displayName = computed(() => profile.value?.displayName || profileForm.displayName || t('userSettings.guest'))
const initials = computed(() => displayName.value.slice(0, 2).toUpperCase())
const activeSectionLabel = computed(() => sections.value.find(section => section.id === activeSection.value)?.label ?? t('userSettings.title'))
const avatarPreviewUrl = computed(() => profileForm.avatarPreviewUrl || arkAvatarFileUrl(profile.value?.avatarFileId))
const handleLabel = computed(() => profileForm.handle ? `@${profileForm.handle}` : t('userSettings.sectionProfile'))
function fillSettings(data: any) {
  const appearance = plainObject(data.settings?.appearanceJson)
  const notifications = plainObject(data.settings?.notificationsJson)
  const privacy = plainObject(data.settings?.privacyJson)
  const agent = plainObject(data.settings?.agentJson)

  profile.value = data.profile
  loginInfo.value = { email: data.login?.email ?? null, providers: data.login?.providers ?? [] }
  profileForm.avatarFileId = data.profile?.avatarFileId ?? null
  profileForm.avatarPreviewUrl = arkAvatarFileUrl(data.profile?.avatarFileId)
  profileForm.bio = data.profile?.bio ?? ''
  profileForm.displayName = data.profile?.displayName ?? ''
  profileForm.handle = data.profile?.handle ?? ''

  rawSettings.appearanceJson = compactJson(appearance)
  rawSettings.notificationsJson = compactJson(notifications)
  rawSettings.privacyJson = compactJson(privacy)
  rawSettings.agentJson = compactJson(agent)

  settingsForm.appearanceTheme = String(appearance.theme ?? 'system')
  settingsForm.appearanceDensity = String(appearance.density ?? 'comfortable')
  settingsForm.appearanceCompactNav = Boolean(appearance.compactNav)
  settingsForm.appearanceReduceMotion = Boolean(appearance.reduceMotion)

  settingsForm.notificationsInApp = notifications.inApp !== false
  settingsForm.notificationsMentions = notifications.mentions !== false
  settingsForm.notificationsJobUpdates = notifications.jobUpdates !== false
  settingsForm.notificationsEmail = Boolean(notifications.email)
  settingsForm.notificationsDigest = Boolean(notifications.digest)

  settingsForm.privacyShowOnlineStatus = privacy.showOnlineStatus !== false
  settingsForm.privacyShowProfile = privacy.showProfile !== false
  settingsForm.privacyAllowDirectMessages = privacy.allowDirectMessages !== false

  settingsForm.agentEnabled = agent.enabled !== false
  settingsForm.agentTone = String(agent.tone ?? 'concise')
  settingsForm.agentModel = String(agent.model ?? '')
  settingsForm.agentInstructions = String(agent.instructions ?? '')
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    fillSettings(await $arkApi.query("users.settings", {}))
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('userSettings.errorSignIn')
  }
  finally {
    loading.value = false
  }
}

async function saveProfile() {
  const result = await run(
    () => $arkApi.mutate("users.updateProfile", {
      avatarFileId: profileForm.avatarFileId,
      bio: profileForm.bio || null,
      displayName: profileForm.displayName,
      handle: profileForm.handle || null,
    }),
    { errorFallback: t('userSettings.profileSaveError'), successMessage: t('userSettings.profileSaved') },
  )
  if (result)
    profile.value = result
}

function chooseAvatarFile() {
  avatarInput.value?.click()
}

function removeAvatar() {
  profileForm.avatarFileId = null
  profileForm.avatarPreviewUrl = ''
}

async function uploadAvatarFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file)
    return

  avatarUploadPending.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const body = new FormData()
    body.append('file', file)
    body.append('visibility', 'public')
    const response = await $fetch<{ files: Array<{ id: string }> }>('/api/ark/files', {
      body,
      method: 'POST',
    })
    const uploaded = response.files[0]
    if (!uploaded?.id)
      throw new Error(t('userSettings.avatarUploadError'))
    profileForm.avatarFileId = uploaded.id
    profileForm.avatarPreviewUrl = `/api/ark/files/${uploaded.id}?variant=thumb`
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('userSettings.avatarUploadError')
  }
  finally {
    avatarUploadPending.value = false
  }
}

async function saveSettings() {
  await run(
    async () => {
      const appearanceJson = {
        ...parseStoredObject(rawSettings.appearanceJson),
        compactNav: settingsForm.appearanceCompactNav,
        density: settingsForm.appearanceDensity,
        reduceMotion: settingsForm.appearanceReduceMotion,
        theme: settingsForm.appearanceTheme,
      }
      const notificationsJson = {
        ...parseStoredObject(rawSettings.notificationsJson),
        digest: settingsForm.notificationsDigest,
        email: settingsForm.notificationsEmail,
        inApp: settingsForm.notificationsInApp,
        jobUpdates: settingsForm.notificationsJobUpdates,
        mentions: settingsForm.notificationsMentions,
      }
      const privacyJson = {
        ...parseStoredObject(rawSettings.privacyJson),
        allowDirectMessages: settingsForm.privacyAllowDirectMessages,
        showOnlineStatus: settingsForm.privacyShowOnlineStatus,
        showProfile: settingsForm.privacyShowProfile,
      }
      const agentJson = {
        ...parseStoredObject(rawSettings.agentJson),
        enabled: settingsForm.agentEnabled,
        instructions: settingsForm.agentInstructions,
        model: settingsForm.agentModel,
        tone: settingsForm.agentTone,
      }
      await $arkApi.mutate("users.updateSettings", {
        agentJson,
        appearanceJson,
        notificationsJson,
        privacyJson,
      })
      rawSettings.appearanceJson = compactJson(appearanceJson)
      rawSettings.notificationsJson = compactJson(notificationsJson)
      rawSettings.privacyJson = compactJson(privacyJson)
      rawSettings.agentJson = compactJson(agentJson)
    },
    { errorFallback: t('userSettings.settingsSaveError'), successMessage: t('userSettings.settingsSaved') },
  )
}

async function logout() {
  await auth.logout()
  emit('close')
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="grid h-full grid-cols-1 bg-default text-default md:grid-cols-[260px_minmax(0,1fr)]" @keydown.esc.stop.prevent="emit('close')">
        <aside class="flex min-h-0 flex-col border-b border-default bg-muted md:border-b-0 md:border-r">
          <div class="flex h-12 shrink-0 items-center border-b border-default px-4">
            <h2 class="truncate text-sm font-semibold text-highlighted">
              {{ $t('userSettings.title') }}
            </h2>
          </div>
          <div class="border-b border-default p-3">
            <div class="flex items-center gap-2">
              <ArkAvatar :src="avatarPreviewUrl" :name="displayName" :initials="initials" size="md" />
              <div class="min-w-0">
                <div class="truncate text-sm font-semibold text-highlighted">
                  {{ displayName }}
                </div>
                <div class="truncate text-xs text-muted">
                  {{ handleLabel }}
                </div>
              </div>
            </div>
          </div>
          <nav class="flex gap-1 overflow-x-auto p-2 md:block md:space-y-1">
            <button
              v-for="section in sections"
              :key="section.id"
              type="button"
              class="flex shrink-0 items-center gap-2 rounded px-3 py-2 text-left text-sm transition md:w-full"
              :class="activeSection === section.id ? 'bg-white/10 text-highlighted' : 'text-toned hover:bg-white/[0.06] hover:text-default'"
              @click="activeSection = section.id"
            >
              <UIcon :name="section.icon" class="size-4 shrink-0" />
              <span class="truncate">{{ section.label }}</span>
            </button>
          </nav>
          <div class="mt-auto hidden border-t border-default p-2 md:block">
            <button type="button" class="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-error transition hover:bg-red-950/30" @click="logout">
              <UIcon name="i-lucide-log-out" class="size-4" />
              <span>{{ $t('userSettings.logOut') }}</span>
            </button>
          </div>
        </aside>

        <section class="min-h-0 overflow-y-auto">
          <header class="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-default bg-default pl-5 pr-3">
            <h3 class="truncate text-base font-semibold text-highlighted">
              {{ activeSectionLabel }}
            </h3>
            <div class="flex items-center gap-1">
              <UButton type="button" size="sm" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :loading="loading" :aria-label="$t('userSettings.reload')" @click="load" />
              <UButton
                v-if="props.showMaximize && !props.isNarrowWindow"
                type="button"
                size="sm"
                color="neutral"
                variant="ghost"
                class="size-9 justify-center"
                :icon="props.maximized ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
                :aria-label="props.maximized ? $t('userSettings.restoreWindow') : $t('userSettings.maximizeWindow')"
                @click="emit('toggleMaximized')"
              />
              <UButton v-if="props.showOpenPage" type="button" size="sm" color="neutral" variant="ghost" icon="i-lucide-external-link" to="/app/user/settings" :aria-label="$t('userSettings.openPage')" />
              <UButton v-if="props.showClose" type="button" size="sm" color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="$t('userSettings.close')" @click="emit('close')" />
            </div>
          </header>

          <div class="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
            <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
            <UAlert v-if="successMessage" color="success" variant="subtle" :title="successMessage" />

            <ArkSettingsSection v-if="activeSection === 'profile'">
              <div class="grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)]">
                <div class="grid content-start justify-items-center gap-3">
                  <ArkAvatar :src="avatarPreviewUrl" :name="displayName" :initials="initials" size="xl" />
                  <div class="text-center">
                    <div class="text-sm font-semibold text-highlighted">
                      {{ displayName }}
                    </div>
                    <div class="text-xs text-muted">
                      {{ handleLabel }}
                    </div>
                  </div>
                </div>

                <div class="grid gap-3">
                  <div class="grid gap-3 md:grid-cols-2">
                    <ArkSettingField :label="$t('userSettings.displayName')" name="displayName">
                      <UInput v-model="profileForm.displayName" class="w-full" />
                    </ArkSettingField>
                    <ArkSettingField :label="$t('userSettings.handle')" name="handle">
                      <UInput v-model="profileForm.handle" class="w-full" placeholder="username" />
                    </ArkSettingField>
                  </div>
                  <ArkSettingField :label="$t('userSettings.avatar')" name="avatarFileId">
                    <div class="flex flex-wrap items-center gap-2">
                      <input ref="avatarInput" class="hidden" type="file" accept="image/*" @change="uploadAvatarFile">
                      <UButton
                        type="button"
                        color="neutral"
                        variant="soft"
                        icon="i-lucide-image-plus"
                        :loading="avatarUploadPending"
                        @click="chooseAvatarFile"
                      >
                        {{ $t('userSettings.changeAvatar') }}
                      </UButton>
                      <UButton
                        v-if="profileForm.avatarFileId"
                        type="button"
                        color="neutral"
                        variant="ghost"
                        icon="i-lucide-trash-2"
                        @click="removeAvatar"
                      >
                        {{ $t('userSettings.removeAvatar') }}
                      </UButton>
                    </div>
                  </ArkSettingField>
                  <ArkSettingField :label="$t('userSettings.bio')" name="bio">
                    <UTextarea v-model="profileForm.bio" class="w-full" :rows="6" />
                  </ArkSettingField>
                  <div class="flex justify-end">
                    <UButton type="button" icon="i-lucide-save" :loading="saving" @click="saveProfile">
                      {{ $t('userSettings.saveProfile') }}
                    </UButton>
                  </div>
                </div>
              </div>
            </ArkSettingsSection>

            <ArkSettingsSection
              v-else-if="activeSection === 'store'"
              :title="$t('userSettings.storeTitle')"
              :description="$t('userSettings.storeDescription')"
            >
              <ArkStoreForm :submit-label="$t('store.saveProfile')" variant="settings" @saved="load" />
            </ArkSettingsSection>

            <ArkSettingsSection v-else-if="activeSection === 'appearance'">
              <div class="grid gap-3 md:grid-cols-2">
                <ArkSettingField :label="$t('userSettings.language')" :hint="$t('userSettings.languageHint')">
                  <USelect v-model="localeModel" :items="localeItems" class="w-full" />
                </ArkSettingField>
                <ArkSettingField :label="$t('userSettings.theme')">
                  <USelect v-model="settingsForm.appearanceTheme" :items="themeItems" class="w-full" />
                </ArkSettingField>
                <ArkSettingField :label="$t('userSettings.density')">
                  <USelect v-model="settingsForm.appearanceDensity" :items="densityItems" class="w-full" />
                </ArkSettingField>
                <ArkSettingField
                  orientation="horizontal"
                  :label="$t('userSettings.compactNav')"
                  :hint="$t('userSettings.compactNavHint')"
                >
                  <USwitch v-model="settingsForm.appearanceCompactNav" />
                </ArkSettingField>
                <ArkSettingField
                  orientation="horizontal"
                  :label="$t('userSettings.reduceMotion')"
                  :hint="$t('userSettings.reduceMotionHint')"
                >
                  <USwitch v-model="settingsForm.appearanceReduceMotion" />
                </ArkSettingField>
              </div>
              <template #actions>
                <UButton type="button" icon="i-lucide-save" :loading="saving" @click="saveSettings">
                  {{ $t('userSettings.saveAppearance') }}
                </UButton>
              </template>
            </ArkSettingsSection>

            <ArkSettingsSection v-else-if="activeSection === 'notifications'">
              <div class="grid gap-2">
                <ArkSettingField orientation="horizontal" :label="$t('userSettings.notificationsInApp')" :hint="$t('userSettings.notificationsInAppHint')">
                  <USwitch v-model="settingsForm.notificationsInApp" />
                </ArkSettingField>
                <ArkSettingField orientation="horizontal" :label="$t('userSettings.notificationsMentions')" :hint="$t('userSettings.notificationsMentionsHint')">
                  <USwitch v-model="settingsForm.notificationsMentions" />
                </ArkSettingField>
                <ArkSettingField orientation="horizontal" :label="$t('userSettings.notificationsJobUpdates')" :hint="$t('userSettings.notificationsJobUpdatesHint')">
                  <USwitch v-model="settingsForm.notificationsJobUpdates" />
                </ArkSettingField>
                <ArkSettingField orientation="horizontal" :label="$t('userSettings.notificationsEmail')" :hint="$t('userSettings.notificationsEmailHint')">
                  <USwitch v-model="settingsForm.notificationsEmail" />
                </ArkSettingField>
                <ArkSettingField orientation="horizontal" :label="$t('userSettings.notificationsDigest')" :hint="$t('userSettings.notificationsDigestHint')">
                  <USwitch v-model="settingsForm.notificationsDigest" />
                </ArkSettingField>
              </div>
              <template #actions>
                <UButton type="button" icon="i-lucide-save" :loading="saving" @click="saveSettings">
                  {{ $t('userSettings.saveNotifications') }}
                </UButton>
              </template>
            </ArkSettingsSection>

            <ArkSettingsSection v-else>
              <div class="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <h4 class="text-sm font-semibold text-highlighted">
                    {{ $t('userSettings.signedInAs', { name: displayName }) }}
                  </h4>
                  <p class="mt-1 text-sm leading-6 text-toned">
                    {{ $t('userSettings.accountDescription') }}
                  </p>
                </div>
                <UButton type="button" color="error" variant="soft" icon="i-lucide-log-out" @click="logout">
                  {{ $t('userSettings.logOut') }}
                </UButton>
              </div>
              <div class="mt-4 flex items-center gap-3 rounded-lg border border-default bg-default px-3 py-2.5">
                <UIcon :name="loginMethod.icon" class="size-4 shrink-0 text-muted" />
                <div class="min-w-0">
                  <div class="text-xs text-muted">
                    {{ $t('userSettings.loginMethod') }}
                  </div>
                  <div class="truncate text-sm text-highlighted">
                    {{ loginMethod.label }}<span v-if="loginMethod.detail" class="text-toned"> · {{ loginMethod.detail }}</span>
                  </div>
                </div>
              </div>
            </ArkSettingsSection>
          </div>
        </section>
      </div>
</template>

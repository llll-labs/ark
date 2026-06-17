<script setup lang="ts">
import ArkSettingField from './ArkSettingField.vue'
import ArkSettingsSection from './ArkSettingsSection.vue'

const props = defineProps<{
  reloadSignal?: number
}>()

const { $trpc } = useNuxtApp()
const { t } = useI18n()
const { pending: saving, error: errorMessage, success: successMessage, run } = useAsyncAction()

const registrationModeItems = computed(() => [
  { label: t('settings.overview.registrationOpen'), value: 'open' },
  { label: t('settings.overview.registrationClosed'), value: 'closed' },
  { label: t('settings.overview.registrationInvite'), value: 'invite' },
])
const onboardingMethodItems = computed(() => [
  { label: t('settings.overview.onboardingPage'), value: 'onboarding' },
  { label: t('settings.overview.profileSettings'), value: 'profile' },
])

const settingsForm = reactive({
  accentColor: '#7dd3fc',
  authJson: '{}',
  dataJson: '{}',
  description: '',
  discordEnabled: false,
  emailPasswordEnabled: true,
  name: 'Ark',
  onboardingEnabled: true,
  onboardingJson: '{}',
  onboardingMethod: 'onboarding',
  onboardingRequired: true,
  onboardingReviewRequired: true,
  portalJson: '{}',
  portalDefaultRoute: '/app/jobs',
  portalPublicRootUnscoped: true,
  primaryColor: '#f5c84b',
  registrationMode: 'closed',
  telegramEnabled: true,
  themeJson: '{}',
})

function fillSettingsForm(row: any) {
  const authJson = plainObject(row?.authJson)
  const onboardingJson = plainObject(row?.onboardingJson)
  const portalJson = plainObject(row?.portalJson)
  settingsForm.name = row?.name ?? 'Ark'
  settingsForm.description = row?.description ?? ''
  settingsForm.primaryColor = row?.primaryColor ?? '#f5c84b'
  settingsForm.accentColor = row?.accentColor ?? '#7dd3fc'
  settingsForm.themeJson = compactJson(row?.themeJson)
  settingsForm.authJson = compactJson(row?.authJson)
  settingsForm.onboardingJson = compactJson(row?.onboardingJson)
  settingsForm.portalJson = compactJson(row?.portalJson)
  settingsForm.dataJson = compactJson(row?.dataJson)
  settingsForm.emailPasswordEnabled = authJson.email_password_enabled !== false
  settingsForm.discordEnabled = Boolean(authJson.discord_enabled)
  settingsForm.telegramEnabled = Boolean(authJson.telegram_enabled)
  settingsForm.registrationMode = String(authJson.registration_mode ?? (authJson.registration_enabled === false ? 'closed' : 'open'))
  settingsForm.onboardingEnabled = onboardingJson.enabled !== false
  settingsForm.onboardingRequired = onboardingJson.required !== false
  settingsForm.onboardingReviewRequired = Boolean(onboardingJson.review_required)
  settingsForm.onboardingMethod = String(onboardingJson.onboarding_method ?? 'onboarding')
  settingsForm.portalDefaultRoute = String(portalJson.default_route ?? '/app/jobs')
  settingsForm.portalPublicRootUnscoped = portalJson.public_root_unscoped !== false
}

const { refresh } = await useAsyncData('ark-settings-overview', async () => {
  const row = await $trpc.ark.settings.admin.query().catch(() => $trpc.ark.settings.public.query())
  fillSettingsForm(row)
  return row
})

watch(() => props.reloadSignal, () => {
  void refresh()
})

async function saveCoreSettings() {
  await run(async () => {
    const authJson = {
      ...parseStoredObject(settingsForm.authJson),
      email_password_enabled: settingsForm.emailPasswordEnabled,
      discord_enabled: settingsForm.discordEnabled,
      registration_enabled: settingsForm.registrationMode === 'open',
      registration_mode: settingsForm.registrationMode,
      telegram_enabled: settingsForm.telegramEnabled,
    }
    const onboardingJson = {
      ...parseStoredObject(settingsForm.onboardingJson),
      enabled: settingsForm.onboardingEnabled,
      onboarding_method: settingsForm.onboardingMethod,
      required: settingsForm.onboardingRequired,
      review_required: settingsForm.onboardingReviewRequired,
    }
    const portalJson = {
      ...parseStoredObject(settingsForm.portalJson),
      default_route: settingsForm.portalDefaultRoute || '/',
      public_root_unscoped: settingsForm.portalPublicRootUnscoped,
    }
    const updated = await $trpc.ark.settings.update.mutate({
      accentColor: settingsForm.accentColor,
      authJson,
      dataJson: parseJsonField('Stored app metadata', settingsForm.dataJson),
      description: settingsForm.description || null,
      name: settingsForm.name,
      onboardingJson,
      portalJson,
      primaryColor: settingsForm.primaryColor,
      themeJson: parseJsonField('Theme settings', settingsForm.themeJson),
    })
    fillSettingsForm(updated)
  }, { successMessage: t('settings.overview.saved'), errorFallback: t('settings.overview.saveFailed') })
}
</script>

<template>
  <section class="grid gap-4">
    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
    <UAlert v-if="successMessage" color="success" variant="subtle" :title="successMessage" />

    <ArkSettingsSection :title="$t('settings.overview.appIdentity')" icon="i-lucide-building-2">
      <div class="grid gap-3 md:grid-cols-2">
        <ArkSettingField :label="$t('settings.overview.name')">
          <UInput v-model="settingsForm.name" class="w-full" />
        </ArkSettingField>
        <ArkSettingField :label="$t('settings.overview.description')">
          <UInput v-model="settingsForm.description" class="w-full" />
        </ArkSettingField>
        <ArkSettingField :label="$t('settings.overview.primaryColor')">
          <input v-model="settingsForm.primaryColor" class="h-8 w-full rounded border border-default bg-default p-1" type="color">
        </ArkSettingField>
        <ArkSettingField :label="$t('settings.overview.accentColor')">
          <input v-model="settingsForm.accentColor" class="h-8 w-full rounded border border-default bg-default p-1" type="color">
        </ArkSettingField>
      </div>
    </ArkSettingsSection>

    <ArkSettingsSection :title="$t('settings.overview.login')" icon="i-lucide-log-in">
      <div class="grid gap-2">
        <ArkSettingField orientation="horizontal" :label="$t('settings.overview.telegramLogin')" :hint="$t('settings.overview.telegramLoginHint')">
          <USwitch v-model="settingsForm.telegramEnabled" />
        </ArkSettingField>
        <ArkSettingField orientation="horizontal" :label="$t('settings.overview.discordLogin')" :hint="$t('settings.overview.discordLoginHint')">
          <USwitch v-model="settingsForm.discordEnabled" />
        </ArkSettingField>
        <ArkSettingField orientation="horizontal" :label="$t('settings.overview.emailLogin')" :hint="$t('settings.overview.emailLoginHint')">
          <USwitch v-model="settingsForm.emailPasswordEnabled" />
        </ArkSettingField>
        <ArkSettingField :label="$t('settings.overview.registrationMode')">
          <USelect v-model="settingsForm.registrationMode" :items="registrationModeItems" class="w-full" />
        </ArkSettingField>
      </div>
    </ArkSettingsSection>

    <ArkSettingsSection :title="$t('settings.overview.onboarding')" icon="i-lucide-clipboard-check">
      <div class="grid gap-2">
        <ArkSettingField orientation="horizontal" :label="$t('settings.overview.enableOnboarding')" :hint="$t('settings.overview.enableOnboardingHint')">
          <USwitch v-model="settingsForm.onboardingEnabled" />
        </ArkSettingField>
        <ArkSettingField orientation="horizontal" :label="$t('settings.overview.requireOnboarding')" :hint="$t('settings.overview.requireOnboardingHint')">
          <USwitch v-model="settingsForm.onboardingRequired" />
        </ArkSettingField>
        <ArkSettingField orientation="horizontal" :label="$t('settings.overview.adminReviewRequired')" :hint="$t('settings.overview.adminReviewRequiredHint')">
          <USwitch v-model="settingsForm.onboardingReviewRequired" />
        </ArkSettingField>
        <ArkSettingField :label="$t('settings.overview.onboardingMethod')">
          <USelect v-model="settingsForm.onboardingMethod" :items="onboardingMethodItems" class="w-full" />
        </ArkSettingField>
      </div>
    </ArkSettingsSection>

    <ArkSettingsSection :title="$t('settings.overview.portal')" icon="i-lucide-route">
      <div class="grid gap-3 md:grid-cols-2">
        <ArkSettingField :label="$t('settings.overview.defaultRoute')">
          <UInput v-model="settingsForm.portalDefaultRoute" class="w-full" placeholder="/app/jobs" />
        </ArkSettingField>
        <ArkSettingField orientation="horizontal" :label="$t('settings.overview.publicRoot')" :hint="$t('settings.overview.publicRootHint')">
          <USwitch v-model="settingsForm.portalPublicRootUnscoped" />
        </ArkSettingField>
      </div>
    </ArkSettingsSection>

    <div class="flex justify-end">
      <UButton type="button" icon="i-lucide-save" :loading="saving" @click="saveCoreSettings">
        {{ $t('settings.overview.saveSettings') }}
      </UButton>
    </div>
  </section>
</template>

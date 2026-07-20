<script setup lang="ts">
import ArkSettingField from './ArkSettingField.vue'

const props = withDefaults(defineProps<{
  allowSkip?: boolean
  reviewRequired?: boolean
  submitLabel?: string
  variant?: 'onboarding' | 'settings'
  // Account space the store belongs to. Defaults to the first space the
  // user can manage (their personal space) when omitted.
  ownerSpaceId?: string
}>(), {
  allowSkip: false,
  reviewRequired: false,
  submitLabel: '',
  variant: 'settings',
  ownerSpaceId: undefined,
})

const emit = defineEmits<{
  saved: [payload: { store: any, reviewPending: boolean }]
  skipped: []
}>()

const { t } = useI18n()
const { $arkApi } = useNuxtApp()
const resolvedSubmitLabel = computed(() => props.submitLabel || t('store.saveProfile'))
const auth = useArkAuth()
const saving = ref(false)
const skipping = ref(false)
const errorMessage = ref('')
const initialized = ref(false)

const form = reactive({
  availability: '',
  bio: '',
  categoryIds: [] as string[],
  displayName: '',
  headline: '',
  location: '',
  name: '',
  portfolioUrl: '',
  rateAmount: '',
  rateCurrency: 'USD',
  rateUnit: 'project',
  serviceSummary: '',
  skillIds: [] as string[],
  styleIds: [] as string[],
  toolIds: [] as string[],
})
const taxonomySections = computed(() => [
  { field: 'categoryIds', kind: 'categories', label: t('store.taxonomyCategories') },
  { field: 'skillIds', kind: 'skills', label: t('store.taxonomySkills') },
  { field: 'toolIds', kind: 'tools', label: t('store.taxonomyTools') },
  { field: 'styleIds', kind: 'styles', label: t('store.taxonomyStyles') },
] as const)

const { data, pending, refresh } = await useAsyncData(`ark-store-form-${props.variant}`, async () => {
  const [userSettings, options, mine] = await Promise.all([
    $arkApi.query("users.settings", {}).catch(() => null),
    $arkApi.query("market.options", {}).catch(() => ({ categories: [], skills: [], styles: [], tags: [], tools: [] })),
    $arkApi.query("market.stores.mine", {}).catch(() => ({ manageableSpaceIds: [], stores: [] })),
  ])
  return { mine, options, userSettings }
})

const options = computed(() => data.value?.options ?? { categories: [], skills: [], styles: [], tags: [], tools: [] })
const mineStores = computed(() => data.value?.mine?.stores ?? [])
const manageableSpaceIds = computed<string[]>(() => data.value?.mine?.manageableSpaceIds ?? [])
const targetSpaceId = computed<string | undefined>(() => props.ownerSpaceId ?? manageableSpaceIds.value[0])
const store = computed(() => mineStores.value.find((row: any) => row.ownerSpaceId === targetSpaceId.value))

function rowsFor(kind: 'categories' | 'skills' | 'styles' | 'tools') {
  return options.value[kind] ?? []
}

function hasRows(kind: 'categories' | 'skills' | 'styles' | 'tools') {
  return rowsFor(kind).length > 0
}

function itemsFor(kind: 'categories' | 'skills' | 'styles' | 'tools') {
  return rowsFor(kind).map((row: any) => ({ label: row.name, value: row.id }))
}

function currentProfileJson() {
  const profileJson = data.value?.userSettings?.profile?.profileJson
  return profileJson && typeof profileJson === 'object' && !Array.isArray(profileJson)
    ? profileJson as Record<string, any>
    : {}
}

function prefill() {
  if (initialized.value)
    return
  const arkUser = data.value?.userSettings?.profile
  const row = store.value
  form.displayName = arkUser?.displayName ?? ''
  form.bio = row?.bio ?? arkUser?.bio ?? ''
  form.name = row?.name ?? arkUser?.displayName ?? ''
  form.availability = row?.availability ?? ''
  form.categoryIds = [...(row?.categoryIds ?? [])]
  form.headline = row?.headline ?? ''
  form.location = row?.location ?? ''
  form.portfolioUrl = row?.portfolioUrl ?? ''
  form.rateAmount = row?.rateAmount ?? ''
  form.rateCurrency = row?.rateCurrency ?? 'USD'
  form.rateUnit = row?.rateUnit ?? 'project'
  form.serviceSummary = row?.serviceSummary ?? ''
  form.skillIds = [...(row?.skillIds ?? [])]
  form.styleIds = [...(row?.styleIds ?? [])]
  form.toolIds = [...(row?.toolIds ?? [])]
  initialized.value = true
}

async function updateOnboardingProfileJson(input: {
  completed: boolean
  dismissed?: boolean
  storeId?: string
  reviewPending?: boolean
}) {
  const arkUser = data.value?.userSettings?.profile
  if (!arkUser)
    throw new Error(t('store.errorAuthRequired'))

  const now = new Date().toISOString()
  const previousJson = currentProfileJson()
  await $arkApi.mutate("users.updateProfile", {
    avatarFileId: arkUser.avatarFileId ?? null,
    bio: form.bio || arkUser.bio || null,
    displayName: form.displayName.trim() || form.name.trim() || arkUser.displayName,
    handle: arkUser.handle ?? null,
    profileJson: {
      ...previousJson,
      onboarding: {
        ...((previousJson.onboarding && typeof previousJson.onboarding === 'object') ? previousJson.onboarding : {}),
        completed: input.completed,
        completedAt: input.completed ? now : null,
        dismissed: Boolean(input.dismissed),
        dismissedAt: input.dismissed ? now : null,
        storeIds: input.storeId ? [input.storeId] : [],
        reviewStatus: input.reviewPending ? 'pending_review' : input.completed ? 'active' : null,
        role: 'seller',
        submittedAt: input.storeId ? now : null,
      },
      onboarding_completed: input.completed,
      onboarding_dismissed: Boolean(input.dismissed),
      onboarding_pending_review: Boolean(input.reviewPending),
    },
  })
  await auth.refresh()
}

async function save() {
  if (!form.name.trim()) {
    errorMessage.value = t('store.errorPublicNameRequired')
    return
  }
  if (!targetSpaceId.value) {
    errorMessage.value = t('store.errorAuthRequired')
    return
  }

  saving.value = true
  errorMessage.value = ''
  try {
    const reviewPending = Boolean(props.reviewRequired)
    const storeRow = await $arkApi.mutate("market.stores.upsert", {
      availability: form.availability || null,
      bio: form.bio || null,
      categoryIds: form.categoryIds,
      headline: form.headline || null,
      location: form.location || null,
      name: form.name.trim(),
      ownerSpaceId: targetSpaceId.value,
      portfolioUrl: form.portfolioUrl || null,
      rateAmount: form.rateAmount || null,
      rateCurrency: form.rateCurrency || null,
      rateUnit: form.rateUnit || null,
      remote: true,
      serviceSummary: form.serviceSummary || null,
      skillIds: form.skillIds,
      status: reviewPending ? 'pending_review' : 'active',
      styleIds: form.styleIds,
      tagIds: [],
      toolIds: form.toolIds,
      id: store.value?.id,
    })
    if (!storeRow)
      throw new Error(t('store.errorProfileNotSaved'))

    await updateOnboardingProfileJson({
      completed: !reviewPending,
      storeId: storeRow.id,
      reviewPending,
    })
    await refresh()
    emit('saved', { store: storeRow, reviewPending })
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('store.errorProfileNotSaved')
  }
  finally {
    saving.value = false
  }
}

async function skip() {
  if (!props.allowSkip || props.reviewRequired)
    return

  skipping.value = true
  errorMessage.value = ''
  try {
    await updateOnboardingProfileJson({
      completed: false,
      dismissed: true,
    })
    emit('skipped')
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('store.errorSkipFailed')
  }
  finally {
    skipping.value = false
  }
}

watch(data, (value) => {
  if (value)
    prefill()
}, { immediate: true })
</script>

<template>
  <div class="grid gap-4">
    <div v-if="pending" class="rounded-lg border border-default bg-muted p-4 text-sm text-toned">
      {{ $t('store.loadingProfile') }}
    </div>

    <form v-else class="grid gap-4" @submit.prevent="save">
      <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />

      <ArkSettingField :label="$t('store.publicName')" required>
        <UInput v-model="form.name" required class="w-full" />
      </ArkSettingField>

      <section class="grid gap-4 lg:grid-cols-2">
        <ArkSettingField
          v-for="section in taxonomySections"
          :key="section.kind"
          :label="section.label"
        >
          <USelectMenu
            v-if="hasRows(section.kind)"
            v-model="form[section.field]"
            multiple
            :items="itemsFor(section.kind)"
            value-key="value"
            :placeholder="$t('store.taxonomySelect', { label: section.label })"
            class="w-full"
          />
          <p v-else class="text-xs text-muted">
            {{ $t('store.taxonomyEmpty', { label: section.label }) }}
          </p>
        </ArkSettingField>
      </section>

      <section class="grid gap-3 sm:grid-cols-2">
        <ArkSettingField :label="$t('store.accountDisplayName')">
          <UInput v-model="form.displayName" class="w-full" />
        </ArkSettingField>
        <ArkSettingField :label="$t('store.headline')">
          <UInput v-model="form.headline" class="w-full" />
        </ArkSettingField>
        <ArkSettingField :label="$t('store.availability')">
          <UInput v-model="form.availability" class="w-full" />
        </ArkSettingField>
      </section>

      <ArkSettingField :label="$t('store.bio')">
        <UTextarea v-model="form.bio" :rows="3" class="w-full" />
      </ArkSettingField>

      <ArkSettingField :label="$t('store.serviceSummary')">
        <UTextarea v-model="form.serviceSummary" :rows="4" class="w-full" />
      </ArkSettingField>

      <section class="grid gap-3 sm:grid-cols-3">
        <ArkSettingField :label="$t('store.rate')">
          <UInput v-model="form.rateAmount" class="w-full" />
        </ArkSettingField>
        <ArkSettingField :label="$t('store.currency')">
          <UInput v-model="form.rateCurrency" class="w-full" />
        </ArkSettingField>
        <ArkSettingField :label="$t('store.unit')">
          <UInput v-model="form.rateUnit" class="w-full" />
        </ArkSettingField>
      </section>

      <ArkSettingField :label="$t('store.portfolioUrl')">
        <UInput v-model="form.portfolioUrl" type="url" class="w-full" />
      </ArkSettingField>

      <footer class="flex justify-end gap-2">
        <UButton v-if="allowSkip && !reviewRequired" type="button" color="neutral" variant="ghost" :loading="skipping" @click="skip">
          {{ $t('store.skip') }}
        </UButton>
        <UButton type="submit" icon="i-lucide-check" :loading="saving">
          {{ resolvedSubmitLabel }}
        </UButton>
      </footer>
    </form>
  </div>
</template>

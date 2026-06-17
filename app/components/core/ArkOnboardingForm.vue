<script setup lang="ts">
const route = useRoute()
const { $trpc } = useNuxtApp()
const auth = useArkAuth()

const { data, pending, refresh } = await useAsyncData('ark-onboarding-auth-step', async () => {
  const me = await auth.check(true)
  const [settings, userSettings, mine] = await Promise.all([
    $trpc.ark.settings.public.query().catch(() => null),
    $trpc.ark.users.settings.query({}).catch(() => null),
    $trpc.ark.market.stores.mine.query({}).catch(() => ({ manageableSpaceIds: [], stores: [] })),
  ])
  return { me, mine, settings, userSettings }
})

const onboardingJson = computed<Record<string, any>>(() => {
  const value = data.value?.settings?.onboardingJson
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
})
const enabled = computed(() => onboardingJson.value.enabled !== false)
const reviewRequired = computed(() => enabled.value && Boolean(onboardingJson.value.review_required ?? onboardingJson.value.reviewRequired))
const required = computed(() => enabled.value && Boolean(onboardingJson.value.required ?? onboardingJson.value.onboarding_required ?? reviewRequired.value))
const profile = computed(() => data.value?.userSettings?.profile ?? data.value?.me?.arkUser ?? auth.me.value?.arkUser ?? null)
const authenticated = computed(() => Boolean(profile.value))
const profileJson = computed<Record<string, any>>(() => {
  const value = profile.value?.profileJson
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
})
const onboardingState = computed<Record<string, any>>(() => {
  const value = profileJson.value.onboarding
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
})
const manageableSpaceIds = computed<string[]>(() => data.value?.mine?.manageableSpaceIds ?? [])
const personalSpaceId = computed<string | undefined>(() => manageableSpaceIds.value[0])
const store = computed(() => (data.value?.mine?.stores ?? []).find((row: any) => row.ownerSpaceId === personalSpaceId.value))
const reviewPending = computed(() => reviewRequired.value && (
  onboardingState.value.reviewStatus === 'pending_review'
  || profileJson.value.onboarding_pending_review
  || store.value?.status === 'pending_review'
))
const redirectTarget = computed(() => {
  const redirect = safeRedirect(route.query.redirect)
  return redirect && redirect !== '/onboarding' ? redirect : '/app/jobs'
})
const loginTarget = computed(() => ({
  path: '/login',
  query: { redirect: redirectTarget.value },
}))
const { t } = useI18n()
const modeLabel = computed(() => {
  if (reviewRequired.value)
    return t('onboarding.modeReviewRequired')
  if (required.value)
    return t('onboarding.modeRequired')
  return t('onboarding.modeOptional')
})

type Intent = 'sell' | 'sellProducts' | 'hire' | 'browse'
const intent = ref<Intent | null>(null)
const intentOptions = computed(() => [
  { value: 'sell' as const, icon: 'i-lucide-palette', label: t('onboarding.intentSell'), hint: t('onboarding.intentSellHint') },
  { value: 'sellProducts' as const, icon: 'i-lucide-package', label: t('onboarding.intentSellProducts'), hint: t('onboarding.intentSellProductsHint') },
  { value: 'hire' as const, icon: 'i-lucide-briefcase', label: t('onboarding.intentHire'), hint: t('onboarding.intentHireHint') },
  { value: 'browse' as const, icon: 'i-lucide-compass', label: t('onboarding.intentBrowse'), hint: t('onboarding.intentBrowseHint') },
])

const busy = ref(false)
const errorMessage = ref('')
const hireForm = reactive({ title: '', summary: '', budgetAmount: '', budgetCurrency: 'USD' })

function previousOnboarding() {
  const value = profileJson.value.onboarding
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

async function completeOnboarding(input: { completed: boolean, dismissed?: boolean, intentValue?: Intent }) {
  const arkUser = profile.value
  if (!arkUser)
    return

  const now = new Date().toISOString()
  await $trpc.ark.users.updateProfile.mutate({
    avatarFileId: arkUser.avatarFileId ?? null,
    bio: arkUser.bio ?? null,
    displayName: arkUser.displayName,
    handle: arkUser.handle ?? null,
    profileJson: {
      ...profileJson.value,
      onboarding: {
        ...previousOnboarding(),
        completed: input.completed,
        completedAt: input.completed ? now : null,
        dismissed: Boolean(input.dismissed),
        dismissedAt: input.dismissed ? now : null,
        intent: input.intentValue ?? intent.value ?? null,
      },
      onboarding_completed: input.completed,
      onboarding_dismissed: Boolean(input.dismissed),
      onboarding_pending_review: false,
    },
  })
  await auth.check(true)
}

async function chooseIntent(value: Intent) {
  errorMessage.value = ''
  if (value === 'browse') {
    busy.value = true
    try {
      await completeOnboarding({ completed: false, dismissed: true, intentValue: value })
      await navigateTo(redirectTarget.value, { replace: true })
    }
    finally {
      busy.value = false
    }
    return
  }
  intent.value = value
}

async function postJob() {
  if (!hireForm.title.trim()) {
    errorMessage.value = t('onboarding.hireErrorTitleRequired')
    return
  }
  if (!personalSpaceId.value) {
    errorMessage.value = t('onboarding.hireErrorFailed')
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    await $trpc.ark.market.jobs.upsert.mutate({
      spaceId: personalSpaceId.value,
      title: hireForm.title.trim(),
      summary: hireForm.summary || undefined,
      budgetAmount: hireForm.budgetAmount || undefined,
      budgetCurrency: hireForm.budgetCurrency || undefined,
      status: 'open',
    })
    await completeOnboarding({ completed: true, intentValue: 'hire' })
    await navigateTo(redirectTarget.value, { replace: true })
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('onboarding.hireErrorFailed')
  }
  finally {
    busy.value = false
  }
}

async function finish() {
  await refresh()
  if (!reviewRequired.value)
    await navigateTo(redirectTarget.value, { replace: true })
}

async function skipped() {
  await refresh()
  await navigateTo(redirectTarget.value, { replace: true })
}
</script>

<template>
  <div>
    <div class="mb-5 flex justify-end">
      <UBadge color="neutral" variant="subtle">
        {{ modeLabel }}
      </UBadge>
    </div>

    <div v-if="pending" class="rounded-lg border border-default bg-muted p-4 text-sm text-toned">
      {{ $t('onboarding.loading') }}
    </div>

    <section v-else-if="!enabled" class="grid gap-4">
      <p class="text-sm leading-6 text-toned">
        {{ $t('onboarding.disabled') }}
      </p>
      <div class="flex justify-end">
        <UButton icon="i-lucide-arrow-right" :to="redirectTarget">
          {{ $t('onboarding.continue') }}
        </UButton>
      </div>
    </section>

    <section v-else-if="!authenticated" class="grid gap-4">
      <p class="text-sm leading-6 text-toned">
        {{ $t('onboarding.signInFirst') }}
      </p>
      <div class="flex justify-end">
        <UButton icon="i-lucide-log-in" :to="loginTarget">
          {{ $t('onboarding.continueToLogin') }}
        </UButton>
      </div>
    </section>

    <section v-else-if="reviewPending" class="grid gap-4 rounded-lg border border-amber-400/20 bg-amber-400/10 p-4">
      <div class="flex gap-3">
        <div class="grid size-10 shrink-0 place-items-center rounded-full bg-amber-300/20 text-amber-100">
          <UIcon name="i-lucide-hourglass" class="size-5" />
        </div>
        <div class="min-w-0">
          <h2 class="text-base font-semibold text-highlighted">
            {{ $t('onboarding.reviewPendingTitle') }}
          </h2>
          <p class="mt-1 text-sm leading-6 text-amber-50/80">
            {{ $t('onboarding.reviewPendingBody') }}
          </p>
        </div>
      </div>
    </section>

    <section v-else-if="!intent" class="grid gap-4">
      <div>
        <h2 class="text-base font-semibold text-highlighted">
          {{ $t('onboarding.intentTitle') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ $t('onboarding.intentSubtitle') }}
        </p>
      </div>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
      <div class="grid gap-2 sm:grid-cols-2">
        <button
          v-for="option in intentOptions"
          :key="option.value"
          type="button"
          :disabled="busy"
          class="flex items-start gap-3 rounded-lg border border-default bg-muted p-4 text-left transition hover:border-white/20 hover:bg-white/[0.04] disabled:opacity-60"
          @click="chooseIntent(option.value)"
        >
          <UIcon :name="option.icon" class="mt-0.5 size-5 text-primary" />
          <span class="grid gap-0.5">
            <span class="text-sm font-medium text-highlighted">{{ option.label }}</span>
            <span class="text-xs leading-5 text-muted">{{ option.hint }}</span>
          </span>
        </button>
      </div>
    </section>

    <ArkStoreForm
      v-else-if="intent === 'sell' || intent === 'sellProducts'"
      :allow-skip="!required && !reviewRequired"
      :review-required="reviewRequired"
      :owner-space-id="personalSpaceId"
      :submit-label="reviewRequired ? $t('onboarding.submitForReview') : $t('onboarding.finish')"
      variant="onboarding"
      @saved="finish"
      @skipped="skipped"
    />

    <section v-else-if="intent === 'hire'" class="grid gap-4">
      <div>
        <h2 class="text-base font-semibold text-highlighted">
          {{ $t('onboarding.hireTitle') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ $t('onboarding.hireSubtitle') }}
        </p>
      </div>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
      <form class="grid gap-3" @submit.prevent="postJob">
        <UFormField :label="$t('onboarding.hireJobTitle')" required>
          <UInput v-model="hireForm.title" required class="w-full" />
        </UFormField>
        <UFormField :label="$t('onboarding.hireJobSummary')">
          <UTextarea v-model="hireForm.summary" :rows="4" class="w-full" />
        </UFormField>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField :label="$t('onboarding.hireJobBudget')">
            <UInput v-model="hireForm.budgetAmount" class="w-full" />
          </UFormField>
          <UFormField :label="$t('onboarding.hireJobCurrency')">
            <UInput v-model="hireForm.budgetCurrency" class="w-full" />
          </UFormField>
        </div>
        <footer class="flex justify-between gap-2">
          <UButton type="button" color="neutral" variant="ghost" :disabled="busy" @click="intent = null">
            {{ $t('onboarding.intentBack') }}
          </UButton>
          <UButton type="submit" icon="i-lucide-check" :loading="busy">
            {{ $t('onboarding.hirePost') }}
          </UButton>
        </footer>
      </form>
    </section>
  </div>
</template>

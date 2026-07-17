export interface ArkOnboardingCompletionInput {
  completed?: boolean
  dismissed?: boolean
  intent?: string | null
  profilePatch?: Record<string, unknown>
}

export async function useArkOnboarding() {
  const auth = useArkAuth()
  const { $arkApi } = useNuxtApp()
  const { data, pending, refresh } = await useAsyncData('ark-onboarding-profile', async () => {
    const me = await auth.check(true)
    const settings = me?.authenticated
      ? await $arkApi.query('users.settings', {}).catch(() => null)
      : null
    return { me, settings }
  })
  const profile = computed(() => data.value?.settings?.profile ?? data.value?.me?.arkUser ?? null)
  const profileJson = computed<Record<string, unknown>>(() => {
    const value = profile.value?.profileJson
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  })

  async function complete(input: ArkOnboardingCompletionInput = {}) {
    const current = profile.value
    if (!current)
      throw new Error('Authentication is required to complete onboarding.')
    const completed = input.completed ?? true
    const dismissed = input.dismissed ?? false
    const now = new Date().toISOString()
    const previous = profileJson.value.onboarding
    const onboarding = previous && typeof previous === 'object' && !Array.isArray(previous)
      ? previous as Record<string, unknown>
      : {}
    await $arkApi.mutate('users.updateProfile', {
      avatarFileId: current.avatarFileId ?? null,
      bio: current.bio ?? null,
      displayName: current.displayName,
      handle: current.handle ?? null,
      profileJson: {
        ...profileJson.value,
        ...input.profilePatch,
        onboarding: {
          ...onboarding,
          completed,
          completedAt: completed ? now : null,
          dismissed,
          dismissedAt: dismissed ? now : null,
          intent: input.intent ?? onboarding.intent ?? null,
        },
        onboarding_completed: completed,
        onboarding_dismissed: dismissed,
        onboarding_pending_review: false,
      },
    })
    await auth.check(true)
    await refresh()
    return profile.value
  }

  return { complete, pending, profile, profileJson, refresh }
}

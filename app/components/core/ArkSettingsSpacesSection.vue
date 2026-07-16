<script setup lang="ts">
import ArkSettingField from './ArkSettingField.vue'

const props = defineProps<{
  reloadSignal?: number
}>()
const selectedSpaceId = defineModel<string>('selectedSpaceId', { default: '' })

const { $arkApi } = useNuxtApp()
const { t } = useI18n()
const { pending: saving, error: errorMessage, success: successMessage, run } = useAsyncAction()
const createSpaceOpen = ref(false)

const spaceKindItems = [
  { label: 'private', value: 'private' },
  { label: 'organization', value: 'organization' },
  { label: 'studio', value: 'studio' },
  { label: 'task', value: 'task' },
  { label: 'admin', value: 'admin' },
]
const visibilityItems = [
  { label: 'private', value: 'private' },
  { label: 'space', value: 'space' },
  { label: 'registered', value: 'registered' },
  { label: 'public', value: 'public' },
]

const spaceForm = reactive({
  description: '',
  inheritAccess: true,
  initialMemberIds: [] as string[],
  initialRoleId: '',
  kind: 'private',
  name: '',
  parentSpaceId: '',
  slug: '',
  visibility: 'private',
})

const { data, refresh } = await useAsyncData('ark-spaces-section', async () => {
  const [allSpaces, allRoles, allUsers] = await Promise.all([
    $arkApi.query("spaces.list", {}).catch(() => []),
    $arkApi.query("roles.list", {}).catch(() => []),
    $arkApi.query("users.list", {}).catch(() => []),
  ])
  return { spaces: allSpaces as any[], roles: allRoles as any[], users: allUsers as any[] }
}, { default: () => ({ spaces: [], roles: [], users: [] }) })

const spaces = computed(() => data.value?.spaces ?? [])
const roles = computed(() => data.value?.roles ?? [])
const users = computed(() => data.value?.users ?? [])

const rootSpace = computed(() => spaces.value.find(space => !space.parentSpaceId) ?? spaces.value[0] ?? null)
const spaceOptions = computed(() => spaces.value.map(space => ({ label: space.name, value: space.id })))
const roleOptions = computed(() => roles.value.map(role => ({ label: role.name, value: role.id })))

watchEffect(() => {
  spaceForm.parentSpaceId ||= rootSpace.value?.id ?? ''
})

watch(() => props.reloadSignal, () => {
  void refresh()
})

watch(() => spaceForm.name, (name) => {
  if (!spaceForm.slug)
    spaceForm.slug = slugify(name)
})

async function createSpace() {
  const parentSpaceId = spaceForm.parentSpaceId || rootSpace.value?.id
  if (!parentSpaceId || !spaceForm.name.trim())
    return
  await run(async () => {
    const space = await $arkApi.mutate("spaces.create", {
      description: spaceForm.description || undefined,
      inheritAccess: spaceForm.inheritAccess,
      kind: spaceForm.kind as any,
      name: spaceForm.name.trim(),
      parentSpaceId,
      slug: spaceForm.slug || slugify(spaceForm.name),
      visibility: spaceForm.visibility as any,
    })
    if (!space)
      throw new Error(t('settings.spaces.createFailed'))
    for (const arkUserId of spaceForm.initialMemberIds) {
      await $arkApi.mutate("members.upsert", {
        arkUserId,
        roleId: spaceForm.initialRoleId || null,
        scopeId: space.id,
        scopeType: 'space',
        status: 'active' as any,
      })
    }
    spaceForm.name = ''
    spaceForm.slug = ''
    spaceForm.description = ''
    spaceForm.initialMemberIds = []
    selectedSpaceId.value = space.id
    await refresh()
    createSpaceOpen.value = false
  }, { successMessage: t('settings.spaces.created'), errorFallback: t('settings.spaces.createFailed') })
}

function openCreateSpace() {
  createSpaceOpen.value = true
}

function closeCreateSpace() {
  createSpaceOpen.value = false
}
</script>

<template>
  <section class="grid gap-4">
    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
    <UAlert v-if="successMessage" color="success" variant="subtle" :title="successMessage" />

    <div class="flex items-center justify-end">
      <UButton type="button" icon="i-lucide-panels-top-left" @click="openCreateSpace">
        {{ $t('settings.spaces.createSpace') }}
      </UButton>
    </div>

    <div class="grid self-start gap-2">
      <button
        v-for="space in spaces"
        :key="space.id"
        type="button"
        class="rounded-lg border p-4 text-left transition"
        :class="selectedSpaceId === space.id ? 'border-primary/50 bg-primary/10' : 'border-default bg-muted hover:border-white/20'"
        @click="selectedSpaceId = space.id"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate font-semibold text-highlighted">
              {{ space.name }}
            </div>
            <div class="mt-1 font-mono text-xs text-muted">
              {{ space.slug }} · {{ space.kind }} · {{ space.visibility }}
            </div>
            <p v-if="space.description" class="mt-2 line-clamp-2 text-sm leading-5 text-toned">
              {{ space.description }}
            </p>
          </div>
          <UBadge color="neutral" variant="subtle">
            {{ space.inheritAccess ? $t('settings.spaces.inherits') : $t('settings.spaces.isolated') }}
          </UBadge>
        </div>
      </button>
    </div>

    <USlideover
      v-if="createSpaceOpen"
      v-model:open="createSpaceOpen"
      side="right"
      :title="$t('settings.spaces.createSpace')"
      :content="{ onEscapeKeyDown: closeCreateSpace, onInteractOutside: closeCreateSpace }"
    >
      <template #body>
        <form id="ark-create-space-form" class="grid gap-3" @submit.prevent="createSpace">
          <div class="grid gap-3">
            <ArkSettingField :label="$t('settings.spaces.parentSpace')">
              <USelect v-model="spaceForm.parentSpaceId" :items="spaceOptions" class="w-full" />
            </ArkSettingField>
            <ArkSettingField :label="$t('settings.spaces.name')">
              <UInput v-model="spaceForm.name" class="w-full" />
            </ArkSettingField>
            <ArkSettingField :label="$t('settings.spaces.slug')">
              <UInput v-model="spaceForm.slug" class="w-full" />
            </ArkSettingField>
            <ArkSettingField :label="$t('settings.spaces.description')">
              <UTextarea v-model="spaceForm.description" :rows="3" class="w-full" />
            </ArkSettingField>
            <div class="grid gap-3 sm:grid-cols-2">
              <ArkSettingField :label="$t('settings.spaces.kind')">
                <USelect v-model="spaceForm.kind" :items="spaceKindItems" class="w-full" />
              </ArkSettingField>
              <ArkSettingField :label="$t('settings.spaces.visibility')">
                <USelect v-model="spaceForm.visibility" :items="visibilityItems" class="w-full" />
              </ArkSettingField>
            </div>
            <label class="flex items-center gap-2 text-sm text-toned">
              <input v-model="spaceForm.inheritAccess" type="checkbox" class="size-4 accent-primary">
              {{ $t('settings.spaces.inheritAccess') }}
            </label>
            <ArkSettingField :label="$t('settings.spaces.initialMembers')">
              <div class="grid max-h-40 w-full gap-1 overflow-y-auto rounded border border-default bg-elevated p-2">
                <label v-for="user in users" :key="user.id" class="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-white/[0.06]">
                  <input v-model="spaceForm.initialMemberIds" type="checkbox" :value="user.id" class="size-4 accent-primary">
                  <span class="truncate">{{ user.displayName || user.handle || user.id }}</span>
                </label>
              </div>
            </ArkSettingField>
            <ArkSettingField :label="$t('settings.spaces.initialRole')">
              <USelect v-model="spaceForm.initialRoleId" :items="roleOptions" :placeholder="$t('settings.spaces.noRole')" class="w-full" />
            </ArkSettingField>
          </div>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="saving" @click="closeCreateSpace">
            {{ $t('common.cancel') }}
          </UButton>
          <UButton type="submit" form="ark-create-space-form" icon="i-lucide-panels-top-left" :loading="saving">
            {{ $t('settings.spaces.createSpace') }}
          </UButton>
        </div>
      </template>
    </USlideover>
  </section>
</template>

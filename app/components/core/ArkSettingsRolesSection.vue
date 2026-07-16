<script setup lang="ts">
import ArkSettingField from './ArkSettingField.vue'

const props = defineProps<{
  reloadSignal?: number
}>()
const selectedSpaceId = defineModel<string>('selectedSpaceId', { default: '' })

const { $arkApi } = useNuxtApp()
const { t } = useI18n()
const { pending: saving, error: errorMessage, success: successMessage, run } = useAsyncAction()
const createRoleOpen = ref(false)

const roleScopeItems = [
  { label: 'global', value: 'global' },
  { label: 'space', value: 'space' },
]

const roleForm = reactive({
  description: '',
  key: '',
  name: '',
  rank: 10,
  scopeId: '',
  scopeType: 'global',
})

const { data, refresh } = await useAsyncData('ark-roles-section', async () => {
  const [allRoles, allSpaces] = await Promise.all([
    $arkApi.query("roles.list", {}).catch(() => []),
    $arkApi.query("spaces.list", {}).catch(() => []),
  ])
  return { roles: allRoles as any[], spaces: allSpaces as any[] }
}, { default: () => ({ roles: [], spaces: [] }) })

const roles = computed(() => data.value?.roles ?? [])
const spaces = computed(() => data.value?.spaces ?? [])
const rootSpace = computed(() => spaces.value.find(space => !space.parentSpaceId) ?? spaces.value[0] ?? null)
const spaceOptions = computed(() => spaces.value.map(space => ({ label: space.name, value: space.id })))

watchEffect(() => {
  roleForm.scopeId ||= selectedSpaceId.value || rootSpace.value?.id || ''
})

watch(() => props.reloadSignal, () => {
  void refresh()
})

watch(() => roleForm.name, (name) => {
  if (!roleForm.key)
    roleForm.key = slugify(name)
})

async function createRole() {
  if (!roleForm.name.trim())
    return
  await run(async () => {
    await $arkApi.mutate("roles.create", {
      description: roleForm.description || null,
      key: roleForm.key || slugify(roleForm.name),
      name: roleForm.name.trim(),
      rank: Number(roleForm.rank) || 0,
      scopeId: roleForm.scopeType === 'space' ? roleForm.scopeId || selectedSpaceId.value || null : null,
      scopeType: roleForm.scopeType as any,
    })
    roleForm.description = ''
    roleForm.key = ''
    roleForm.name = ''
    roleForm.rank = 10
    await refresh()
    createRoleOpen.value = false
  }, { successMessage: t('settings.roles.created'), errorFallback: t('settings.roles.createFailed') })
}

function openCreateRole() {
  createRoleOpen.value = true
}

function closeCreateRole() {
  createRoleOpen.value = false
}
</script>

<template>
  <section class="grid gap-4">
    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
    <UAlert v-if="successMessage" color="success" variant="subtle" :title="successMessage" />

    <div class="flex items-center justify-end">
      <UButton type="button" icon="i-lucide-shield-plus" @click="openCreateRole">
        {{ $t('settings.roles.createRole') }}
      </UButton>
    </div>

    <div class="grid gap-2">
      <div v-for="role in roles" :key="role.id" class="rounded-lg border border-default bg-muted p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate font-semibold text-highlighted">
              {{ role.name }}
            </div>
            <div class="mt-1 font-mono text-xs text-muted">
              {{ role.scopeType }} / {{ role.key }}
            </div>
            <p v-if="role.description" class="mt-2 text-sm leading-5 text-toned">
              {{ role.description }}
            </p>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1">
            <UBadge color="neutral" variant="subtle">
              {{ $t('settings.roles.rankBadge', { rank: role.rank }) }}
            </UBadge>
            <UBadge v-if="role.isSystem" color="neutral" variant="subtle">
              {{ $t('settings.roles.system') }}
            </UBadge>
          </div>
        </div>
      </div>
    </div>

    <USlideover
      v-if="createRoleOpen"
      v-model:open="createRoleOpen"
      side="right"
      :title="$t('settings.roles.createRole')"
      :content="{ onEscapeKeyDown: closeCreateRole, onInteractOutside: closeCreateRole }"
    >
      <template #body>
        <form id="ark-create-role-form" class="grid gap-3" @submit.prevent="createRole">
          <div class="grid gap-3">
            <ArkSettingField :label="$t('settings.roles.name')">
              <UInput v-model="roleForm.name" class="w-full" />
            </ArkSettingField>
            <ArkSettingField :label="$t('settings.roles.key')">
              <UInput v-model="roleForm.key" class="w-full" />
            </ArkSettingField>
            <ArkSettingField :label="$t('settings.roles.description')">
              <UTextarea v-model="roleForm.description" :rows="3" class="w-full" />
            </ArkSettingField>
            <div class="grid gap-3 sm:grid-cols-2">
              <ArkSettingField :label="$t('settings.roles.scope')">
                <USelect v-model="roleForm.scopeType" :items="roleScopeItems" class="w-full" />
              </ArkSettingField>
              <ArkSettingField :label="$t('settings.roles.rank')">
                <UInput v-model.number="roleForm.rank" type="number" :min="0" class="w-full" />
              </ArkSettingField>
            </div>
            <ArkSettingField v-if="roleForm.scopeType === 'space'" :label="$t('settings.roles.space')">
              <USelect v-model="roleForm.scopeId" :items="spaceOptions" class="w-full" />
            </ArkSettingField>
          </div>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="saving" @click="closeCreateRole">
            {{ $t('common.cancel') }}
          </UButton>
          <UButton type="submit" form="ark-create-role-form" icon="i-lucide-shield-plus" :loading="saving">
            {{ $t('settings.roles.createRole') }}
          </UButton>
        </div>
      </template>
    </USlideover>
  </section>
</template>

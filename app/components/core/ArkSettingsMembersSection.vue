<script setup lang="ts">
import ArkSettingField from './ArkSettingField.vue'
import ArkSettingsSection from './ArkSettingsSection.vue'

const props = defineProps<{
  reloadSignal?: number
}>()
const selectedSpaceId = defineModel<string>('selectedSpaceId', { default: '' })

const { $arkApi } = useNuxtApp()
const { t } = useI18n()
const { pending: saving, error: errorMessage, success: successMessage, run } = useAsyncAction()
const addMemberOpen = ref(false)

const memberStatusItems = [
  { label: 'active', value: 'active' },
  { label: 'pending', value: 'pending' },
  { label: 'suspended', value: 'suspended' },
  { label: 'blocked', value: 'blocked' },
]

const memberForm = reactive({
  arkUserId: '',
  roleId: '',
  status: 'active',
})

const { data: refData, refresh: refreshRef } = await useAsyncData('ark-members-ref', async () => {
  const [allSpaces, allRoles, allUsers] = await Promise.all([
    $arkApi.query("spaces.list", {}).catch(() => []),
    $arkApi.query("roles.list", {}).catch(() => []),
    $arkApi.query("users.list", {}).catch(() => []),
  ])
  return { spaces: allSpaces as any[], roles: allRoles as any[], users: allUsers as any[] }
}, { default: () => ({ spaces: [], roles: [], users: [] }) })

const spaces = computed(() => refData.value?.spaces ?? [])
const roles = computed(() => refData.value?.roles ?? [])
const users = computed(() => refData.value?.users ?? [])

const rootSpace = computed(() => spaces.value.find(space => !space.parentSpaceId) ?? spaces.value[0] ?? null)
const selectedSpace = computed(() => spaces.value.find(space => space.id === selectedSpaceId.value) ?? rootSpace.value)

const roleOptions = computed(() => roles.value.map(role => ({ label: role.name, value: role.id })))
const spaceOptions = computed(() => spaces.value.map(space => ({ label: space.name, value: space.id })))
const userSelectItems = computed(() => users.value.map(user => ({ label: userOptionLabel(user), value: user.id })))

const { data: members, refresh: refreshMembers } = await useAsyncData('ark-members-list', async () => {
  const spaceId = selectedSpace.value?.id
  if (!spaceId)
    return []
  return await $arkApi.query("members.list", { spaceId }).catch(() => []) as any[]
}, { default: () => [], watch: [selectedSpace] })

watch(() => props.reloadSignal, () => {
  void refreshRef()
  void refreshMembers()
})

function shortId(value: string | null | undefined) {
  if (!value)
    return ''
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value
}

function userLabel(userId: string) {
  const user = users.value.find(item => item.id === userId)
  return user?.displayName || user?.handle || shortId(userId)
}

function userOptionLabel(user: any) {
  return user?.displayName || user?.handle || shortId(user?.id)
}

async function addMember() {
  const space = selectedSpace.value
  if (!space || !memberForm.arkUserId)
    return
  await run(async () => {
    await $arkApi.mutate("members.upsert", {
      arkUserId: memberForm.arkUserId,
      roleId: memberForm.roleId || null,
      scopeId: space.id,
      scopeType: 'space',
      status: memberForm.status as any,
    })
    memberForm.arkUserId = ''
    await refreshMembers()
    addMemberOpen.value = false
  }, { successMessage: t('settings.members.saved'), errorFallback: t('settings.members.saveFailed') })
}

async function saveMember(member: any) {
  const space = selectedSpace.value
  if (!space || !member?.arkUserId)
    return
  await run(async () => {
    await $arkApi.mutate("members.upsert", {
      arkUserId: member.arkUserId,
      roleId: member.roleId || null,
      scopeId: space.id,
      scopeType: 'space',
      status: member.status as any,
    })
    await refreshMembers()
  }, { successMessage: t('settings.members.updated'), errorFallback: t('settings.members.updateFailed') })
}

function openAddMember() {
  addMemberOpen.value = true
}

function closeAddMember() {
  addMemberOpen.value = false
}
</script>

<template>
  <section class="grid gap-4">
    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
    <UAlert v-if="successMessage" color="success" variant="subtle" :title="successMessage" />

    <ArkSettingsSection>
      <ArkSettingField :label="$t('settings.members.space')">
        <USelect v-model="selectedSpaceId" :items="spaceOptions" class="w-full" />
      </ArkSettingField>
    </ArkSettingsSection>

    <div class="flex items-center justify-end">
      <UButton type="button" icon="i-lucide-user-plus" @click="openAddMember">
        {{ $t('settings.members.addMember') }}
      </UButton>
    </div>

    <div class="grid min-w-0 self-start gap-2 rounded-lg border border-default bg-muted p-3">
      <div
        v-for="member in members"
        :key="member.id"
        class="grid min-w-0 items-start gap-3 rounded bg-default px-3 py-3"
      >
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold text-highlighted">
            {{ userLabel(member.arkUserId) }}
          </div>
          <div class="mt-1 truncate font-mono text-[11px] text-muted" :title="member.arkUserId">
            {{ shortId(member.arkUserId) }}
          </div>
        </div>
        <div class="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_130px_auto] sm:items-end">
          <ArkSettingField :label="$t('settings.members.role')">
            <USelect v-model="member.roleId" :items="roleOptions" :placeholder="$t('settings.members.noRole')" class="w-full" />
          </ArkSettingField>
          <ArkSettingField :label="$t('settings.members.status')">
            <USelect v-model="member.status" :items="memberStatusItems" class="w-full" />
          </ArkSettingField>
          <UButton type="button" size="sm" icon="i-lucide-save" class="justify-self-start sm:justify-self-end" :loading="saving" @click="saveMember(member)">
            {{ $t('common.save') }}
          </UButton>
        </div>
      </div>
      <div v-if="!members.length" class="rounded border border-dashed border-default p-6 text-sm text-muted">
        {{ $t('settings.members.empty') }}
      </div>
    </div>

    <USlideover
      v-if="addMemberOpen"
      v-model:open="addMemberOpen"
      side="right"
      :title="$t('settings.members.addMember')"
      :content="{ onEscapeKeyDown: closeAddMember, onInteractOutside: closeAddMember }"
    >
      <template #body>
        <form id="ark-add-member-form" class="grid gap-3" @submit.prevent="addMember">
          <div class="grid gap-3">
            <ArkSettingField :label="$t('settings.members.user')">
              <USelect v-model="memberForm.arkUserId" :items="userSelectItems" :placeholder="$t('settings.members.selectUser')" class="w-full" />
            </ArkSettingField>
            <ArkSettingField :label="$t('settings.members.role')">
              <USelect v-model="memberForm.roleId" :items="roleOptions" :placeholder="$t('settings.members.noRole')" class="w-full" />
            </ArkSettingField>
            <ArkSettingField :label="$t('settings.members.status')">
              <USelect v-model="memberForm.status" :items="memberStatusItems" class="w-full" />
            </ArkSettingField>
          </div>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="saving" @click="closeAddMember">
            {{ $t('common.cancel') }}
          </UButton>
          <UButton type="submit" form="ark-add-member-form" icon="i-lucide-user-plus" :loading="saving">
            {{ $t('settings.members.addMember') }}
          </UButton>
        </div>
      </template>
    </USlideover>
  </section>
</template>

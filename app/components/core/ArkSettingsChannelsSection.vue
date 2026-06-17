<script setup lang="ts">
import ArkSettingField from './ArkSettingField.vue'

const props = defineProps<{
  reloadSignal?: number
}>()
const selectedSpaceId = defineModel<string>('selectedSpaceId', { default: '' })

const { $trpc } = useNuxtApp()
const { t } = useI18n()
const { pending: saving, error: errorMessage, success: successMessage, run } = useAsyncAction()
const createChannelOpen = ref(false)

const visibilityItems = [
  { label: 'private', value: 'private' },
  { label: 'space', value: 'space' },
  { label: 'registered', value: 'registered' },
  { label: 'public', value: 'public' },
]
const channelKindItems = [
  { label: 'chat', value: 'chat' },
  { label: 'forum', value: 'forum' },
  { label: 'announcement', value: 'announcement' },
  { label: 'job discussion', value: 'job_discussion' },
  { label: 'feed', value: 'feed' },
]

const channelForm = reactive({
  kind: 'chat',
  memberArkUserIds: [] as string[],
  name: '',
  slug: '',
  visibility: 'space',
})

const { data: refData, refresh: refreshRef } = await useAsyncData('ark-channels-ref', async () => {
  const [allSpaces, allUsers] = await Promise.all([
    $trpc.ark.spaces.list.query({}).catch(() => []),
    $trpc.ark.users.list.query({}).catch(() => []),
  ])
  return { spaces: allSpaces as any[], users: allUsers as any[] }
}, { default: () => ({ spaces: [], users: [] }) })

const spaces = computed(() => refData.value?.spaces ?? [])
const users = computed(() => refData.value?.users ?? [])

const rootSpace = computed(() => spaces.value.find(space => !space.parentSpaceId) ?? spaces.value[0] ?? null)
const selectedSpace = computed(() => spaces.value.find(space => space.id === selectedSpaceId.value) ?? rootSpace.value)
const spaceOptions = computed(() => spaces.value.map(space => ({ label: space.name, value: space.id })))

const { data: channels, refresh: refreshChannels } = await useAsyncData('ark-channels-list', async () => {
  const spaceId = selectedSpace.value?.id
  if (!spaceId)
    return []
  return await $trpc.ark.channels.list.query({ spaceId }).catch(() => []) as any[]
}, { default: () => [], watch: [selectedSpace] })

watch(() => props.reloadSignal, () => {
  void refreshRef()
  void refreshChannels()
})

watch(() => channelForm.name, (name) => {
  if (!channelForm.slug)
    channelForm.slug = slugify(name)
})

async function createChannel() {
  const space = selectedSpace.value
  if (!space || !channelForm.name.trim())
    return
  await run(async () => {
    await $trpc.ark.channels.create.mutate({
      kind: channelForm.kind as any,
      memberArkUserIds: channelForm.memberArkUserIds,
      name: channelForm.name.trim(),
      slug: channelForm.slug || slugify(channelForm.name),
      spaceId: space.id,
      visibility: channelForm.visibility as any,
    })
    channelForm.name = ''
    channelForm.slug = ''
    channelForm.memberArkUserIds = []
    await refreshChannels()
    createChannelOpen.value = false
  }, { successMessage: t('settings.channels.created'), errorFallback: t('settings.channels.createFailed') })
}

function openCreateChannel() {
  createChannelOpen.value = true
}

function closeCreateChannel() {
  createChannelOpen.value = false
}
</script>

<template>
  <section class="grid gap-4">
    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
    <UAlert v-if="successMessage" color="success" variant="subtle" :title="successMessage" />

    <div class="flex items-center justify-end">
      <UButton type="button" icon="i-lucide-hash" @click="openCreateChannel">
        {{ $t('settings.channels.createChannel') }}
      </UButton>
    </div>

    <div class="grid gap-2">
      <div v-for="channel in channels" :key="channel.id" class="rounded-lg border border-default bg-muted p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate font-semibold text-highlighted">
              # {{ channel.name }}
            </div>
            <div class="mt-1 font-mono text-xs text-muted">
              {{ channel.kind }} · {{ channel.visibility }} · {{ $t('settings.channels.messagesCount', { count: channel.messagesCount }) }}
            </div>
          </div>
          <UBadge color="neutral" variant="subtle">
            {{ channel.status }}
          </UBadge>
        </div>
        <div class="mt-3 flex justify-end">
          <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-arrow-up-right" :to="`/app/channels/${channel.id}`">
            {{ $t('settings.channels.open') }}
          </UButton>
        </div>
      </div>
      <div v-if="!channels.length" class="rounded-lg border border-dashed border-default bg-muted p-6 text-sm text-muted">
        {{ $t('settings.channels.empty') }}
      </div>
    </div>

    <USlideover
      v-if="createChannelOpen"
      v-model:open="createChannelOpen"
      side="right"
      :title="$t('settings.channels.createChannel')"
      :content="{ onEscapeKeyDown: closeCreateChannel, onInteractOutside: closeCreateChannel }"
    >
      <template #body>
        <form id="ark-create-channel-form" class="grid gap-3" @submit.prevent="createChannel">
          <div class="grid gap-3">
            <ArkSettingField :label="$t('settings.channels.space')">
              <USelect v-model="selectedSpaceId" :items="spaceOptions" class="w-full" />
            </ArkSettingField>
            <ArkSettingField :label="$t('settings.channels.name')">
              <UInput v-model="channelForm.name" class="w-full" />
            </ArkSettingField>
            <ArkSettingField :label="$t('settings.channels.slug')">
              <UInput v-model="channelForm.slug" class="w-full" />
            </ArkSettingField>
            <div class="grid gap-3 sm:grid-cols-2">
              <ArkSettingField :label="$t('settings.channels.kind')">
                <USelect v-model="channelForm.kind" :items="channelKindItems" class="w-full" />
              </ArkSettingField>
              <ArkSettingField :label="$t('settings.channels.visibility')">
                <USelect v-model="channelForm.visibility" :items="visibilityItems" class="w-full" />
              </ArkSettingField>
            </div>
            <ArkSettingField v-if="channelForm.visibility === 'private'" :label="$t('settings.channels.privateMembers')">
              <div class="grid max-h-40 w-full gap-1 overflow-y-auto rounded border border-default bg-elevated p-2">
                <label v-for="user in users" :key="user.id" class="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-white/[0.06]">
                  <input v-model="channelForm.memberArkUserIds" type="checkbox" :value="user.id" class="size-4 accent-primary">
                  <span class="truncate">{{ user.displayName || user.handle || user.id }}</span>
                </label>
              </div>
            </ArkSettingField>
          </div>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="saving" @click="closeCreateChannel">
            {{ $t('common.cancel') }}
          </UButton>
          <UButton type="submit" form="ark-create-channel-form" icon="i-lucide-hash" :loading="saving">
            {{ $t('settings.channels.createChannel') }}
          </UButton>
        </div>
      </template>
    </USlideover>
  </section>
</template>

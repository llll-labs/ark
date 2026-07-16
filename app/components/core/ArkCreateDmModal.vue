<script setup lang="ts">
interface DmUser {
  displayName: string
  handle?: null | string
  id: string
}

interface CreatedChannel {
  id: string
  spaceId: string
}

defineProps<{
  users: DmUser[]
}>()

const emit = defineEmits<{
  created: [channel: CreatedChannel]
}>()

const open = defineModel<boolean>('open', { default: false })

const { $arkApi } = useNuxtApp()
const { t } = useI18n()
const { error: errorMessage, pending, run } = useAsyncAction()

const memberArkUserIds = ref<string[]>([])

function reset() {
  memberArkUserIds.value = []
  errorMessage.value = ''
}

function close() {
  open.value = false
  reset()
}

useArkEscapeDismiss(open, close)

async function submit() {
  if (!memberArkUserIds.value.length)
    return
  const channel = await run(() => $arkApi.mutate("channels.upsertDm", { memberArkUserIds: memberArkUserIds.value }), { errorFallback: t('modals.dmCreateFailed') })
  if (!channel)
    return
  emit('created', channel as CreatedChannel)
  close()
}

const modalUi = {
  content: 'bg-elevated text-default ring ring-default shadow-none',
  header: 'border-b border-default',
  overlay: 'bg-black/60',
  title: 'text-highlighted',
}
</script>

<template>
  <UModal
    v-if="open"
    v-model:open="open"
    :title="$t('shell.startDirectMessage')"
    :content="{ onEscapeKeyDown: close, onInteractOutside: close }"
    :ui="modalUi"
  >
    <template #body>
      <form class="grid gap-3" @keydown.esc.stop.prevent="close" @submit.prevent="submit">
        <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
        <UFormField :label="$t('shell.members')">
          <div class="grid max-h-56 gap-1 overflow-y-auto rounded border border-default bg-muted p-2">
            <label v-for="user in users" :key="user.id" class="flex items-center gap-2 rounded px-2 py-1 text-sm text-default hover:bg-white/[0.06]">
              <input v-model="memberArkUserIds" type="checkbox" :value="user.id" class="size-4 accent-primary">
              <span class="truncate">{{ user.displayName || user.handle || user.id }}</span>
            </label>
          </div>
        </UFormField>
        <div class="flex justify-end gap-2 border-t border-default pt-3">
          <UButton type="button" color="neutral" variant="ghost" @click="close">
            {{ $t('common.cancel') }}
          </UButton>
          <UButton type="submit" icon="i-lucide-at-sign" :loading="pending" :disabled="!memberArkUserIds.length">
            {{ $t('shell.startDm') }}
          </UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>

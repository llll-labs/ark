<script setup lang="ts">
const props = defineProps<{
  spaceId: string | null
}>()

const emit = defineEmits<{
  created: []
}>()

const open = defineModel<boolean>('open', { default: false })

const { $arkApi } = useNuxtApp()
const { t } = useI18n()
const { error: errorMessage, pending, run } = useAsyncAction()

const form = reactive({
  kind: 'chat',
  name: '',
  slug: '',
  visibility: 'space',
})

watch(() => form.name, (name) => {
  if (!form.slug)
    form.slug = slugify(name)
})

function reset() {
  form.kind = 'chat'
  form.name = ''
  form.slug = ''
  form.visibility = 'space'
  errorMessage.value = ''
}

function close() {
  open.value = false
  reset()
}

useArkEscapeDismiss(open, close)

async function submit() {
  if (!props.spaceId || !form.name.trim())
    return
  const result = await run(() => $arkApi.mutate("channels.create", {
    kind: 'chat',
    memberArkUserIds: [],
    name: form.name.trim(),
    slug: form.slug || slugify(form.name),
    spaceId: props.spaceId!,
    visibility: 'space',
  }), { errorFallback: t('modals.channelCreateFailed') })
  if (result === undefined)
    return
  emit('created')
  close()
}

const modalUi = {
  body: 'p-6',
  content: 'bg-elevated text-default ring ring-default shadow-none',
  header: 'border-b border-default',
  overlay: 'bg-black/60',
  title: 'text-highlighted',
}

const inputUi = {
  base: 'h-11 rounded-lg border border-default bg-default px-10 text-default placeholder:text-muted focus:border-primary focus:ring-0',
  leadingIcon: 'text-muted',
}
</script>

<template>
  <UModal
    v-if="open"
    v-model:open="open"
    :title="$t('shell.createChannel')"
    :content="{ onEscapeKeyDown: close, onInteractOutside: close }"
    :ui="modalUi"
  >
    <template #body>
      <form class="space-y-5" @keydown.esc.stop.prevent="close" @submit.prevent="submit">
        <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
        <UInput
          v-model="form.name"
          autofocus
          class="w-full"
          icon="i-lucide-hash"
          :placeholder="$t('shell.channelName')"
          size="md"
          variant="none"
          :ui="inputUi"
        />
        <div class="flex items-center justify-end gap-2 border-t border-default pt-4">
          <UButton type="button" color="neutral" variant="ghost" @click="close">
            {{ $t('common.cancel') }}
          </UButton>
          <UButton type="submit" color="primary" variant="soft" icon="i-lucide-plus" :loading="pending" :disabled="!form.name.trim()">
            {{ $t('common.create') }}
          </UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>

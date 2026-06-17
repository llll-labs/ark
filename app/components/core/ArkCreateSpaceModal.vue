<script setup lang="ts">
interface CreatedSpace {
  id: string
}

const props = defineProps<{
  parentSpaceId: string | null
}>()

const emit = defineEmits<{
  created: [space: CreatedSpace]
}>()

const open = defineModel<boolean>('open', { default: false })

const { $trpc } = useNuxtApp()
const { t } = useI18n()
const { error: errorMessage, pending, run } = useAsyncAction()

const form = reactive({
  inheritAccess: true,
  kind: 'private',
  name: '',
  slug: '',
  visibility: 'private',
})

watch(() => form.name, (name) => {
  if (!form.slug)
    form.slug = slugify(name)
})

function reset() {
  form.inheritAccess = true
  form.kind = 'private'
  form.name = ''
  form.slug = ''
  form.visibility = 'private'
  errorMessage.value = ''
}

function close() {
  open.value = false
  reset()
}

useArkEscapeDismiss(open, close)

async function submit() {
  if (!props.parentSpaceId || !form.name.trim())
    return
  const space = await run(async () => {
    const created = await $trpc.ark.spaces.create.mutate({
      inheritAccess: form.inheritAccess,
      kind: form.kind as any,
      name: form.name.trim(),
      parentSpaceId: props.parentSpaceId!,
      slug: form.slug || slugify(form.name),
      visibility: form.visibility as any,
    })
    if (!created)
      throw new Error(t('modals.spaceCreateFailed'))
    return created
  }, { errorFallback: t('modals.spaceCreateFailed') })
  if (!space)
    return
  emit('created', space as CreatedSpace)
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
    :title="$t('shell.createSpace')"
    :content="{ onEscapeKeyDown: close, onInteractOutside: close }"
    :ui="modalUi"
  >
    <template #body>
      <form class="grid gap-3" @keydown.esc.stop.prevent="close" @submit.prevent="submit">
        <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
        <UFormField :label="$t('shell.name')">
          <UInput v-model="form.name" />
        </UFormField>
        <UFormField :label="$t('shell.slug')">
          <UInput v-model="form.slug" />
        </UFormField>
        <UFormField :label="$t('shell.kind')">
          <USelect v-model="form.kind" :items="['private', 'organization', 'studio', 'task'].map(value => ({ label: value === 'organization' ? $t('modals.spaceKindOrganization') : value, value }))" />
        </UFormField>
        <UFormField :label="$t('shell.visibility')">
          <USelect v-model="form.visibility" :items="['private', 'space', 'registered', 'public'].map(value => ({ label: value, value }))" />
        </UFormField>
        <UCheckbox v-model="form.inheritAccess" :label="$t('shell.inheritAccess')" />
        <div class="flex justify-end gap-2 border-t border-default pt-3">
          <UButton type="button" color="neutral" variant="ghost" @click="close">
            {{ $t('common.cancel') }}
          </UButton>
          <UButton type="submit" icon="i-lucide-panels-top-left" :loading="pending" :disabled="!form.name.trim()">
            {{ $t('shell.createSpace') }}
          </UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>

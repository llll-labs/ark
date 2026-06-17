<script setup lang="ts">
/**
 * Empty-channel "start discussion" form for a market job. Renders a header,
 * an empty-state block, and a message composer. Emits `submit` when the user
 * sends (Enter or the send button); the message text is bound via `v-model`.
 */
const props = defineProps<{
  /** Job title shown in the header subtitle. */
  jobTitle?: string
  /** Header heading. */
  heading?: string
  /** Empty-state title. */
  emptyTitle?: string
  /** Optional empty-state subtitle. */
  emptySubtitle?: string
  /** Disables the send button + shows a spinner. */
  loading?: boolean
}>()

const emit = defineEmits<{ submit: [] }>()
const message = defineModel<string>({ default: '' })

const { t } = useI18n()

const headingText = computed(() => props.heading ?? t('jobs.detail.channelHeading'))
const emptyTitleText = computed(() => props.emptyTitle ?? t('jobs.composer.noMessages'))

function onSubmit() {
  emit('submit')
}
</script>

<template>
  <form class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" @submit.prevent="onSubmit">
    <header class="flex h-12 shrink-0 items-center gap-2 border-b border-default px-4">
      <UIcon name="i-lucide-message-square" class="size-4 text-muted" />
      <div class="min-w-0 flex-1">
        <h3 class="truncate text-sm font-semibold text-highlighted">
          {{ headingText }}
        </h3>
        <p v-if="props.jobTitle" class="truncate text-xs text-muted">
          {{ props.jobTitle }}
        </p>
      </div>
    </header>
    <div class="flex min-h-0 min-w-0 flex-1 items-center justify-center px-6 text-center">
      <div class="max-w-full">
        <div class="mx-auto grid size-12 place-items-center rounded-full bg-muted text-toned">
          <UIcon name="i-lucide-message-square-plus" class="size-6" />
        </div>
        <h3 class="mt-3 font-semibold text-highlighted">
          {{ emptyTitleText }}
        </h3>
        <p v-if="props.emptySubtitle" class="mt-1 text-sm text-muted">
          {{ props.emptySubtitle }}
        </p>
      </div>
    </div>
    <div class="shrink-0 px-3 pb-4 pt-3">
      <div class="rounded-lg bg-accented px-3 py-2">
        <textarea
          v-model="message"
          rows="2"
          :placeholder="$t('jobs.composer.messagePlaceholder')"
          class="max-h-40 min-h-10 w-full resize-none bg-transparent text-sm leading-6 text-default outline-none placeholder:text-muted"
          @keydown.enter.exact.prevent="onSubmit"
        />
        <div class="flex justify-end">
          <UButton type="submit" size="sm" color="primary" variant="solid" icon="i-lucide-send" class="size-9 justify-center" :loading="props.loading" :aria-label="$t('jobs.composer.sendMessage')" />
        </div>
      </div>
    </div>
  </form>
</template>

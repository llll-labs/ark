<script setup lang="ts">
interface PinnedMessageItem {
  message: {
    attachments?: ArkFileAttachment[]
    body?: string | null
    id: string
  }
  pin: {
    id: string
  }
}

const props = defineProps<{
  items: PinnedMessageItem[]
}>()

const emit = defineEmits<{
  jump: [messageId: string]
}>()

const { t } = useI18n()
const currentIndex = ref(0)

const currentItem = computed(() => props.items[currentIndex.value] ?? null)
const pinCount = computed(() => props.items.length)
const currentLabel = computed(() => currentItem.value ? pinnedMessageLabel(currentItem.value.message) : '')

watch(() => props.items.length, (length) => {
  if (!length) {
    currentIndex.value = 0
    return
  }
  currentIndex.value = Math.min(currentIndex.value, length - 1)
})

function nextPin() {
  if (!pinCount.value)
    return
  currentIndex.value = (currentIndex.value + 1) % pinCount.value
}

function jumpToCurrent() {
  if (!currentItem.value)
    return
  emit('jump', currentItem.value.message.id)
}

function jumpToCurrentAndRotate() {
  jumpToCurrent()
  nextPin()
}

function pinnedMessageLabel(message: PinnedMessageItem['message']) {
  const body = messageBody(message)
  if (body)
    return body
  const images = imageAttachments(message)
  if (images.length)
    return images.length === 1 ? t('channel.image') : t('channel.images', { n: images.length })
  const files = otherAttachments(message)
  if (files.length)
    return files.length === 1 ? t('channel.attachment') : t('channel.attachments', { n: files.length })
  return t('channel.pinnedMessage')
}
</script>

<template>
  <div v-if="currentItem" class="shrink-0 border-b border-black/20 px-4 py-1.5">
    <div class="flex h-8 min-w-0 items-center gap-2 text-xs">
      <UIcon name="i-lucide-pin" class="size-4 shrink-0 text-warning" />
      <button
        type="button"
        class="min-w-0 flex-1 truncate text-left text-default hover:text-highlighted"
        :title="currentLabel"
        @click="jumpToCurrentAndRotate"
      >
        {{ currentLabel }}
      </button>
      <button
        type="button"
        class="shrink-0 tabular-nums text-muted hover:text-highlighted"
        :aria-label="$t('channel.showNextPinned', { current: currentIndex + 1, total: pinCount })"
        @click="nextPin"
      >
        {{ currentIndex + 1 }} / {{ pinCount }}
      </button>
    </div>
  </div>
</template>

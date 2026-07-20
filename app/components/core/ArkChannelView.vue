<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { ArkMessageAnchor } from '../../composables/useArkChannels'
import { useQueryClient } from '@tanstack/vue-query'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useDebounceFn, useEventListener } from '@vueuse/core'
import {
  arkChannelQueryKeys,
  invalidateArkChannelMessages,
  useArkChannelQuery,
  useArkChannelStateQuery,
  useArkMarkReadMutation,
  useArkMessageCreateMutation,
  useArkMessageWindowQuery,
  useArkPinnedMessagesQuery,
  useArkThreadUpsertMutation,
} from '../../composables/useArkChannels'
import { useArkRealtime } from '../../composables/useArkRealtime'
import ArkChannelMessageRow from './ArkChannelMessageRow.vue'
import ArkPinnedMessageBar from './ArkPinnedMessageBar.vue'

interface GalleryItem {
  downloadUrl: string
  id: string
  name: string
  subtitle: string
  url: string
}

type MessageDisplayEntry
  = | {
    dateKey: string
    dateLabel: string
    key: string
    type: 'date'
  }
  | {
    depth: number
    key: string
    message: any
    type: 'message'
  }

const props = withDefaults(defineProps<{
  allowThreadPanel?: boolean
  channelId: string
  embedded?: boolean
  publicRead?: boolean
  readOnly?: boolean
  showEmbeddedClose?: boolean
}>(), {
  allowThreadPanel: true,
  embedded: false,
  publicRead: false,
  readOnly: false,
  showEmbeddedClose: true,
})

const emit = defineEmits<{
  close: []
}>()

// Virtualizer
const ESTIMATED_ROW_HEIGHT = 136

// Scroll thresholds (px)
const LIVE_TAIL_THRESHOLD = 160
const FETCH_PREVIOUS_THRESHOLD = 240
const FETCH_NEXT_THRESHOLD = 320

// Timings (ms)
const BOOKMARK_DEBOUNCE_MS = 750
const HIGHLIGHT_DURATION_MS = 1800

// Thread panel sizing (px)
const THREAD_PANEL_DEFAULT_WIDTH = 440
const THREAD_PANEL_MIN_WIDTH = 340
const THREAD_PANEL_MAX_WIDTH = 720
const THREAD_PANEL_MAX_WIDTH_FLOOR = 380
const THREAD_PANEL_VIEWPORT_RESERVE = 760
const THREAD_PANEL_SSR_FALLBACK_WIDTH = 560
const THREAD_PANEL_WIDTH_STORAGE_KEY = 'ark:thread-panel-width'

const { t } = useI18n()
const { $arkApi } = useNuxtApp()
const queryClient = useQueryClient()
const draft = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFiles = ref<File[]>([])
const selectedFileUrls = shallowRef(new Map<string, string>())
const sending = ref(false)
const { error: errorMessage, run: runAction } = useAsyncAction()
const replyToMessageId = ref<string | null>(null)
const scrollParentRef = ref<HTMLElement | null>(null)
const activeGallery = ref<{ index: number, items: GalleryItem[] } | null>(null)
const activeThreadChannelId = ref<string | null>(null)
const threadPanelWidth = ref(THREAD_PANEL_DEFAULT_WIDTH)
const threadPanelResizing = ref(false)
const anchor = ref<ArkMessageAnchor>({ mode: 'latest' })
const pendingScrollMessageId = ref<string | null>(null)
const highlightedMessageId = ref<string | null>(null)
let highlightTimeout: ReturnType<typeof setTimeout> | null = null
const isAtLiveTail = ref(true)
const unseenCount = ref(0)
const quickReactions = ['👍', '❤️', '😂', '👀']
const emojiOptions = ['👍', '❤️', '😂', '👀', '🔥', '🎉', '🙏', '😮', '😢', '🚀', '✅', '💯']
const reactionPicker = ref<{ messageId: string, placement: 'bottom' | 'toolbar' } | null>(null)

const channelQuery = useArkChannelQuery(() => props.channelId, () => props.publicRead)
const channelStateQuery = useArkChannelStateQuery(() => props.channelId, () => !props.readOnly)
const messagesWindow = useArkMessageWindowQuery(() => props.channelId, () => anchor.value, 50, () => props.publicRead)
const pinnedQuery = useArkPinnedMessagesQuery(() => props.channelId, () => props.publicRead)
const createMessageMutation = useArkMessageCreateMutation()
const upsertThreadMutation = useArkThreadUpsertMutation()
const markReadMutation = useArkMarkReadMutation()

if (import.meta.server) {
  await Promise.all([
    channelQuery.suspense(),
    messagesWindow.suspense(),
    pinnedQuery.suspense(),
  ])
}

let lastBookmarkChannelId: string | null = null
let lastBookmarkedMessageId: string | null = null

useArkRealtime(() => props.channelId, {
  onMessagesChanged(message) {
    if (message.channelId !== props.channelId)
      return false

    if (anchor.value.mode === 'latest' && isAtLiveTail.value) {
      void invalidateArkChannelMessages(queryClient, props.channelId).then(() => nextTick(scrollToBottom))
    }
    else {
      unseenCount.value += 1
    }
    return false
  },
})

const pending = computed(() => channelQuery.isPending.value || messagesWindow.isPending.value)
const channel = computed(() => channelQuery.data.value ?? null)
const messages = computed(() => messagesWindow.messages.value)
const visibleMessages = computed(() =>
  // Hide non-rendering system markers (e.g. an auto-created "discussion started"
  // placeholder). Match on a structured flag in `bodyJson`, never on translated
  // body text — string matching breaks across locales and silent copy changes.
  messages.value.filter((message: any) => !(message.kind === 'system' && message.bodyJson?.render === false)),
)
const displayEntries = computed<MessageDisplayEntry[]>(() => {
  if (channel.value?.kind !== 'forum')
    return withDateSeparators(visibleMessages.value.map(message => ({ depth: 0, key: `message:${message.id}`, message, type: 'message' as const })))

  const childrenByParentId = new Map<string, any[]>()
  const roots: any[] = []
  for (const message of visibleMessages.value) {
    const parentId = typeof message.forumParentId === 'string' ? message.forumParentId : null
    if (parentId) {
      const children = childrenByParentId.get(parentId) ?? []
      children.push(message)
      childrenByParentId.set(parentId, children)
    }
    else {
      roots.push(message)
    }
  }

  const entries: Array<Extract<MessageDisplayEntry, { type: 'message' }>> = []
  const append = (message: any, depth: number) => {
    entries.push({ depth, key: `message:${message.id}`, message, type: 'message' })
    for (const child of childrenByParentId.get(message.id) ?? [])
      append(child, Math.min(depth + 1, 6))
  }
  for (const message of roots)
    append(message, 0)
  return withDateSeparators(entries)
})
const pinnedItems = computed(() => pinnedQuery.data.value?.items ?? [])
const replyTarget = computed(() => messages.value.find(message => message.id === replyToMessageId.value) ?? null)
const activeGalleryItem = computed(() => {
  if (!activeGallery.value)
    return null
  return activeGallery.value.items[activeGallery.value.index] ?? null
})
const selectedImagePreviews = computed(() => selectedFiles.value
  .filter(file => isImageMime(file.type))
  .map(file => ({
    file,
    key: selectedFileKey(file),
    name: file.name,
    url: selectedFileUrls.value.get(selectedFileKey(file)) ?? '',
  }))
  .filter(item => item.url))
const selectedOtherFiles = computed(() => selectedFiles.value.filter(file => !isImageMime(file.type)))
const channelIcon = computed(() => {
  if (channel.value?.kind === 'dm')
    return 'i-lucide-at-sign'
  if (channel.value?.kind === 'announcement')
    return 'i-lucide-megaphone'
  if (channel.value?.kind === 'forum')
    return 'i-lucide-messages-square'
  if (channel.value?.kind === 'thread')
    return 'i-lucide-message-square-text'
  return 'i-lucide-hash'
})
const placeholder = computed(() => channel.value ? t('channel.messageChannel', { name: channel.value.name }) : t('channel.message'))
const isForumChannel = computed(() => channel.value?.kind === 'forum')
const parentChannelTo = computed(() => channel.value?.kind === 'thread' && channel.value.threadParentChannelId ? `/app/channels/${channel.value.threadParentChannelId}` : '')
const showJumpToNow = computed(() => anchor.value.mode !== 'latest' || unseenCount.value > 0 || !isAtLiveTail.value)
const jumpToNowLabel = computed(() => {
  if (!unseenCount.value)
    return t('channel.jumpToNow')
  return t('channel.newMessagesJump', { n: unseenCount.value })
})
const threadPanelStyle = computed(() => ({
  width: `${threadPanelWidth.value}px`,
}))

const rowVirtualizer = useVirtualizer(computed(() => ({
  count: displayEntries.value.length,
  estimateSize: () => ESTIMATED_ROW_HEIGHT,
  getItemKey: (index: number) => displayEntries.value[index]?.key ?? index,
  getScrollElement: () => scrollParentRef.value,
  measureElement: (element: Element) => element.getBoundingClientRect().height,
  overscan: 10,
})))
const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalVirtualHeight = computed(() => rowVirtualizer.value.getTotalSize())

function flushBookmark(channelId: string, messageId: string) {
  if (props.readOnly)
    return
  if (lastBookmarkedMessageId === messageId)
    return
  lastBookmarkedMessageId = messageId
  void markReadMutation.mutateAsync({ channelId, messageId }).catch(() => {
    lastBookmarkedMessageId = null
  })
}
const debouncedBookmark = useDebounceFn(flushBookmark, BOOKMARK_DEBOUNCE_MS)

function bookmarkBottommostVisibleMessage() {
  const element = scrollParentRef.value
  if (!element)
    return
  const rows = virtualRows.value
  if (!rows.length)
    return
  const viewportBottom = element.scrollTop + element.clientHeight
  let candidateId: string | null = null
  for (const row of rows) {
    if (row.start > viewportBottom)
      break
    const entry = displayEntries.value[row.index]
    if (entry?.type === 'message')
      candidateId = entry.message.id
  }
  if (candidateId)
    void debouncedBookmark(props.channelId, candidateId)
}

let cleanupThreadResize: (() => void) | undefined

function measureVirtualRow(node: Element | ComponentPublicInstance | null) {
  if (node instanceof Element)
    rowVirtualizer.value.measureElement(node)
}

function clampThreadPanelWidth(value: number) {
  const maxWidth = import.meta.client
    ? Math.min(THREAD_PANEL_MAX_WIDTH, Math.max(THREAD_PANEL_MAX_WIDTH_FLOOR, window.innerWidth - THREAD_PANEL_VIEWPORT_RESERVE))
    : THREAD_PANEL_SSR_FALLBACK_WIDTH
  return Math.min(maxWidth, Math.max(THREAD_PANEL_MIN_WIDTH, value))
}

onMounted(() => {
  if (!import.meta.client)
    return
  const storedWidth = Number.parseInt(localStorage.getItem(THREAD_PANEL_WIDTH_STORAGE_KEY) ?? '', 10)
  if (Number.isFinite(storedWidth))
    threadPanelWidth.value = clampThreadPanelWidth(storedWidth)
})

function startThreadPanelResize(event: PointerEvent) {
  event.preventDefault()
  cleanupThreadResize?.()

  const startX = event.clientX
  const startWidth = threadPanelWidth.value
  threadPanelResizing.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  const handlePointerMove = (moveEvent: PointerEvent) => {
    threadPanelWidth.value = clampThreadPanelWidth(startWidth - (moveEvent.clientX - startX))
  }

  const stopResize = () => {
    threadPanelResizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    localStorage.setItem(THREAD_PANEL_WIDTH_STORAGE_KEY, String(threadPanelWidth.value))
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', stopResize)
    window.removeEventListener('pointercancel', stopResize)
    cleanupThreadResize = undefined
  }

  cleanupThreadResize = stopResize
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', stopResize)
  window.addEventListener('pointercancel', stopResize)
}

watch(() => props.channelId, () => {
  activeThreadChannelId.value = null
  anchor.value = { mode: 'latest' }
  pendingScrollMessageId.value = null
  replyToMessageId.value = null
  unseenCount.value = 0
  isAtLiveTail.value = true
  lastBookmarkChannelId = null
  lastBookmarkedMessageId = null
})

watch([() => props.channelId, () => channelStateQuery.data.value], ([channelId, state]) => {
  if (!channelId || !state || lastBookmarkChannelId === channelId)
    return
  lastBookmarkChannelId = channelId
  const messageId = state.lastSeenMessageId
  if (!messageId)
    return
  anchor.value = { messageId, mode: 'around' }
  pendingScrollMessageId.value = messageId
  isAtLiveTail.value = false
  lastBookmarkedMessageId = messageId
}, { immediate: true })

watch(selectedFiles, (files) => {
  const previous = selectedFileUrls.value
  const next = new Map<string, string>()
  for (const file of files) {
    if (!isImageMime(file.type))
      continue
    const key = selectedFileKey(file)
    next.set(key, previous.get(key) ?? URL.createObjectURL(file))
  }
  for (const [key, url] of previous) {
    if (!next.has(key))
      URL.revokeObjectURL(url)
  }
  selectedFileUrls.value = next
})

onBeforeUnmount(() => {
  for (const url of selectedFileUrls.value.values())
    URL.revokeObjectURL(url)
  if (highlightTimeout)
    clearTimeout(highlightTimeout)
  cleanupThreadResize?.()
})

if (import.meta.client) {
  useEventListener(window, 'keydown', (event) => {
    if (!activeGallery.value)
      return
    if (event.key === 'Escape') {
      event.preventDefault()
      closeGallery()
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      previousGalleryItem()
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      nextGalleryItem()
    }
  })
}

watch(displayEntries, async () => {
  await nextTick()
  const targetId = pendingScrollMessageId.value
  if (targetId) {
    const index = displayEntries.value.findIndex(entry => entry.type === 'message' && entry.message.id === targetId)
    if (index >= 0) {
      rowVirtualizer.value.scrollToIndex(index, { align: 'center' })
      highlightMessage(targetId)
      pendingScrollMessageId.value = null
    }
    return
  }
  if (anchor.value.mode === 'latest' && isAtLiveTail.value)
    scrollToBottom()
}, { flush: 'post' })

function dateKey(value: string | Date | null | undefined) {
  if (!value)
    return 'unknown'
  return new Date(value).toISOString().slice(0, 10)
}

function formatDateSeparator(value: string | Date | null | undefined) {
  if (!value)
    return t('channel.unknownDate')
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))
}

function withDateSeparators(entries: Array<Extract<MessageDisplayEntry, { type: 'message' }>>): MessageDisplayEntry[] {
  const result: MessageDisplayEntry[] = []
  let previousDateKey = ''
  for (const entry of entries) {
    const currentDateKey = dateKey(entry.message.createdAt)
    if (currentDateKey !== previousDateKey) {
      result.push({
        dateKey: currentDateKey,
        dateLabel: formatDateSeparator(entry.message.createdAt),
        key: `date:${currentDateKey}:${entry.message.id}`,
        type: 'date',
      })
      previousDateKey = currentDateKey
    }
    result.push(entry)
  }
  return result
}

function selectedFileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function toggleReactionPicker(messageId: string, placement: 'bottom' | 'toolbar') {
  if (reactionPicker.value?.messageId === messageId && reactionPicker.value.placement === placement) {
    reactionPicker.value = null
    return
  }
  reactionPicker.value = { messageId, placement }
}

async function selectReaction(message: any, emoji: string) {
  reactionPicker.value = null
  await react(message.id, emoji)
}

function replyPreview(message: any) {
  if (!message)
    return ''
  return messageBody(message) || (imageAttachments(message).length ? t('channel.image') : otherAttachments(message).length ? t('channel.attachment') : t('channel.message'))
}

function displayMessageAt(index: number) {
  const entry = displayEntries.value[index]
  return entry?.type === 'message' ? entry.message : null
}

function displayDepthAt(index: number) {
  const entry = displayEntries.value[index]
  return entry?.type === 'message' ? entry.depth : 0
}

function displayDateLabelAt(index: number) {
  const entry = displayEntries.value[index]
  return entry?.type === 'date' ? entry.dateLabel : ''
}

function attachmentGalleryItems(files: ArkFileAttachment[]) {
  return files.map(file => ({
    downloadUrl: attachmentDownloadUrl(file),
    id: file.id,
    name: attachmentName(file),
    subtitle: [file.width && file.height ? `${file.width}x${file.height}` : null, file.mimeType].filter(Boolean).join(' - '),
    url: attachmentUrl(file, 'preview'),
  }))
}

function selectedGalleryItems() {
  return selectedImagePreviews.value.map(item => ({
    downloadUrl: item.url,
    id: item.key,
    name: item.name,
    subtitle: `${Math.round(item.file.size / 1024)} KB`,
    url: item.url,
  }))
}

function openGallery(items: GalleryItem[], index: number) {
  if (!items.length)
    return
  activeGallery.value = {
    index: Math.min(Math.max(index, 0), items.length - 1),
    items,
  }
}

function openMessageGallery(message: any, file: ArkFileAttachment) {
  const items = attachmentGalleryItems(imageAttachments(message))
  openGallery(items, Math.max(0, items.findIndex(item => item.id === file.id)))
}

function openSelectedGallery(file: File) {
  const items = selectedGalleryItems()
  const key = selectedFileKey(file)
  openGallery(items, Math.max(0, items.findIndex(item => item.id === key)))
}

function closeGallery() {
  activeGallery.value = null
}

function previousGalleryItem() {
  if (!activeGallery.value)
    return
  activeGallery.value.index = (activeGallery.value.index + activeGallery.value.items.length - 1) % activeGallery.value.items.length
}

function nextGalleryItem() {
  if (!activeGallery.value)
    return
  activeGallery.value.index = (activeGallery.value.index + 1) % activeGallery.value.items.length
}

function scrollToBottom() {
  if (!displayEntries.value.length)
    return
  rowVirtualizer.value.scrollToIndex(displayEntries.value.length - 1, { align: 'end' })
}

function updateLiveTailState() {
  const element = scrollParentRef.value
  if (!element)
    return
  isAtLiveTail.value = element.scrollHeight - element.scrollTop - element.clientHeight < LIVE_TAIL_THRESHOLD
}

async function onMessagesScroll() {
  updateLiveTailState()
  const element = scrollParentRef.value
  if (!element)
    return

  bookmarkBottommostVisibleMessage()

  if (element.scrollTop < FETCH_PREVIOUS_THRESHOLD && messagesWindow.hasPreviousPage.value && !messagesWindow.isFetchingPreviousPage.value)
    await messagesWindow.fetchPreviousPage()

  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
  if (distanceFromBottom < FETCH_NEXT_THRESHOLD && messagesWindow.hasNextPage.value && !messagesWindow.isFetchingNextPage.value)
    await messagesWindow.fetchNextPage()
}

function jumpToMessage(messageId: string) {
  anchor.value = { messageId, mode: 'around' }
  pendingScrollMessageId.value = messageId
  isAtLiveTail.value = false
}

function highlightMessage(messageId: string) {
  highlightedMessageId.value = messageId
  if (highlightTimeout)
    clearTimeout(highlightTimeout)
  highlightTimeout = setTimeout(() => {
    highlightedMessageId.value = null
    highlightTimeout = null
  }, HIGHLIGHT_DURATION_MS)
}

function jumpToNow() {
  anchor.value = { mode: 'latest' }
  pendingScrollMessageId.value = null
  unseenCount.value = 0
  isAtLiveTail.value = true
  void nextTick(scrollToBottom)
}

async function uploadSelectedFiles() {
  if (!selectedFiles.value.length || !channel.value)
    return []
  const form = new FormData()
  form.set('spaceId', channel.value.spaceId)
  for (const file of selectedFiles.value)
    form.append('file', file)
  const result = await $fetch<{ files: any[] }>('/api/ark/files', {
    body: form,
    method: 'POST',
  })
  return result.files
}

async function sendMessage() {
  const body = draft.value.trim()
  if (!body && !selectedFiles.value.length)
    return
  sending.value = true
  try {
    await runAction(async () => {
      const files = await uploadSelectedFiles()
      const message = await createMessageMutation.mutateAsync({
        body,
        bodyJson: files.length ? { attachmentFileIds: files.map(file => file.id) } : {},
        channelId: props.channelId,
        forumParentMessageId: isForumChannel.value ? replyToMessageId.value || undefined : undefined,
        replyToMessageId: isForumChannel.value ? undefined : replyToMessageId.value || undefined,
      })
      if (!message)
        throw new Error(t('channel.messageNotCreated'))
      for (const file of files) {
        await $arkApi.mutate("messages.relate", {
          messageId: message.id,
          relationType: 'attachment',
          targetId: file.id,
          targetType: 'file',
        }).catch(() => null)
      }
      if (anchor.value.mode !== 'latest')
        jumpToNow()
      if (files.length)
        await invalidateArkChannelMessages(queryClient, props.channelId)
      draft.value = ''
      selectedFiles.value = []
      replyToMessageId.value = null
      if (fileInput.value)
        fileInput.value.value = ''
    }, { errorFallback: t('channel.messageNotSent') })
  }
  finally {
    sending.value = false
  }
}

async function react(messageId: string, emoji: string) {
  await runAction(async () => {
    await $arkApi.mutate("messages.react", { emoji, messageId })
    void invalidateArkChannelMessages(queryClient, props.channelId)
  }, { errorFallback: t('channel.reactionFailed') })
}

async function pin(messageId: string) {
  await runAction(async () => {
    await $arkApi.mutate("messages.pin", { messageId })
    void queryClient.invalidateQueries({ queryKey: arkChannelQueryKeys.pinnedMessagesPrefix(props.channelId) })
  }, { errorFallback: t('channel.pinFailed') })
}

async function openThread(message: any) {
  if (message.threadChannel?.id) {
    openThreadChannel(message.threadChannel.id)
    return
  }
  await runAction(async () => {
    const channel = await upsertThreadMutation.mutateAsync({ messageId: message.id })
    await invalidateArkChannelMessages(queryClient, props.channelId)
    openThreadChannel(channel.id)
  }, { errorFallback: t('channel.threadFailed') })
}

function openThreadChannel(channelId: string) {
  if (props.allowThreadPanel && import.meta.client && window.matchMedia('(min-width: 1024px)').matches) {
    activeThreadChannelId.value = channelId
    return
  }
  void navigateTo(`/app/channels/${channelId}`)
}

function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFiles.value = Array.from(input.files ?? [])
}

function removeSelectedFile(file: File) {
  const key = selectedFileKey(file)
  selectedFiles.value = selectedFiles.value.filter(item => selectedFileKey(item) !== key)
  if (fileInput.value)
    fileInput.value.value = ''
}
</script>

<template>
  <div class="flex h-full min-h-0 overflow-hidden bg-default">
    <div class="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <header class="flex h-12 shrink-0 items-center gap-2 border-b border-default px-4">
        <UIcon :name="channelIcon" class="size-4 text-muted" />
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-sm font-semibold text-highlighted">
            {{ channel?.name ?? $t('channel.channel') }}
          </h1>
          <p v-if="channel?.topic" class="truncate text-xs text-muted">
            {{ channel.topic }}
          </p>
        </div>
        <UButton v-if="embedded && showEmbeddedClose" type="button" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="$t('channel.closeThread')" @click="emit('close')" />
        <UButton v-else-if="parentChannelTo" type="button" size="xs" color="neutral" variant="soft" icon="i-lucide-arrow-left" :to="parentChannelTo">
          {{ $t('channel.backToChannel') }}
        </UButton>
      </header>

      <ArkPinnedMessageBar v-if="pinnedItems.length" :items="pinnedItems" @jump="jumpToMessage" />

      <section ref="scrollParentRef" class="ark-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4" @scroll.passive="onMessagesScroll">
        <div class="mx-auto max-w-4xl">
          <div v-if="messagesWindow.isFetchingPreviousPage.value" class="py-2 text-center text-xs text-muted">
            {{ $t('channel.loadingOlderMessages') }}
          </div>
          <div v-if="pending" class="py-10 text-center text-sm text-muted">
            {{ $t('channel.loadingMessages') }}
          </div>
          <UAlert v-if="errorMessage" class="mb-3" color="error" variant="subtle" :title="errorMessage" />
          <div v-if="!pending && !displayEntries.length" class="rounded-lg border border-dashed border-white/10 bg-elevated p-8 text-center">
            <div class="mx-auto grid size-12 place-items-center rounded-full bg-muted text-toned">
              <UIcon :name="channelIcon" class="size-6" />
            </div>
            <h2 class="mt-3 font-semibold text-highlighted">
              {{ $t('channel.noMessagesYet') }}
            </h2>
            <p class="mt-1 text-sm text-muted">
              {{ $t('channel.startConversation') }}
            </p>
          </div>

          <div v-if="displayEntries.length" class="relative" :style="{ height: `${totalVirtualHeight}px` }">
            <div
              v-for="virtualRow in virtualRows"
              :key="String(virtualRow.key)"
              :ref="measureVirtualRow"
              v-memo="[
                virtualRow.start,
                displayDateLabelAt(virtualRow.index),
                displayMessageAt(virtualRow.index)?.id,
                displayMessageAt(virtualRow.index)?.editedAt,
                displayMessageAt(virtualRow.index)?.reactions,
                displayMessageAt(virtualRow.index)?.threadChannel?.messagesCount,
                displayDepthAt(virtualRow.index),
                highlightedMessageId === displayMessageAt(virtualRow.index)?.id,
                reactionPicker && reactionPicker.messageId === displayMessageAt(virtualRow.index)?.id ? reactionPicker.placement : null,
                isForumChannel,
                upsertThreadMutation.isPending.value,
              ]"
              :data-index="virtualRow.index"
              class="absolute left-0 top-0 w-full"
              :style="{ transform: `translateY(${virtualRow.start}px)` }"
            >
              <div
                v-if="displayDateLabelAt(virtualRow.index)"
                class="flex items-center gap-3 px-2 py-3 text-xs font-semibold text-muted"
              >
                <div class="h-px flex-1 bg-white/10" />
                <span class="shrink-0 px-2">
                  {{ displayDateLabelAt(virtualRow.index) }}
                </span>
                <div class="h-px flex-1 bg-white/10" />
              </div>
              <ArkChannelMessageRow
                v-if="displayMessageAt(virtualRow.index)"
                :message="displayMessageAt(virtualRow.index)"
                :depth="displayDepthAt(virtualRow.index)"
                :is-forum="isForumChannel"
                :highlighted="highlightedMessageId === displayMessageAt(virtualRow.index).id"
                :picker-placement="reactionPicker && reactionPicker.messageId === displayMessageAt(virtualRow.index).id ? reactionPicker.placement : null"
                :thread-pending="upsertThreadMutation.isPending.value"
                :emoji-options="emojiOptions"
                :quick-reactions="quickReactions"
                :interactive="!props.readOnly"
                @select-reaction="selectReaction(displayMessageAt(virtualRow.index), $event)"
                @toggle-picker="toggleReactionPicker(displayMessageAt(virtualRow.index).id, $event)"
                @reply="replyToMessageId = displayMessageAt(virtualRow.index).id"
                @pin="pin(displayMessageAt(virtualRow.index).id)"
                @open-thread="openThread(displayMessageAt(virtualRow.index))"
                @open-gallery="openMessageGallery(displayMessageAt(virtualRow.index), $event)"
                @jump-to-quote="jumpToMessage($event)"
              />
            </div>
          </div>

          <div v-if="messagesWindow.isFetchingNextPage.value" class="py-2 text-center text-xs text-muted">
            {{ $t('channel.loadingNewerMessages') }}
          </div>
        </div>
      </section>

      <form v-if="!props.readOnly" class="relative z-30 shrink-0 bg-default px-3 pb-4 pt-3" @submit.prevent="sendMessage">
        <div v-if="showJumpToNow" class="pointer-events-none absolute inset-x-0 -top-11 z-50 flex justify-center">
          <UButton type="button" size="sm" color="primary" variant="solid" icon="i-lucide-arrow-down" class="pointer-events-auto font-semibold shadow-lg shadow-black/40" @click="jumpToNow">
            {{ jumpToNowLabel }}
          </UButton>
        </div>
        <div class="mx-auto max-w-4xl">
          <div v-if="replyTarget" class="mb-2 flex items-center gap-2 rounded-t-lg bg-elevated px-3 py-2 text-xs text-toned">
            <UIcon name="i-lucide-reply" class="size-3.5" />
            <span class="min-w-0 flex-1 truncate">{{ isForumChannel ? $t('channel.replyingUnder') : $t('channel.replyingTo') }} {{ replyPreview(replyTarget) }}</span>
            <UButton type="button" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="$t('channel.cancelReply')" @click="replyToMessageId = null" />
          </div>
          <div v-if="selectedFiles.length" class="mb-2 space-y-2">
            <div v-if="selectedImagePreviews.length" class="flex gap-2 overflow-x-auto pb-1">
              <div
                v-for="item in selectedImagePreviews"
                :key="item.key"
                class="group relative h-24 w-32 shrink-0 overflow-hidden rounded-md border border-default bg-muted"
              >
                <button type="button" class="block size-full text-left" :aria-label="$t('channel.previewName', { name: item.name })" @click.stop.prevent="openSelectedGallery(item.file)">
                  <img :src="item.url" :alt="item.name" class="size-full object-cover">
                  <span class="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-xs text-highlighted">
                    <span class="block truncate">{{ item.name }}</span>
                  </span>
                </button>
                <UButton
                  type="button"
                  size="xs"
                  color="neutral"
                  variant="solid"
                  icon="i-lucide-x"
                  class="absolute right-1 top-1 opacity-90"
                  :aria-label="$t('channel.removeName', { name: item.name })"
                  @click.stop="removeSelectedFile(item.file)"
                />
              </div>
            </div>
            <span
              v-for="file in selectedOtherFiles"
              :key="selectedFileKey(file)"
              class="inline-flex max-w-full items-center gap-2 rounded bg-elevated px-2 py-1 text-xs text-default"
            >
              <UIcon name="i-lucide-paperclip" class="size-3.5" />
              <span class="truncate">{{ file.name }}</span>
              <UButton type="button" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="$t('channel.removeName', { name: file.name })" @click="removeSelectedFile(file)" />
            </span>
          </div>
          <div class="flex min-h-12 items-center gap-2 rounded-lg bg-accented px-3 py-2">
            <input ref="fileInput" type="file" multiple class="hidden" @change="onFilesSelected">
            <button
              type="button"
              class="grid size-9 shrink-0 place-items-center rounded-md text-default transition hover:bg-white/10"
              :aria-label="$t('channel.attachFiles')"
              @click="fileInput?.click()"
            >
              <UIcon name="i-lucide-plus" class="size-5" />
            </button>
            <textarea
              v-model="draft"
              class="ark-scrollbar max-h-40 min-h-8 min-w-0 flex-1 resize-none bg-transparent py-1 text-[15px] leading-6 text-default outline-none placeholder:text-muted"
              :placeholder="placeholder"
              rows="1"
              @keydown.enter.exact.prevent="sendMessage"
            />
            <UButton type="submit" size="sm" color="primary" variant="solid" icon="i-lucide-send" class="size-9 justify-center" :loading="sending" :aria-label="$t('channel.sendMessage')" />
          </div>
        </div>
      </form>
    </div>

    <div
      v-if="activeThreadChannelId"
      role="separator"
      aria-orientation="vertical"
      :aria-label="$t('channel.resizeThreadPanel')"
      class="relative hidden cursor-col-resize bg-transparent after:absolute after:inset-y-0 after:-left-1.5 after:-right-1.5 lg:block"
      :class="{ 'bg-primary': threadPanelResizing }"
      :style="{ width: threadPanelResizing ? '4px' : '1px' }"
      @pointerdown="startThreadPanelResize"
    />

    <aside v-if="activeThreadChannelId" class="hidden h-full min-h-0 shrink-0 border-l border-default bg-default lg:flex" :style="threadPanelStyle">
      <ArkChannelView
        :channel-id="activeThreadChannelId"
        :allow-thread-panel="false"
        embedded
        @close="activeThreadChannelId = null"
      />
    </aside>

    <UModal
      v-if="activeGallery"
      :open="true"
      :title="activeGalleryItem?.name ?? $t('channel.preview')"
      :content="{ onEscapeKeyDown: closeGallery, onInteractOutside: closeGallery }"
      :ui="{ overlay: 'bg-black/80', content: 'h-[min(860px,calc(100vh-2rem))] w-[min(1100px,calc(100vw-2rem))] !max-w-none overflow-hidden bg-muted text-default ring ring-black/30 shadow-none', header: 'hidden', body: 'h-full !p-0' }"
      @update:open="value => { if (!value) closeGallery() }"
    >
      <template #body>
        <div v-if="activeGallery && activeGalleryItem" class="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
          <header class="flex h-12 items-center justify-between gap-3 border-b border-default bg-elevated pl-4 pr-2">
            <div class="min-w-0">
              <h2 class="truncate text-sm font-semibold text-highlighted">
                {{ activeGalleryItem.name }}
              </h2>
              <p v-if="activeGalleryItem.subtitle" class="truncate text-xs text-muted">
                {{ activeGalleryItem.subtitle }}
              </p>
            </div>
            <div class="flex items-center gap-1">
              <UButton type="button" size="sm" color="neutral" variant="ghost" icon="i-lucide-download" :to="activeGalleryItem.downloadUrl" target="_blank" :aria-label="$t('channel.openOriginal')" />
              <UButton type="button" size="sm" color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="$t('channel.closePreview')" @click="closeGallery" />
            </div>
          </header>
          <section class="relative grid min-h-0 place-items-center bg-muted p-3">
            <img :src="activeGalleryItem.url" :alt="activeGalleryItem.name" class="max-h-full max-w-full object-contain">
            <UButton
              v-if="activeGallery.items.length > 1"
              type="button"
              color="neutral"
              variant="solid"
              icon="i-lucide-chevron-left"
              class="absolute left-3 top-1/2 -translate-y-1/2"
              :aria-label="$t('channel.previousImage')"
              @click="previousGalleryItem"
            />
            <UButton
              v-if="activeGallery.items.length > 1"
              type="button"
              color="neutral"
              variant="solid"
              icon="i-lucide-chevron-right"
              class="absolute right-3 top-1/2 -translate-y-1/2"
              :aria-label="$t('channel.nextImage')"
              @click="nextGalleryItem"
            />
          </section>
          <footer v-if="activeGallery.items.length > 1" class="flex h-20 gap-2 overflow-x-auto border-t border-default bg-elevated p-2">
            <button
              v-for="(item, index) in activeGallery.items"
              :key="item.id"
              type="button"
              class="h-full w-20 shrink-0 overflow-hidden rounded border bg-muted"
              :class="index === activeGallery.index ? 'border-primary' : 'border-default opacity-70 hover:opacity-100'"
              :aria-label="$t('channel.showName', { name: item.name })"
              @click="activeGallery.index = index"
            >
              <img :src="item.url" :alt="item.name" class="size-full object-cover">
            </button>
          </footer>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.ark-timestamp:hover > .ark-timestamp-tooltip {
  display: block;
}
</style>

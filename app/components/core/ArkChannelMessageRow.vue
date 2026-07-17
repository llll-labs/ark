<script setup lang="ts">
import ArkAvatar from './ArkAvatar.vue'

interface MessageReactionSummary {
  count: number
  emoji: string
  reacted: boolean
}

const props = defineProps<{
  message: any
  depth: number
  isForum: boolean
  highlighted: boolean
  interactive?: boolean
  pickerPlacement: 'bottom' | 'toolbar' | null
  threadPending: boolean
  emojiOptions: string[]
  quickReactions: string[]
}>()

const emit = defineEmits<{
  selectReaction: [emoji: string]
  togglePicker: [placement: 'bottom' | 'toolbar']
  reply: []
  pin: []
  openThread: []
  openGallery: [file: ArkFileAttachment]
  jumpToQuote: [messageId: string]
}>()

const { t } = useI18n()

const messageImages = computed(() => imageAttachments(props.message))
const messageFiles = computed(() => otherAttachments(props.message))
const reactions = computed<MessageReactionSummary[]>(() => Array.isArray(props.message.reactions) ? props.message.reactions : [])

const topReactionOptions = computed(() => {
  const active = [...reactions.value].sort((left, right) => right.count - left.count).map(reaction => reaction.emoji)
  return [...new Set([...active, ...props.quickReactions])].slice(0, 3)
})

const messageText = computed(() => messageBody(props.message))

const authorName = computed<string>(() => {
  const author = props.message?.author
  if (typeof author?.displayName === 'string' && author.displayName)
    return author.displayName
  if (typeof author?.handle === 'string' && author.handle)
    return author.handle
  return props.message?.authorArkUserId ? t('channel.member') : 'Ark'
})

const authorInitials = computed(() => nameInitials(authorName.value, props.message?.authorArkUserId ? 'U' : 'A'))

const authorAvatarUrl = computed(() => {
  const avatarFileId = props.message?.author?.avatarFileId
  return typeof avatarFileId === 'string' ? arkAvatarFileUrl(avatarFileId) : ''
})

const quote = computed(() => {
  const replyTo = props.message?.replyTo
  if (!replyTo)
    return null
  const body = typeof replyTo.body === 'string' ? replyTo.body.trim() : ''
  return { body: body || t('channel.message'), id: replyTo.id as string }
})

const threadPreview = computed(() => {
  const channel = props.message?.threadChannel
  if (!channel)
    return null
  const rawName = typeof channel.name === 'string' ? channel.name.trim() : ''
  const title = rawName.replace(/^Thread:\s*/i, '') || t('channel.thread')
  const count = Number(channel.messagesCount ?? 0)
  const countLabel = count ? t('channel.replies', { n: count }) : t('channel.noRepliesYet')
  return { title, countLabel }
})

function reactionLabel(emoji: string) {
  const reaction = reactions.value.find(item => item.emoji === emoji)
  return reaction?.count ? `${emoji} ${reaction.count}` : emoji
}

function formatTime(value: string | Date | null) {
  if (!value)
    return ''
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value))
}

function formatFullTimestamp(value: string | Date | null) {
  if (!value)
    return ''
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
  }).format(new Date(value))
}
</script>

<template>
  <div
    class="group relative flex items-start gap-3 rounded px-2 py-3 hover:bg-white/[0.03]"
    :class="highlighted ? 'bg-primary/15 ring-1 ring-primary/35' : ''"
    :style="isForum ? { marginLeft: `${depth * 24}px` } : undefined"
  >
    <div v-if="interactive !== false" class="absolute right-2 top-0 z-20 flex -translate-y-1/2 items-center gap-1 rounded-md border border-black/30 bg-elevated p-1 opacity-0 shadow-lg shadow-black/20 transition group-hover:opacity-100">
      <UButton
        v-for="emoji in topReactionOptions"
        :key="emoji"
        type="button"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="emit('selectReaction', emoji)"
      >
        {{ emoji }}
      </UButton>
      <div class="relative">
        <UButton
          type="button"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-smile-plus"
          :aria-label="$t('channel.moreReactions')"
          @click="emit('togglePicker', 'toolbar')"
        />
        <div
          v-if="pickerPlacement === 'toolbar'"
          class="absolute right-0 top-full z-40 mt-1 grid w-40 grid-cols-4 gap-1 rounded-md border border-black/30 bg-elevated p-2 shadow-xl shadow-black/30"
        >
          <button
            v-for="emoji in emojiOptions"
            :key="emoji"
            type="button"
            class="grid size-8 place-items-center rounded text-base hover:bg-white/10"
            @click="emit('selectReaction', emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </div>
      <UButton type="button" size="xs" color="neutral" variant="ghost" icon="i-lucide-reply" @click="emit('reply')">
        {{ $t('channel.reply') }}
      </UButton>
      <UButton
        v-if="!isForum && !message.threadChannel"
        type="button"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-message-square-text"
        :loading="threadPending"
        @click="emit('openThread')"
      >
        {{ $t('channel.thread') }}
      </UButton>
      <UButton type="button" size="xs" color="neutral" variant="ghost" icon="i-lucide-pin" @click="emit('pin')">
        {{ $t('channel.pin') }}
      </UButton>
    </div>
    <ArkAvatar
      class="mt-0.5"
      :src="authorAvatarUrl"
      :name="authorName"
      :initials="authorInitials"
      size="md"
    />
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-baseline gap-2">
        <span class="text-sm font-semibold text-highlighted">{{ authorName }}</span>
        <span class="ark-timestamp relative inline-flex cursor-default text-xs text-muted hover:text-default">
          {{ formatTime(message.createdAt) }}
          <span
            aria-hidden="true"
            class="ark-timestamp-tooltip pointer-events-none absolute bottom-full left-0 z-50 mb-1 hidden whitespace-nowrap rounded-md border border-black/30 bg-muted px-2 py-1 text-xs font-medium text-default shadow-lg shadow-black/30"
          >
            {{ formatFullTimestamp(message.createdAt) }}
          </span>
        </span>
      </div>
      <button
        v-if="quote"
        type="button"
        class="mt-1 flex max-w-xl items-center gap-2 rounded border-l-2 border-primary bg-black/15 px-2 py-1 text-left text-xs text-toned hover:bg-black/25 hover:text-highlighted"
        @click="emit('jumpToQuote', quote.id)"
      >
        <UIcon name="i-lucide-reply" class="size-3.5 shrink-0" />
        <span class="truncate">{{ quote.body }}</span>
      </button>
      <p v-if="messageText" class="mt-1 whitespace-pre-wrap text-[15px] leading-6 text-default">
        {{ messageText }}
      </p>
      <div v-if="messageImages.length" class="mt-2 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3">
        <button
          v-for="file in messageImages"
          :key="file.id"
          type="button"
          class="group relative aspect-[4/3] min-w-0 overflow-hidden rounded-md border border-black/20 bg-muted text-left outline-none transition hover:border-primary focus-visible:ring-2 focus-visible:ring-primary"
          :aria-label="$t('channel.previewName', { name: attachmentName(file) })"
          @click.stop.prevent="emit('openGallery', file)"
        >
          <img
            :src="attachmentUrl(file, 'thumb')"
            :alt="attachmentName(file)"
            class="size-full object-cover transition group-hover:scale-[1.02]"
            loading="lazy"
          >
        </button>
      </div>
      <div v-if="messageFiles.length" class="mt-2 flex flex-wrap gap-2">
        <a
          v-for="file in messageFiles"
          :key="file.id"
          :href="attachmentDownloadUrl(file)"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 rounded border border-black/20 bg-muted px-2 py-1 text-xs text-default hover:text-highlighted"
        >
          <UIcon name="i-lucide-paperclip" class="size-3.5" />
          <span class="truncate">{{ attachmentName(file) }}</span>
        </a>
      </div>
      <div v-if="reactions.length" class="mt-2 flex flex-wrap items-center gap-1">
        <UButton
          v-for="reaction in reactions"
          :key="reaction.emoji"
          type="button"
          size="xs"
          :color="reaction.reacted ? 'primary' : 'neutral'"
          :variant="reaction.reacted ? 'soft' : 'subtle'"
          :disabled="interactive === false"
          @click="emit('selectReaction', reaction.emoji)"
        >
          {{ reactionLabel(reaction.emoji) }}
        </UButton>
        <div v-if="interactive !== false" class="relative">
          <UButton
            type="button"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-smile-plus"
            class="bg-white/10 text-default hover:bg-white/15"
            aria-label="More reactions"
            @click="emit('togglePicker', 'bottom')"
          />
          <div
            v-if="pickerPlacement === 'bottom'"
            class="absolute bottom-full left-0 z-40 mb-1 grid w-40 grid-cols-4 gap-1 rounded-md border border-black/30 bg-elevated p-2 shadow-xl shadow-black/30"
          >
            <button
              v-for="emoji in emojiOptions"
              :key="emoji"
              type="button"
              class="grid size-8 place-items-center rounded text-base hover:bg-white/10"
              @click="emit('selectReaction', emoji)"
            >
              {{ emoji }}
            </button>
          </div>
        </div>
      </div>
      <button
        v-if="threadPreview"
        type="button"
        class="mt-2 flex max-w-xl items-center gap-2 rounded border border-black/20 bg-elevated px-2.5 py-2 text-left text-xs text-toned hover:border-white/10 hover:bg-accented hover:text-highlighted"
        @click="emit('openThread')"
      >
        <ArkAvatar :name="threadPreview.title" size="xs" />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-semibold text-default">{{ threadPreview.title }}</span>
          <span class="block truncate text-muted">{{ threadPreview.countLabel }} ›</span>
        </span>
      </button>
    </div>
  </div>
</template>

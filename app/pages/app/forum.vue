<script setup lang="ts">
definePageMeta({
  layout: 'app',
})

await useArkCapabilityGate('forum.access')

const { $arkApi } = useNuxtApp()
const { t } = useI18n()
const createOpen = ref(false)
const { pending: saving, error: errorMessage, run } = useAsyncAction()
const selectedCategoryId = ref('all')
const topicForm = reactive({
  body: '',
  categoryId: '',
  title: '',
})

interface ForumSpace { id: string, parentSpaceId: null | string }
interface ForumCategory { id: string, name: string }
interface ForumChannel {
  categoryId?: null | string
  id: string
  kind: string
  lastMessagePreview?: null | string
  messagesCount: number
  name: string
  topic?: null | string
  visibility: string
}

useArkEscapeDismiss(createOpen)

const { data, refresh } = await useAsyncData('ark-forum', async () => {
  const spaces = await $arkApi.query("spaces.list", {}) as ForumSpace[]
  const root = spaces.find(space => !space.parentSpaceId) ?? spaces[0]
  const [channels, categories] = root
    ? await Promise.all([
        $arkApi.query("channels.list", { spaceId: root.id }),
        $arkApi.query("channelCategories.list", { spaceId: root.id }),
      ])
    : [[], []]
  return {
    categories: categories as ForumCategory[],
    channels: (channels as ForumChannel[]).filter(channel => channel.kind === 'forum'),
    root,
  }
})

const categories = computed(() => data.value?.categories ?? [])
const categoryById = computed(() => new Map(categories.value.map(category => [category.id, category])))
const filteredChannels = computed(() => {
  const channels = data.value?.channels ?? []
  if (selectedCategoryId.value === 'all')
    return channels
  return channels.filter(channel => channel.categoryId === selectedCategoryId.value)
})
const categorySelectItems = computed(() => categories.value.map(category => ({ label: category.name, value: category.id })))

function defaultCategoryId() {
  if (selectedCategoryId.value !== 'all')
    return selectedCategoryId.value
  return categories.value[0]?.id ?? ''
}

function openCreate() {
  topicForm.categoryId = defaultCategoryId()
  createOpen.value = true
}

async function createTopic() {
  if (!data.value?.root || !topicForm.title.trim())
    return
  const channel = await run(async () => {
    const created = await $arkApi.mutate("channels.create", {
      kind: 'forum',
      memberArkUserIds: [],
      name: topicForm.title.trim(),
      categoryId: topicForm.categoryId || defaultCategoryId() || undefined,
      slug: slugify(topicForm.title),
      spaceId: data.value!.root!.id,
      targetType: 'forum_topic',
      visibility: 'public',
    })
    if (topicForm.body.trim()) {
      await $arkApi.mutate("messages.create", {
        body: topicForm.body.trim(),
        bodyJson: { topicTitle: topicForm.title },
        channelId: created.id,
      })
    }
    return created
  }, { errorFallback: t('forum.createError') })

  if (!channel)
    return

  topicForm.title = ''
  topicForm.body = ''
  topicForm.categoryId = defaultCategoryId()
  createOpen.value = false
  await refresh()
  await navigateTo(`/app/channels/${channel.id}`)
}
</script>

<template>
  <div class="min-h-full bg-default">
    <header class="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-default bg-default/95 px-4 backdrop-blur lg:px-6">
      <div class="min-w-0">
        <h1 class="truncate text-lg font-semibold text-highlighted">
          {{ $t('forum.title') }}
        </h1>
      </div>
      <UButton type="button" icon="i-lucide-plus" @click="openCreate">
        {{ $t('forum.newTopic') }}
      </UButton>
    </header>

    <main class="mx-auto grid max-w-5xl gap-3 p-4 lg:p-6">
      <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />
      <div v-if="categories.length" class="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          class="h-9 shrink-0 rounded border px-3 text-sm transition"
          :class="selectedCategoryId === 'all' ? 'border-white/20 bg-accented text-highlighted' : 'border-default bg-elevated text-toned hover:border-white/10 hover:text-highlighted'"
          @click="selectedCategoryId = 'all'"
        >
          {{ $t('forum.allCategories') }}
        </button>
        <button
          v-for="category in categories"
          :key="category.id"
          type="button"
          class="h-9 shrink-0 rounded border px-3 text-sm transition"
          :class="selectedCategoryId === category.id ? 'border-white/20 bg-accented text-highlighted' : 'border-default bg-elevated text-toned hover:border-white/10 hover:text-highlighted'"
          @click="selectedCategoryId = category.id"
        >
          {{ category.name }}
        </button>
      </div>
      <NuxtLink
        v-for="channel in filteredChannels"
        :key="channel.id"
        :to="`/app/channels/${channel.id}`"
        class="group rounded-lg border border-default bg-elevated p-4 transition hover:border-white/10 hover:bg-accented"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-messages-square" class="size-4 shrink-0 text-muted" />
              <h2 class="truncate font-semibold text-highlighted">
                # {{ channel.name }}
              </h2>
            </div>
            <p class="mt-2 line-clamp-2 text-sm leading-6 text-toned">
              {{ channel.lastMessagePreview || channel.topic || $t('forum.noMessagesYet') }}
            </p>
          </div>
          <div class="shrink-0 text-right">
            <UBadge color="neutral" variant="subtle">
              {{ $t('forum.messagesCount', { count: channel.messagesCount }) }}
            </UBadge>
            <div class="mt-2 text-xs text-muted">
              {{ categoryById.get(channel.categoryId || '')?.name || channel.visibility }}
            </div>
          </div>
        </div>
      </NuxtLink>
      <div v-if="!filteredChannels.length" class="rounded-lg border border-dashed border-white/10 bg-elevated p-8 text-center">
        <div class="mx-auto grid size-12 place-items-center rounded-full bg-muted text-toned">
          <UIcon name="i-lucide-messages-square" class="size-6" />
        </div>
        <h2 class="mt-3 font-semibold text-highlighted">
          {{ $t('forum.emptyTitle') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ $t('forum.emptyBody') }}
        </p>
      </div>
    </main>

    <UModal
      v-if="createOpen"
      v-model:open="createOpen"
      :title="$t('forum.newTopicModalTitle')"
      :content="{ onEscapeKeyDown: () => { createOpen = false }, onInteractOutside: () => { createOpen = false } }"
      :ui="{ overlay: 'bg-black/60', content: 'w-[min(560px,calc(100vw-2rem))] !max-w-none bg-elevated text-default ring ring-default shadow-none', header: 'border-b border-default', title: 'text-highlighted' }"
    >
      <template #body>
        <form class="text-default" @keydown.esc.stop.prevent="createOpen = false" @submit.prevent="createTopic">
          <div class="grid gap-3">
            <UFormField :label="$t('forum.fieldTitle')">
              <UInput v-model="topicForm.title" autofocus />
            </UFormField>
            <UFormField v-if="categories.length" :label="$t('forum.fieldCategory')">
              <USelect
                v-model="topicForm.categoryId"
                :items="categorySelectItems"
              />
            </UFormField>
            <UFormField :label="$t('forum.fieldMessage')">
              <UTextarea v-model="topicForm.body" :rows="7" />
            </UFormField>
            <div class="flex justify-end gap-2">
              <UButton type="button" color="neutral" variant="ghost" @click="createOpen = false">
                {{ $t('common.cancel') }}
              </UButton>
              <UButton type="submit" icon="i-lucide-send" :loading="saving">
                {{ $t('forum.createTopic') }}
              </UButton>
            </div>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>

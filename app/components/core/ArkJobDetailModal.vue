<script setup lang="ts">
import { useJobDiscussion } from '../../composables/useJobDiscussion'
import { formatBudget, formatDate } from '../../utils/arkFormat'
import { compactJson } from '../../utils/arkJson'
import ArkChannelView from './ArkChannelView.vue'
import ArkJobDiscussionComposer from './ArkJobDiscussionComposer.vue'

/**
 * Job detail dialog: left column shows the job, right column embeds the channel
 * (`ArkChannelView`) or, when no discussion exists yet, the
 * `ArkJobDiscussionComposer`. The selected job is bound via `v-model` so the
 * "start discussion" flow can patch it in place.
 */
interface TaxonomyOption { id: string, name: string }

const props = defineProps<{
  canManageJobs: boolean
  categoryOptions: TaxonomyOption[]
  tagOptions: TaxonomyOption[]
  /** Refresh the underlying jobs list; should resolve before re-finding. */
  refresh: () => Promise<void> | void
  /** Re-read the job by id after a refresh (e.g. from the list). */
  findFreshJob?: (id: string) => any | undefined
}>()

const emit = defineEmits<{ close: [] }>()
const job = defineModel<any>({ default: null })

const maximized = ref(false)

const {
  discussionSaving,
  error: discussionError,
  firstDiscussionMessage,
  sendFirstDiscussionMessage,
} = useJobDiscussion({
  job: () => job.value,
  onDiscussionStarted: (result) => {
    job.value = { ...job.value, ...(result.job ?? {}), discussionChannelId: result.channel.id }
  },
  onMessageSent: async () => {
    const id = job.value?.id
    await props.refresh()
    const fresh = id ? props.findFreshJob?.(id) : undefined
    if (fresh)
      job.value = fresh
  },
})

const discussionChannelId = computed(() => job.value?.discussionChannelId ?? '')

function uniqueIds(values: unknown): string[] {
  return Array.from(new Set(Array.isArray(values)
    ? values.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : []))
}
function taxonomyName(id: string, rows: TaxonomyOption[] | undefined) {
  return rows?.find(row => row.id === id)?.name ?? null
}

const secondaryCategoryIds = computed(() =>
  uniqueIds(job.value?.categoryIds).filter(categoryId => categoryId !== job.value?.primaryCategoryId))
const tagIds = computed(() => uniqueIds(job.value?.tagIds))
const hasTaxonomy = computed(() => Boolean(
  job.value?.primaryCategoryId || secondaryCategoryIds.value.length || tagIds.value.length,
))

function formatJson(value: unknown) {
  if (!value || (typeof value === 'object' && Object.keys(value as Record<string, unknown>).length === 0))
    return ''
  return compactJson(value)
}

const modalUi = computed(() => ({
  overlay: 'bg-black/60',
  content: maximized.value
    ? 'divide-y-0 overflow-hidden bg-default text-default ring-0 shadow-none'
    : 'w-[min(1040px,calc(100vw-1.5rem))] !max-w-none divide-y-0 overflow-hidden bg-default text-default ring-1 ring-black/30 shadow-2xl shadow-black/40',
  header: 'border-b border-default bg-default px-5 py-3',
  title: 'truncate text-base font-semibold text-highlighted',
  body: '!p-3 sm:!p-4',
}))

function close() {
  maximized.value = false
  emit('close')
}
</script>

<template>
  <UModal
    :open="true"
    :close="false"
    :fullscreen="maximized"
    :title="job?.title ?? $t('jobs.detail.jobFallback')"
    :ui="modalUi"
    @update:open="value => { if (!value) close() }"
  >
    <template #header>
      <div class="flex w-full items-center gap-2">
        <h2 class="min-w-0 flex-1 truncate text-base font-semibold text-highlighted">
          {{ job?.title ?? $t('jobs.detail.jobFallback') }}
        </h2>
        <UButton
          :to="`/app/jobs/${job.id}`"
          type="button"
          size="sm"
          color="neutral"
          variant="ghost"
          class="shrink-0"
          icon="i-lucide-arrow-up-right"
          :aria-label="$t('jobs.detail.openFullPage')"
        />
        <UButton
          type="button"
          size="sm"
          color="neutral"
          variant="ghost"
          class="shrink-0"
          :icon="maximized ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
          :aria-label="maximized ? $t('jobs.detail.restoreWindow') : $t('jobs.detail.maximizeWindow')"
          @click="maximized = !maximized"
        />
        <UButton
          type="button"
          size="sm"
          color="neutral"
          variant="ghost"
          class="shrink-0"
          icon="i-lucide-x"
          :aria-label="$t('common.close')"
          @click="close"
        />
      </div>
    </template>
    <template #body>
      <UAlert v-if="discussionError" class="mb-3" color="error" variant="subtle" :title="discussionError" />
      <div
        class="grid min-h-0 w-full min-w-0 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]"
        :class="maximized ? 'h-[calc(100dvh-4rem)]' : 'max-h-[calc(100vh-8rem)] lg:h-[min(700px,calc(100vh-9rem))]'"
      >
        <section class="min-h-0 min-w-0 overflow-y-auto rounded-md border border-default bg-elevated p-4">
          <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{{ formatDate(job.updatedAt) }}</span>
            <span class="rounded bg-muted px-2 py-1">{{ $t(`jobs.status.${job.status}`) }}</span>
            <span class="rounded bg-muted px-2 py-1">{{ $t(`jobs.curation.${job.curationStatus}`) }}</span>
            <span class="rounded bg-muted px-2 py-1">{{ formatBudget(job, $t('jobs.card.budgetNotSpecified')) }}</span>
          </div>

          <h2 class="mt-3 break-words text-xl font-semibold leading-7 text-highlighted">
            {{ job.title }}
          </h2>
          <p v-if="job.summary" class="mt-3 break-words text-sm leading-6 text-default">
            {{ job.summary }}
          </p>
          <p v-if="job.description" class="mt-4 whitespace-pre-line break-words text-sm leading-6 text-toned">
            {{ job.description }}
          </p>

          <div v-if="hasTaxonomy" class="mt-4 flex flex-wrap gap-2 text-xs text-muted">
            <span v-if="job.primaryCategoryId && taxonomyName(job.primaryCategoryId, props.categoryOptions)" class="inline-flex items-center gap-1 rounded border border-sky-400/15 bg-sky-400/10 px-2 py-1 text-sky-100">
              <UIcon name="i-lucide-folder" class="size-3" />
              {{ taxonomyName(job.primaryCategoryId, props.categoryOptions) }}
            </span>
            <span v-for="categoryId in secondaryCategoryIds" :key="`${job.id}-details-category-${categoryId}`" class="inline-flex items-center gap-1 rounded border border-sky-400/15 bg-sky-400/10 px-2 py-1 text-sky-100">
              <UIcon name="i-lucide-folder" class="size-3" />
              {{ taxonomyName(categoryId, props.categoryOptions) ?? $t('jobs.card.categoryFallback') }}
            </span>
            <span v-for="tagId in tagIds" :key="`${job.id}-details-tag-${tagId}`" class="rounded border border-emerald-400/15 bg-emerald-400/10 px-2 py-1 text-emerald-100">
              #{{ taxonomyName(tagId, props.tagOptions) ?? $t('jobs.card.tagFallback') }}
            </span>
          </div>

          <div class="mt-5 flex flex-wrap gap-2">
            <UButton v-if="job.sourceUrl" type="button" size="sm" color="neutral" variant="soft" icon="i-lucide-external-link" :to="job.sourceUrl" target="_blank">
              {{ $t('jobs.detail.openOriginal') }}
            </UButton>
          </div>

          <div v-if="props.canManageJobs && (formatJson(job.sourceRawJson) || job.workflowJson?.ai)" class="mt-5 grid gap-3 rounded-md border border-default bg-muted p-3">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase text-muted">
              <UIcon name="i-lucide-bug" class="size-4" />
              {{ $t('jobs.detail.importDiagnostics') }}
            </div>
            <details v-if="job.workflowJson?.ai" class="rounded bg-elevated">
              <summary class="cursor-pointer px-3 py-2 text-xs font-semibold text-default">
                {{ $t('jobs.detail.aiDecision') }}
              </summary>
              <pre class="max-h-80 overflow-auto whitespace-pre-wrap px-3 pb-3 text-xs leading-5 text-toned">{{ formatJson(job.workflowJson.ai) }}</pre>
            </details>
            <details v-if="formatJson(job.sourceRawJson)" class="rounded bg-elevated">
              <summary class="cursor-pointer px-3 py-2 text-xs font-semibold text-default">
                {{ $t('jobs.detail.sourceData') }}
              </summary>
              <pre class="max-h-80 overflow-auto whitespace-pre-wrap px-3 pb-3 text-xs leading-5 text-toned">{{ formatJson(job.sourceRawJson) }}</pre>
            </details>
          </div>
        </section>

        <aside class="flex h-[min(460px,52vh)] min-h-0 min-w-0 max-w-full overflow-hidden rounded-md border border-default bg-default lg:h-auto">
          <ArkChannelView
            v-if="discussionChannelId"
            :channel-id="discussionChannelId"
            class="min-w-0 flex-1"
            embedded
            :allow-thread-panel="false"
            :show-embedded-close="false"
            @close="close"
          />
          <ArkJobDiscussionComposer
            v-else
            v-model="firstDiscussionMessage"
            :job-title="job.title"
            :heading="$t('jobs.detail.channelHeading')"
            :loading="discussionSaving"
            @submit="sendFirstDiscussionMessage"
          />
        </aside>
      </div>
    </template>
  </UModal>
</template>

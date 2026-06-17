<script setup lang="ts">
import { formatBudget, formatDate } from '../../utils/arkFormat'

// A single market job card in the jobs list. Emits `open` on click/keyboard.
// Purely user-facing; curation lives in Settings -> Content, not here.
interface TaxonomyOption { id: string, name: string }

const props = defineProps<{
  job: any
  categoryOptions: TaxonomyOption[]
  tagOptions: TaxonomyOption[]
}>()
const emit = defineEmits<{ open: [job: any] }>()

const { locale } = useI18n()

function uniqueIds(values: unknown): string[] {
  return Array.from(new Set(Array.isArray(values)
    ? values.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : []))
}
function taxonomyName(id: string, rows: TaxonomyOption[] | undefined) {
  return rows?.find(row => row.id === id)?.name ?? null
}

// Primary category first, then the rest; tags shown after categories.
const categoryIds = computed(() => {
  const ids = uniqueIds(props.job?.categoryIds)
  const primary = props.job?.primaryCategoryId
  return primary ? [primary, ...ids.filter(id => id !== primary)] : ids
})
const tagIds = computed(() => uniqueIds(props.job?.tagIds))
const budget = computed(() => formatBudget(props.job, ''))
const date = computed(() => formatDate(props.job?.updatedAt, undefined, locale.value))
</script>

<template>
  <article
    role="button"
    tabindex="0"
    class="group cursor-pointer rounded-lg border border-default bg-elevated p-3 transition hover:border-white/10 hover:bg-accented focus:outline-none focus:ring-2 focus:ring-white/20 sm:p-4"
    @click="emit('open', props.job)"
    @keydown.enter.prevent="emit('open', props.job)"
    @keydown.space.prevent="emit('open', props.job)"
  >
    <div class="flex items-start justify-between gap-3">
      <h2 class="min-w-0 text-base font-semibold leading-6 text-highlighted">
        {{ props.job.title }}
      </h2>
      <span v-if="budget" class="shrink-0 whitespace-nowrap text-sm font-semibold text-primary">
        {{ budget }}
      </span>
    </div>

    <p class="mt-1.5 line-clamp-2 text-sm leading-6 text-toned">
      {{ props.job.summary || props.job.description || props.job.sourceUrl }}
    </p>

    <div class="mt-3 flex items-center justify-between gap-3 text-xs">
      <div class="flex min-w-0 flex-wrap items-center gap-1.5">
        <span
          v-for="categoryId in categoryIds"
          :key="`${props.job.id}-c-${categoryId}`"
          class="inline-flex items-center gap-1 rounded border border-sky-400/15 bg-sky-400/10 px-2 py-0.5 text-sky-100"
        >
          <UIcon name="i-lucide-folder" class="size-3" />
          {{ taxonomyName(categoryId, props.categoryOptions) ?? $t('jobs.card.categoryFallback') }}
        </span>
        <span
          v-for="tagId in tagIds"
          :key="`${props.job.id}-t-${tagId}`"
          class="rounded border border-emerald-400/15 bg-emerald-400/10 px-2 py-0.5 text-emerald-100"
        >
          #{{ taxonomyName(tagId, props.tagOptions) ?? $t('jobs.card.tagFallback') }}
        </span>
      </div>
      <span v-if="date" class="shrink-0 text-muted">{{ date }}</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import ArkJobCard from '../../../components/core/ArkJobCard.vue'
import ArkJobDetailModal from '../../../components/core/ArkJobDetailModal.vue'
// ArkJobFilters is auto-imported so a tenant can override it (Nuxt layers).
import { useArkJobs } from '../../../composables/useArkJobs'

definePageMeta({
  layout: 'app',
})

// User-facing market. Curation lives in Settings -> Content, not here; this page
// is purely Заказы/Вакансии browsing with friendly filters + sorting.
const access = await useArkCapabilityGate('market.access')

const { $arkApi } = useNuxtApp()
const { t } = useI18n()

const canCreate = computed(() => access.value?.capabilities.includes('market.jobs.create') ?? false)

const activeTab = ref<'orders' | 'vacancies'>('orders')
const selectedJob = ref<any>(null)
const topRef = ref<HTMLElement | null>(null)

const tabs = computed(() => [
  { id: 'orders', label: t('jobs.tabs.orders'), mobileLabel: t('jobs.tabs.orders'), icon: 'i-lucide-briefcase-business' },
  { id: 'vacancies', label: t('jobs.tabs.vacancies'), mobileLabel: t('jobs.tabs.vacancies'), icon: 'i-lucide-building-2' },
] as const)
const kindGroup = computed<'order' | 'vacancy'>(() => (activeTab.value === 'vacancies' ? 'vacancy' : 'order'))

const {
  clearFilters,
  filters,
  hasActiveFilters,
  jobs,
  loading: jobsLoading,
  page,
  pageSize,
  refresh: refreshJobs,
  total,
  totalPages,
} = await useArkJobs({
  key: 'ark-market-jobs',
  kindGroup,
})

const { data: meta } = await useAsyncData('ark-market-meta', () =>
  $arkApi.query("market.options", {}).catch(() => ({ categories: [], skills: [], sources: [], styles: [], tags: [], tools: [] })))

const options = computed(() => meta.value ?? { categories: [], skills: [], sources: [], styles: [], tags: [], tools: [] })
const categoryOptions = computed(() => options.value.categories ?? [])
const tagOptions = computed(() => options.value.tags ?? [])
const statusOptions = ['draft', 'open', 'responding', 'ordered', 'completed', 'archived'] as const
const sourceOptions = computed(() =>
  uniqueSorted(((options.value as { sources?: { key?: string, name?: string }[] }).sources ?? []).map(source => source.key ?? source.name)))

function uniqueSorted(values: Array<null | string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b))
}

watch(page, async () => {
  await nextTick()
  topRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})

function openJob(job: any) {
  selectedJob.value = job
}
function closeJobDetails() {
  selectedJob.value = null
}
function findFreshJob(id: string) {
  return jobs.value.find(job => job.id === id)
}
</script>

<template>
  <div class="min-h-full bg-default">
    <div ref="topRef" class="h-0 scroll-mt-2" />
    <header class="sticky top-0 z-20 border-b border-default bg-default/95 backdrop-blur">
      <div class="flex h-14 items-center justify-between gap-3 px-4 lg:px-6">
        <h1 class="truncate text-lg font-semibold text-highlighted">
          {{ $t('nav.market') }}
        </h1>
        <UButton v-if="canCreate" type="button" icon="i-lucide-plus">
          {{ $t('jobs.create') }}
        </UButton>
      </div>
      <nav class="grid grid-cols-2 gap-1 px-2 pb-2 sm:flex sm:overflow-x-auto lg:px-4">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="flex min-w-0 items-center justify-center gap-1.5 rounded px-2 py-2 text-xs font-medium transition sm:shrink-0 sm:justify-start sm:gap-2 sm:px-3 sm:text-sm"
          :class="activeTab === tab.id ? 'bg-white/10 text-highlighted' : 'text-muted hover:bg-white/[0.06] hover:text-default'"
          @click="activeTab = tab.id"
        >
          <UIcon :name="tab.icon" class="size-4" />
          <span class="truncate sm:hidden">{{ tab.mobileLabel }}</span>
          <span class="hidden sm:inline">{{ tab.label }}</span>
        </button>
      </nav>
    </header>

    <main class="mx-auto grid w-full max-w-5xl gap-3 p-3 sm:gap-4 sm:p-4 lg:p-6">
      <section class="min-w-0">
        <ArkJobFilters
          v-model:filters="filters"
          :category-options="categoryOptions"
          :tag-options="tagOptions"
          :source-options="sourceOptions"
          :status-options="statusOptions"
          :curation-options="[]"
          :can-manage-jobs="false"
          :has-active-filters="hasActiveFilters"
          @clear="clearFilters"
        />

        <div class="grid gap-3">
          <ArkJobCard
            v-for="job in jobs"
            :key="job.id"
            :job="job"
            :category-options="categoryOptions"
            :tag-options="tagOptions"
            @open="openJob"
          />

          <div v-if="!jobs.length && !jobsLoading" class="rounded-lg border border-dashed border-white/10 bg-elevated px-4 py-8 text-center sm:p-8">
            <div class="mx-auto grid size-12 place-items-center rounded-full bg-muted text-toned">
              <UIcon name="i-lucide-briefcase-business" class="size-6" />
            </div>
            <h2 class="mt-3 font-semibold text-highlighted">
              {{ $t('jobs.empty.title') }}
            </h2>
            <p class="mt-1 text-sm text-muted">
              {{ $t('jobs.empty.subtitle') }}
            </p>
          </div>

          <div v-if="totalPages > 1" class="mt-1 flex justify-center">
            <UPagination
              v-model:page="page"
              :total="total"
              :items-per-page="pageSize"
              :sibling-count="1"
            />
          </div>
        </div>
      </section>
    </main>

    <ArkJobDetailModal
      v-if="selectedJob"
      v-model="selectedJob"
      :can-manage-jobs="false"
      :category-options="categoryOptions"
      :tag-options="tagOptions"
      :refresh="refreshJobs"
      :find-fresh-job="findFreshJob"
      @close="closeJobDetails"
    />
  </div>
</template>

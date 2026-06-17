/**
 * Owns the market jobs list: SSR-friendly fetch (via `useAsyncData`),
 * `T[] | { items: T[] }` normalization, and filter/pagination state.
 *
 * Two pages consume this:
 * - jobs/index.vue        — full filter bar + admin curation
 * - spaces/[spaceId]/jobs — pass `spaceId` to scope the list to one space
 * (jobs/[jobId].vue uses its own `byId` fetch, not this list.)
 */
import type { MaybeRefOrGetter } from 'vue'

/** Normalize a tRPC list payload that may be a bare array or `{ items }`. */
export function jobItems(value: unknown): any[] {
  if (Array.isArray(value))
    return value
  if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items))
    return (value as { items: any[] }).items
  return []
}

export interface UseArkJobsOptions {
  /** Stable key for `useAsyncData` (must be unique per page/usage). */
  key: string
  /** Restrict the list to a single space (filtered server-side via `jobs.list`). */
  spaceId?: MaybeRefOrGetter<string | undefined>
  /** Whether the current viewer can see admin/curation rows. */
  canManageJobs?: MaybeRefOrGetter<boolean>
  /** Whether the admin tab is active (enables curation filter + admin rows). */
  adminView?: MaybeRefOrGetter<boolean>
  /** Restrict to vacancies or orders (the «Вакансии»/«Заказы» tabs). */
  kindGroup?: MaybeRefOrGetter<'order' | 'vacancy' | undefined>
  /** Items per page. Defaults to 10. */
  pageSize?: number
}

export async function useArkJobs(options: UseArkJobsOptions) {
  const { $trpc } = useNuxtApp()
  const pageSize = options.pageSize ?? 10
  const page = ref(1)

  const filters = reactive({
    categoryId: '',
    curation: '',
    query: '',
    sort: 'newest' as 'budget_asc' | 'budget_desc' | 'newest' | 'oldest',
    source: '',
    status: '',
    tagId: '',
  })

  const adminView = computed(() => Boolean(toValue(options.adminView)))
  const spaceId = computed(() => toValue(options.spaceId) || undefined)

  function jobsQueryInput() {
    return {
      admin: adminView.value,
      categoryId: filters.categoryId || undefined,
      curation: adminView.value && filters.curation ? filters.curation : undefined,
      kindGroup: toValue(options.kindGroup) || undefined,
      limit: pageSize,
      offset: (page.value - 1) * pageSize,
      query: filters.query.trim() || undefined,
      sort: filters.sort,
      source: filters.source || undefined,
      spaceId: spaceId.value,
      status: filters.status || undefined,
      tagId: filters.tagId || undefined,
    }
  }

  // Awaited so SSR blocks on the initial fetch, matching the pages' previous
  // top-level `await useAsyncData(...)` behavior.
  const { data, refresh, status } = await useAsyncData(
    options.key,
    () => $trpc.ark.market.jobs.list.query(jobsQueryInput()),
  )

  const jobs = computed(() => jobItems(data.value))
  const total = computed(() => (data.value as { total?: number } | null)?.total ?? jobs.value.length)
  const loading = computed(() => status.value === 'pending')
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
  const hasActiveFilters = computed(() => Boolean(
    filters.query || filters.status || filters.source || filters.curation || filters.categoryId || filters.tagId,
  ))

  function clearFilters() {
    filters.categoryId = ''
    filters.curation = ''
    filters.query = ''
    filters.sort = 'newest'
    filters.source = ''
    filters.status = ''
    filters.tagId = ''
  }

  // Reset to page 1 when filters change, otherwise just refetch.
  watch(
    () => [filters.query, filters.categoryId, filters.tagId, filters.status, filters.source, filters.curation, filters.sort, adminView.value, spaceId.value, toValue(options.kindGroup)],
    () => {
      if (page.value !== 1)
        page.value = 1
      else
        void refresh()
    },
  )
  watch(page, () => void refresh())
  watch(totalPages, (count) => {
    if (page.value > count)
      page.value = count
  })

  return {
    clearFilters,
    data,
    filters,
    hasActiveFilters,
    jobs,
    loading,
    page,
    pageSize,
    refresh,
    status,
    total,
    totalPages,
  }
}

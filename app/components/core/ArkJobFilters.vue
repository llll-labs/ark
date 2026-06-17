<script setup lang="ts">
/**
 * Market jobs filter bar. Binds directly to the reactive `filters` object owned
 * by `useArkJobs`. Uses native `<select>` elements (empty-string values are
 * fine here — the Nuxt UI empty-value rule only applies to USelect/USelectMenu).
 */
interface TaxonomyOption {
  id: string
  name: string
}

interface JobFilters {
  categoryId: string
  curation: string
  query: string
  sort: string
  source: string
  status: string
  tagId: string
}

const props = defineProps<{
  categoryOptions: TaxonomyOption[]
  tagOptions: TaxonomyOption[]
  sourceOptions: string[]
  statusOptions: readonly string[]
  curationOptions: readonly string[]
  canManageJobs: boolean
  hasActiveFilters: boolean
}>()

const emit = defineEmits<{ clear: [] }>()
// Two-way bound so the v-models below mutate the model, not a prop.
const filters = defineModel<JobFilters>('filters', { required: true })

const { t } = useI18n()

function statusLabel(status: string) {
  return t(`jobs.status.${status}`)
}
function curationLabel(status: string) {
  return t(`jobs.curation.${status}`)
}

const sortOptions = ['newest', 'oldest', 'budget_desc', 'budget_asc'] as const
</script>

<template>
  <section class="mb-3 rounded-lg border border-default bg-elevated p-3">
    <div class="ark-scrollbar overflow-x-auto">
      <div class="flex min-w-max gap-2">
        <label class="relative w-56 shrink-0">
          <UIcon
            name="i-lucide-search"
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <input
            v-model="filters.query"
            type="search"
            :placeholder="$t('jobs.filters.searchPlaceholder')"
            class="h-9 w-full rounded border border-default bg-muted pl-9 pr-3 text-sm text-default outline-none placeholder:text-muted focus:border-white/20"
          >
        </label>

        <label class="sr-only" for="jobs-sort">{{ $t("jobs.sort.label") }}</label>
        <select
          id="jobs-sort"
          v-model="filters.sort"
          class="h-9 shrink-0 rounded border border-default bg-muted px-3 text-sm text-default outline-none focus:border-white/20"
        >
          <option v-for="option in sortOptions" :key="option" :value="option">
            {{ $t(`jobs.sort.${option}`) }}
          </option>
        </select>

        <label class="sr-only" for="jobs-category-filter">{{
          $t("jobs.filters.category")
        }}</label>
        <select
          id="jobs-category-filter"
          v-model="filters.categoryId"
          class="h-9 w-36 shrink-0 rounded border border-default bg-muted px-3 text-sm text-default outline-none focus:border-white/20"
        >
          <option value="">
            {{ $t("jobs.filters.anyCategory") }}
          </option>
          <option
            v-for="category in props.categoryOptions"
            :key="category.id"
            :value="category.id"
          >
            {{ category.name }}
          </option>
        </select>

        <label class="sr-only" for="jobs-tag-filter">{{
          $t("jobs.filters.tag")
        }}</label>
        <select
          id="jobs-tag-filter"
          v-model="filters.tagId"
          class="h-9 w-36 shrink-0 rounded border border-default bg-muted px-3 text-sm text-default outline-none focus:border-white/20"
        >
          <option value="">
            {{ $t("jobs.filters.anyTag") }}
          </option>
          <option
            v-for="tag in props.tagOptions"
            :key="tag.id"
            :value="tag.id"
          >
            {{ tag.name }}
          </option>
        </select>

        <label class="sr-only" for="jobs-status-filter">{{
          $t("jobs.filters.status")
        }}</label>
        <select
          id="jobs-status-filter"
          v-model="filters.status"
          class="h-9 w-36 shrink-0 rounded border border-default bg-muted px-3 text-sm text-default outline-none focus:border-white/20"
        >
          <option value="">
            {{ $t("jobs.filters.anyStatus") }}
          </option>
          <option
            v-for="status in props.statusOptions"
            :key="status"
            :value="status"
          >
            {{ statusLabel(status) }}
          </option>
        </select>

        <label class="sr-only" for="jobs-source-filter">{{
          $t("jobs.filters.source")
        }}</label>
        <select
          id="jobs-source-filter"
          v-model="filters.source"
          class="h-9 w-36 shrink-0 rounded border border-default bg-muted px-3 text-sm text-default outline-none focus:border-white/20"
        >
          <option value="">
            {{ $t("jobs.filters.anySource") }}
          </option>
          <option
            v-for="source in props.sourceOptions"
            :key="source"
            :value="source"
          >
            {{ source }}
          </option>
        </select>

        <template v-if="props.canManageJobs">
          <label class="sr-only" for="jobs-curation-filter">{{
            $t("jobs.filters.curation")
          }}</label>
          <select
            id="jobs-curation-filter"
            v-model="filters.curation"
            class="h-9 w-36 shrink-0 rounded border border-default bg-muted px-3 text-sm text-default outline-none focus:border-white/20"
          >
            <option value="">
              {{ $t("jobs.filters.anyCuration") }}
            </option>
            <option
              v-for="status in props.curationOptions"
              :key="status"
              :value="status"
            >
              {{ curationLabel(status) }}
            </option>
          </select>
        </template>

        <UButton
          type="button"
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-lucide-rotate-ccw"
          class="shrink-0"
          :disabled="!props.hasActiveFilters"
          @click="emit('clear')"
        >
          {{ $t("jobs.filters.clear") }}
        </UButton>
      </div>
    </div>
    <!-- Tenant extension point: niche filters. -->
    <slot name="extra" :filters="filters" />
  </section>
</template>

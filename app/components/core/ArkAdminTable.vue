<script setup lang="ts">
import type { ColumnDef, ColumnOrderState, ColumnSizingState, SortingState, Updater, VisibilityState, Column as VueTableColumn } from '@tanstack/vue-table'
// Right-pane data view for one admin table. The server still owns filtering,
// sorting, pagination and CRUD; TanStack owns column state and grid rendering.
import { FlexRender, getCoreRowModel, useVueTable } from '@tanstack/vue-table'
import { useStorage } from '@vueuse/core'
import ArkAdminRowForm from './ArkAdminRowForm.vue'

const props = defineProps<{ tableKey: string }>()

const { $trpc } = useNuxtApp()

const pageSizes = [25, 50, 100, 250, 500, 1000]
const pageSize = ref(25)
const page = ref(1)
const sortColumn = ref<string | undefined>(undefined)
const sortDir = ref<'asc' | 'desc'>('desc')
const filters = ref<{ column: string, value: string }[]>([])
const draftColumn = ref('')
const draftValue = ref('')

const formOpen = ref(false)
const editRow = ref<Record<string, unknown> | null>(null)
const tableReady = ref(false)

onMounted(() => {
  tableReady.value = true
})

const { data, status, error, refresh } = await useAsyncData(
  `admin-rows-${props.tableKey}`,
  () => $trpc.ark.admin.rows.query({
    table: props.tableKey,
    limit: pageSize.value,
    offset: (page.value - 1) * pageSize.value,
    sortColumn: sortColumn.value,
    sortDir: sortDir.value,
    filters: filters.value,
  }),
  { watch: [page, pageSize, sortColumn, sortDir, filters] },
)
watch(pageSize, () => {
  page.value = 1
})

type AdminRow = Record<string, unknown>
interface AdminColumn { key: string, type: string, enumValues?: string[], editable: boolean, ref?: { table: string | null, labelColumn: string } }
interface AdminTableMeta { description: string, group: string, icon: string, key: string, label: string, primaryKey: string }
const allColumns = computed<AdminColumn[]>(() => (data.value?.columns ?? []) as AdminColumn[])
const meta = computed<AdminTableMeta | null>(() => (data.value?.table ?? null) as AdminTableMeta | null)
const refs = computed<Record<string, Record<string, string>>>(() => (data.value?.refs ?? {}) as Record<string, Record<string, string>>)
const rows = computed<AdminRow[]>(() => (data.value?.rows ?? []) as AdminRow[])
const total = computed(() => data.value?.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const activeSort = computed(() => data.value?.sortColumn)
const loading = computed(() => status.value === 'pending')

// Hidden columns keep the previous key for compatibility with existing users.
const hidden = useStorage<string[]>(`ark-admin-hidden:${props.tableKey}`, [])
const columnSizing = useStorage<ColumnSizingState>(`ark-admin-column-sizing:${props.tableKey}`, {})
const columnOrder = useStorage<ColumnOrderState>(`ark-admin-column-order:${props.tableKey}`, [])

const columnByKey = computed(() => new Map(allColumns.value.map(col => [col.key, col])))
const normalizedColumnOrder = computed<ColumnOrderState>(() => {
  const keys = allColumns.value.map(col => col.key)
  return [
    ...columnOrder.value.filter(key => keys.includes(key)),
    ...keys.filter(key => !columnOrder.value.includes(key)),
  ]
})
const columnVisibility = computed<VisibilityState>(() => {
  const state: VisibilityState = {}
  for (const col of allColumns.value)
    state[col.key] = !hidden.value.includes(col.key)
  return state
})
const sortingState = computed<SortingState>(() => {
  const id = sortColumn.value ?? activeSort.value
  return id ? [{ id, desc: sortDir.value === 'desc' }] : []
})
const tableColumns = computed<ColumnDef<AdminRow>[]>(() => allColumns.value.map(col => ({
  id: col.key,
  accessorKey: col.key,
  header: col.key,
  cell: info => cellText(col, info.row.original),
  size: defaultColumnSize(col),
  minSize: 96,
  maxSize: 720,
})))

watch(allColumns, (cols) => {
  const keys = cols.map(col => col.key)
  columnOrder.value = [
    ...columnOrder.value.filter(key => keys.includes(key)),
    ...keys.filter(key => !columnOrder.value.includes(key)),
  ]
  hidden.value = hidden.value.filter(key => keys.includes(key))
}, { immediate: true })

function applyUpdater<T>(updater: Updater<T>, current: T): T {
  return typeof updater === 'function' ? (updater as (old: T) => T)(current) : updater
}
function setColumnVisibility(updater: Updater<VisibilityState>) {
  const next = applyUpdater(updater, columnVisibility.value)
  hidden.value = allColumns.value
    .filter(col => next[col.key] === false)
    .map(col => col.key)
}
function setColumnSizing(updater: Updater<ColumnSizingState>) {
  columnSizing.value = applyUpdater(updater, columnSizing.value)
}
function setColumnOrder(updater: Updater<ColumnOrderState>) {
  columnOrder.value = applyUpdater(updater, normalizedColumnOrder.value)
}
function showAllColumns() {
  hidden.value = []
}
function hideAllColumns() {
  hidden.value = allColumns.value.map(col => col.key)
}
function moveColumn(key: string, direction: -1 | 1) {
  const order = [...normalizedColumnOrder.value]
  const index = order.indexOf(key)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= order.length)
    return
  const [item] = order.splice(index, 1)
  if (!item)
    return
  order.splice(nextIndex, 0, item)
  columnOrder.value = order
}

function toggleSort(key: string) {
  if (key === (sortColumn.value ?? activeSort.value)) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortColumn.value = key
    sortDir.value = 'asc'
  }
  page.value = 1
}

function addFilter() {
  if (!draftColumn.value || !draftValue.value)
    return
  filters.value = [...filters.value, { column: draftColumn.value, value: draftValue.value }]
  draftColumn.value = ''
  draftValue.value = ''
  page.value = 1
}
function removeFilter(index: number) {
  filters.value = filters.value.filter((_, i) => i !== index)
  page.value = 1
}

function openNew() {
  editRow.value = null
  formOpen.value = true
}
function openRow(row: AdminRow) {
  editRow.value = row
  formOpen.value = true
}

function defaultColumnSize(col: AdminColumn): number {
  if (col.key === 'id')
    return 260
  if (col.type === 'json')
    return 340
  if (col.type.includes('timestamp') || col.type.includes('date'))
    return 180
  return 220
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined)
    return '—'
  if (value instanceof Date)
    return value.toISOString().slice(0, 19).replace('T', ' ')
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return text.length > 80 ? `${text.slice(0, 79)}…` : text
}

// Prefer a resolved FK label (e.g. space name) over the raw uuid.
function cellText(col: AdminColumn, row: AdminRow): string {
  const value = row[col.key]
  if (col.ref && value != null) {
    const label = refs.value[col.key]?.[String(value)]
    if (label)
      return label
  }
  return formatCell(value)
}
function columnMeta(id: string): AdminColumn | undefined {
  return columnByKey.value.get(id)
}
function columnIsReference(id: string, row: AdminRow): boolean {
  const col = columnMeta(id)
  if (!col?.ref)
    return false
  const value = row[id]
  return value != null && Boolean(refs.value[id]?.[String(value)])
}

const table = useVueTable<AdminRow>({
  get data() {
    return rows.value
  },
  get columns() {
    return tableColumns.value
  },
  get state() {
    return {
      columnOrder: normalizedColumnOrder.value,
      columnPinning: { left: [], right: [] },
      columnSizing: columnSizing.value,
      columnVisibility: columnVisibility.value,
      pagination: {
        pageIndex: page.value - 1,
        pageSize: pageSize.value,
      },
      sorting: sortingState.value,
    }
  },
  getCoreRowModel: getCoreRowModel(),
  manualPagination: true,
  manualSorting: true,
  enableColumnResizing: true,
  columnResizeMode: 'onChange',
  onColumnOrderChange: setColumnOrder,
  onColumnSizingChange: setColumnSizing,
  onColumnVisibilityChange: setColumnVisibility,
})

let renderVersion = 0
const tableRenderVersion = ref(0)
watchEffect(() => {
  table.setOptions(previous => ({
    ...previous,
    columns: tableColumns.value,
    data: rows.value,
    state: {
      ...(previous.state ?? {}),
      columnOrder: normalizedColumnOrder.value,
      columnPinning: { left: [], right: [] },
      columnSizing: columnSizing.value,
      columnVisibility: columnVisibility.value,
      pagination: {
        pageIndex: page.value - 1,
        pageSize: pageSize.value,
      },
      sorting: sortingState.value,
    },
  }))
  tableRenderVersion.value = ++renderVersion
})

// TanStack mutates its state outside Vue reactivity; reading the render
// version inside the computed registers it as a dependent so these re-run
// whenever the table re-renders.
function trackTableState<T>(read: () => T) {
  return computed(() => {
    const _version = tableRenderVersion.value
    return read()
  })
}
const allLeafColumns = trackTableState(() => table.getAllLeafColumns())
const visibleLeafColumns = trackTableState(() => table.getVisibleLeafColumns())
const headerGroups = trackTableState(() => table.getHeaderGroups())
const tableRows = trackTableState(() => table.getRowModel().rows)
const tableTotalSize = trackTableState(() => table.getTotalSize())
const isColumnResizing = trackTableState(() => Boolean(table.getState().columnSizingInfo?.isResizingColumn))
const firstVisibleColumnId = computed(() => visibleLeafColumns.value[0]?.id)

function cellWidthStyle(column: VueTableColumn<AdminRow, unknown>): Record<string, string> {
  const size = `${column.getSize()}px`
  return {
    width: size,
    minWidth: size,
    maxWidth: size,
  }
}
function columnIsResizing(column: VueTableColumn<AdminRow, unknown>): boolean {
  return table.getState().columnSizingInfo?.isResizingColumn === column.id
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-default">
    <header class="flex shrink-0 items-center gap-3 border-b border-default px-4 py-3">
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-base font-semibold leading-6 text-highlighted">
          {{ meta?.label ?? tableKey }}
        </h1>
        <p class="truncate text-xs text-muted">
          {{ meta?.description ?? '' }}
        </p>
      </div>
      <UBadge color="neutral" variant="subtle">
        {{ $t('admin.rowCount', { n: total }) }}
      </UBadge>

      <UPopover>
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-columns-3" :title="$t('admin.columns')" />
        <template #content>
          <div class="flex items-center gap-1 border-b border-default p-2">
            <UButton size="xs" color="neutral" variant="soft" class="flex-1 justify-center" @click="showAllColumns">
              {{ $t('admin.showAll') }}
            </UButton>
            <UButton size="xs" color="neutral" variant="soft" class="flex-1 justify-center" @click="hideAllColumns">
              {{ $t('admin.hideAll') }}
            </UButton>
          </div>
          <div class="ark-scrollbar max-h-80 w-56 overflow-y-auto p-2">
            <label
              v-for="column in allLeafColumns"
              :key="column.id"
              class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-white/[0.04]"
            >
              <input
                type="checkbox"
                class="accent-primary"
                :checked="column.getIsVisible()"
                @change="column.toggleVisibility()"
              >
              <span class="min-w-0 flex-1 truncate">{{ column.id }}</span>
              <button
                type="button"
                class="rounded p-1 text-muted hover:bg-accented hover:text-default"
                :title="$t('admin.moveUp')"
                @click.prevent.stop="moveColumn(column.id, -1)"
              >
                <UIcon name="i-lucide-arrow-up" class="size-3" />
              </button>
              <button
                type="button"
                class="rounded p-1 text-muted hover:bg-accented hover:text-default"
                :title="$t('admin.moveDown')"
                @click.prevent.stop="moveColumn(column.id, 1)"
              >
                <UIcon name="i-lucide-arrow-down" class="size-3" />
              </button>
            </label>
          </div>
        </template>
      </UPopover>

      <UButton icon="i-lucide-plus" size="sm" @click="openNew">
        {{ $t('admin.new') }}
      </UButton>
    </header>

    <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default bg-elevated px-4 py-2">
      <select
        v-model="draftColumn"
        class="h-8 w-40 rounded border border-default bg-muted px-2 text-xs text-default outline-none focus:border-white/20"
      >
        <option value="">
          {{ $t('admin.filterColumn') }}
        </option>
        <option v-for="col in allColumns" :key="col.key" :value="col.key">
          {{ col.key }}
        </option>
      </select>
      <input
        v-model="draftValue"
        :placeholder="$t('admin.filterValue')"
        class="h-8 w-40 rounded border border-default bg-muted px-2 text-xs text-default outline-none placeholder:text-muted focus:border-white/20"
        @keyup.enter="addFilter"
      >
      <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-plus" :disabled="!draftColumn || !draftValue" @click="addFilter" />
      <span
        v-for="(filter, index) in filters"
        :key="index"
        class="inline-flex items-center gap-1 rounded-full bg-accented px-2 py-0.5 text-xs text-default"
      >
        {{ filter.column }}: {{ filter.value }}
        <button type="button" class="text-muted hover:text-default" @click="removeFilter(index)">✕</button>
      </span>
    </div>

    <UAlert v-if="error" class="m-4" color="error" variant="subtle" :title="String(error)" />

    <div
      v-if="tableReady"
      class="ark-scrollbar min-h-0 flex-1 overflow-auto"
      :class="{ 'select-none': isColumnResizing }"
    >
      <table class="border-collapse table-fixed text-sm" :style="{ width: `${tableTotalSize}px`, minWidth: '100%' }">
        <thead class="sticky top-0 z-30 bg-elevated">
          <tr v-for="headerGroup in headerGroups" :key="headerGroup.id">
            <th
              v-for="header in headerGroup.headers"
              :key="header.id"
              class="group/header relative cursor-pointer whitespace-nowrap border-b border-default px-3 py-2 text-left font-semibold text-toned hover:text-highlighted"
              :class="header.column.id === firstVisibleColumnId ? 'sticky left-0 z-40 bg-elevated' : ''"
              :style="cellWidthStyle(header.column)"
              @click="toggleSort(header.column.id)"
            >
              <span class="flex min-w-0 items-center gap-1 pr-2">
                <span class="truncate">
                  <FlexRender :render="header.column.columnDef.header" :props="header.getContext()" />
                </span>
                <UIcon
                  v-if="activeSort === header.column.id"
                  :name="sortDir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'"
                  class="size-3 shrink-0"
                />
                <span class="shrink-0 text-[10px] font-normal text-muted">{{ columnMeta(header.column.id)?.type }}</span>
              </span>
              <button
                type="button"
                class="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none border-r border-transparent hover:border-primary"
                :class="{ 'border-primary bg-primary/20': columnIsResizing(header.column) }"
                :aria-label="`Resize column ${header.column.id}`"
                @click.stop
                @mousedown.stop="header.getResizeHandler()($event)"
                @touchstart.stop.passive="header.getResizeHandler()($event)"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in tableRows"
            :key="row.id"
            class="group cursor-pointer border-b border-default/60 hover:bg-white/[0.03]"
            @click="openRow(row.original)"
          >
            <td
              v-for="cell in row.getVisibleCells()"
              :key="cell.id"
              class="truncate whitespace-nowrap px-3 py-1.5"
              :class="[
                cell.column.id === firstVisibleColumnId ? 'sticky left-0 z-20 bg-default group-hover:bg-elevated' : '',
                columnIsReference(cell.column.id, row.original) ? 'text-primary' : 'text-toned',
              ]"
              :style="cellWidthStyle(cell.column)"
              :title="formatCell(row.original[cell.column.id])"
            >
              <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
            </td>
          </tr>
          <tr v-if="!loading && !tableRows.length">
            <td :colspan="visibleLeafColumns.length || 1" class="px-3 py-10 text-center text-muted">
              {{ $t('admin.empty') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="flex min-h-0 flex-1 items-center justify-center text-sm text-muted">
      {{ $t('admin.loading') }}
    </div>

    <footer class="flex shrink-0 items-center justify-between gap-3 border-t border-default px-4 py-2 text-xs text-muted">
      <span class="shrink-0">{{ $t('admin.rowCount', { n: total }) }}</span>
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-1.5">
          <span class="hidden sm:inline">{{ $t('admin.perPage') }}</span>
          <select
            v-model.number="pageSize"
            class="h-7 rounded border border-default bg-muted px-1.5 text-xs text-default outline-none focus:border-white/20"
          >
            <option v-for="size in pageSizes" :key="size" :value="size">
              {{ size }}
            </option>
          </select>
        </label>
        <span class="shrink-0">{{ $t('admin.page', { page, pages: totalPages }) }}</span>
        <div class="flex gap-1">
          <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-chevron-left" :disabled="page <= 1" @click="page--" />
          <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-chevron-right" :disabled="page >= totalPages" @click="page++" />
        </div>
      </div>
    </footer>

    <ArkAdminRowForm
      v-model:open="formOpen"
      :table="tableKey"
      :columns="allColumns"
      :row="editRow"
      :primary-key="meta?.primaryKey ?? 'id'"
      @saved="refresh"
      @deleted="refresh"
    />
  </div>
</template>

<script setup lang="ts">
import type { LocationQueryRaw } from 'vue-router'
import ArkAdminTable from './ArkAdminTable.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { $trpc } = useNuxtApp()

const tab = ref<'data' | 'views'>('data')
const selectedTable = ref(typeof route.query.table === 'string' && route.query.table !== 'permissions' ? route.query.table : '')

interface AdminTableMeta {
  description: string
  group: string
  icon: string
  key: string
  label: string
}

const { data: registry } = await useAsyncData('ark-admin-tables', () => $trpc.ark.admin.tables.query())
const availableTables = computed<AdminTableMeta[]>(() => (registry.value ?? []) as AdminTableMeta[])
const availableTableKeys = computed(() => new Set(availableTables.value.map(table => table.key)))

const groups = computed(() => {
  const order = ['identity', 'market', 'content', 'system', 'app'] as const
  return order
    .map(group => ({ group, label: t(`admin.groups.${group}`), tables: availableTables.value.filter(table => table.group === group) }))
    .filter(entry => entry.tables.length)
})

watch([() => route.query.table, availableTableKeys], ([tableKey, tableKeys]) => {
  if (typeof tableKey !== 'string')
    return
  if (tableKey === 'permissions') {
    const query: LocationQueryRaw = { ...route.query, section: 'permissions' }
    delete query.table
    void router.replace({ query })
    return
  }
  if (tableKeys.has(tableKey)) {
    selectedTable.value = tableKey
    tab.value = 'data'
  }
}, { immediate: true })

function selectTable(key: string) {
  selectedTable.value = key
  tab.value = 'data'
  replaceContentQuery(key)
}

function selectDataTab() {
  tab.value = 'data'
  replaceContentQuery(selectedTable.value || undefined)
}

function selectViewsTab() {
  tab.value = 'views'
  replaceContentQuery(undefined)
}

function replaceContentQuery(table?: string) {
  const query: LocationQueryRaw = { ...route.query, section: 'content' }
  if (table)
    query.table = table
  else
    delete query.table
  void router.replace({ query })
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-default">
    <div class="shrink-0 border-b border-default bg-default/95 px-2 py-1.5">
      <nav class="flex min-w-0 items-center gap-1">
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-sm font-semibold transition"
          :class="tab === 'data' ? 'bg-white/10 text-highlighted' : 'text-muted hover:bg-white/[0.06] hover:text-default'"
          @click="selectDataTab"
        >
          {{ $t('admin.tabs.data') }}
        </button>
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-sm font-semibold transition"
          :class="tab === 'views' ? 'bg-white/10 text-highlighted' : 'text-muted hover:bg-white/[0.06] hover:text-default'"
          @click="selectViewsTab"
        >
          {{ $t('admin.tabs.views') }}
        </button>
      </nav>
    </div>

    <div v-if="tab === 'views'" class="grid min-h-0 flex-1 place-items-center p-10 text-center text-muted">
      <div>
        <UIcon name="i-lucide-panels-top-left" class="mx-auto size-8" />
        <p class="mt-2 text-sm">
          {{ $t('admin.viewsComingSoon') }}
        </p>
      </div>
    </div>

    <div v-else class="flex min-h-0 flex-1">
      <aside class="ark-scrollbar w-56 shrink-0 overflow-y-auto border-r border-default bg-default/40 p-2">
        <nav class="grid gap-3">
          <div v-for="entry in groups" :key="entry.group" class="mb-3">
            <div class="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
              {{ entry.label }}
            </div>
            <button
              v-for="table in entry.tables"
              :key="table.key"
              type="button"
              class="flex min-h-9 w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm font-semibold transition"
              :class="selectedTable === table.key ? 'bg-white/10 text-highlighted' : 'text-muted hover:bg-white/[0.06] hover:text-default'"
              @click="selectTable(table.key)"
            >
              <UIcon :name="table.icon" class="size-4 shrink-0" />
              <span class="truncate">{{ table.label }}</span>
            </button>
          </div>
        </nav>
      </aside>

      <div class="min-w-0 flex-1">
        <ArkAdminTable v-if="selectedTable" :key="selectedTable" :table-key="selectedTable" />
        <div v-else class="grid h-full place-items-center p-10 text-center text-muted">
          <div>
            <UIcon name="i-lucide-table-2" class="mx-auto size-8" />
            <p class="mt-2 text-sm">
              {{ $t('admin.selectTable') }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

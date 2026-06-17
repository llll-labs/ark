<script setup lang="ts">
// Generic create/edit/delete form for an admin table row (A4). Renders a
// type-aware widget per editable column; coerces values before sending to the
// admin router (which sanitizes for Drizzle). Admin-only surface.
import ArkSettingField from './ArkSettingField.vue'

interface Column { key: string, type: string, enumValues?: string[], editable: boolean, ref?: { table: string | null, labelColumn: string } }

const props = withDefaults(defineProps<{
  table: string
  columns: Column[]
  row: Record<string, unknown> | null
  /** Primary-key column of the table; registered app tables may not use `id`. */
  primaryKey?: string
}>(), { primaryKey: 'id' })
const emit = defineEmits<{ saved: [], deleted: [] }>()
const open = defineModel<boolean>('open', { default: false })
const { $trpc } = useNuxtApp()

const editable = computed(() => props.columns.filter(column => column.editable))
// Relation-picker options, fetched lazily per referenced table when the form opens.
const relationOptions = ref<Record<string, { id: string, label: string }[]>>({})
async function loadRelationOptions() {
  const tables = [...new Set(editable.value.map(column => column.ref?.table).filter((value): value is string => Boolean(value)))]
  await Promise.all(tables.map(async (table) => {
    if (relationOptions.value[table])
      return
    relationOptions.value[table] = await $trpc.ark.admin.options.query({ table }).catch(() => [])
  }))
}
const rowId = computed(() => props.row?.[props.primaryKey])
const isEdit = computed(() => rowId.value !== null && rowId.value !== undefined && rowId.value !== '')
const form = reactive<Record<string, any>>({})
const error = ref('')
const saving = ref(false)

function toInput(column: Column, value: unknown) {
  if (column.type === 'boolean')
    return Boolean(value)
  if (value === null || value === undefined)
    return ''
  if (column.type === 'json')
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  if (column.type === 'date') {
    const date = new Date(value as string)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 16)
  }
  return value
}

watch([() => props.row, open], () => {
  if (!open.value)
    return
  error.value = ''
  for (const column of editable.value)
    form[column.key] = toInput(column, props.row?.[column.key])
  void loadRelationOptions()
}, { immediate: true })

function toValue(column: Column, value: any) {
  if (column.type === 'boolean')
    return Boolean(value)
  if (value === '' || value === null || value === undefined)
    return null
  if (column.type === 'number')
    return Number(value)
  return value
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    const values: Record<string, unknown> = {}
    for (const column of editable.value)
      values[column.key] = toValue(column, form[column.key])
    if (isEdit.value)
      await $trpc.ark.admin.update.mutate({ table: props.table, id: String(rowId.value), values })
    else
      await $trpc.ark.admin.create.mutate({ table: props.table, values })
    emit('saved')
    open.value = false
  }
  catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  }
  finally {
    saving.value = false
  }
}

async function remove() {
  saving.value = true
  error.value = ''
  try {
    await $trpc.ark.admin.remove.mutate({ table: props.table, id: String(rowId.value) })
    emit('deleted')
    open.value = false
  }
  catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <USlideover v-model:open="open" side="right" :title="isEdit ? $t('admin.editRow') : $t('admin.newRow')">
    <template #body>
      <div class="grid gap-3">
        <UAlert v-if="error" color="error" variant="subtle" :title="error" />
        <ArkSettingField v-for="column in editable" :key="column.key" :label="column.key">
          <USelectMenu
            v-if="column.ref?.table"
            v-model="form[column.key]"
            :items="relationOptions[column.ref.table] || []"
            value-key="id"
            label-key="label"
            class="w-full"
            :placeholder="$t('admin.unset')"
          />
          <USwitch v-else-if="column.type === 'boolean'" v-model="form[column.key]" />
          <USelectMenu v-else-if="column.enumValues?.length" v-model="form[column.key]" :items="column.enumValues" class="w-full" :placeholder="$t('admin.unset')" />
          <UTextarea v-else-if="column.type === 'json'" v-model="form[column.key]" :rows="3" class="w-full font-mono text-xs" />
          <UInput v-else-if="column.type === 'number'" v-model="form[column.key]" type="number" class="w-full" />
          <UInput v-else-if="column.type === 'date'" v-model="form[column.key]" type="datetime-local" class="w-full" />
          <UInput v-else v-model="form[column.key]" class="w-full" />
        </ArkSettingField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center gap-2">
        <UButton v-if="isEdit" color="error" variant="soft" icon="i-lucide-trash-2" :loading="saving" @click="remove">
          {{ $t('admin.delete') }}
        </UButton>
        <div class="ml-auto flex gap-2">
          <UButton color="neutral" variant="ghost" :disabled="saving" @click="open = false">
            {{ $t('common.cancel') }}
          </UButton>
          <UButton icon="i-lucide-save" :loading="saving" @click="save">
            {{ $t('admin.save') }}
          </UButton>
        </div>
      </div>
    </template>
  </USlideover>
</template>

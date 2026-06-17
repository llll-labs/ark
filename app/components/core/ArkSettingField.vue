<script setup lang="ts">
defineProps<{
  label: string
  hint?: string
  name?: string
  required?: boolean
  orientation?: 'vertical' | 'horizontal'
}>()
</script>

<template>
  <label
    v-if="orientation === 'horizontal'"
    class="flex items-center justify-between gap-4 rounded bg-default px-3 py-2"
  >
    <span class="min-w-0">
      <span class="block text-sm font-medium text-default">{{ label }}</span>
      <span v-if="hint" class="block truncate text-xs text-muted">{{ hint }}</span>
    </span>
    <slot />
  </label>

  <UFormField
    v-else
    :label="label"
    :description="hint"
    :name="name"
    :required="required"
    :ui="{ label: 'text-xs font-semibold text-toned' }"
  >
    <slot />
  </UFormField>
</template>

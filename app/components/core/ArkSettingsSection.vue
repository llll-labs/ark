<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
  icon?: string
}>()
</script>

<template>
  <section class="rounded-lg border border-default bg-muted p-4">
    <div v-if="title || description || $slots.header" class="mb-4">
      <slot name="header">
        <div class="flex items-center gap-2">
          <UIcon v-if="icon" :name="icon" class="size-4 shrink-0 text-muted" />
          <h4 class="text-sm font-semibold text-highlighted">
            {{ title }}
          </h4>
        </div>
        <p v-if="description" class="mt-1 text-sm leading-6 text-toned">
          {{ description }}
        </p>
      </slot>
    </div>

    <slot />

    <div v-if="$slots.actions" class="mt-4 flex justify-end">
      <slot name="actions" />
    </div>
  </section>
</template>

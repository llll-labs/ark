<script setup lang="ts">
defineProps<{
  size?: 'sm' | 'md'
}>()
</script>

<template>
  <div class="flex items-center gap-2 font-semibold">
    <div
      class="grid shrink-0 place-items-center rounded-xl bg-primary font-bold text-inverted"
      :class="size === 'sm' ? 'size-8 rounded-lg text-xs' : 'size-12 text-base'"
    >
      A
    </div>
    <span class="truncate text-highlighted">Ark Layer</span>
  </div>
</template>

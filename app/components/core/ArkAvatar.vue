<script setup lang="ts">
type AvatarSize = 'lg' | 'md' | 'sm' | 'xl' | 'xs'

const props = withDefaults(defineProps<{
  src?: null | string
  name?: null | string
  initials?: null | string
  fallback?: string
  size?: AvatarSize
  alt?: string
}>(), {
  fallback: '?',
  size: 'md',
})

const sizeClass: Record<AvatarSize, string> = {
  lg: 'size-12 text-sm',
  md: 'size-10 text-xs',
  sm: 'size-8 text-xs',
  xl: 'size-24 text-2xl',
  xs: 'size-5 text-[10px]',
}

const resolvedInitials = computed(() => props.initials || nameInitials(props.name, props.fallback))
</script>

<template>
  <div class="relative shrink-0">
    <div
      class="overflow-hidden rounded-full bg-accented font-semibold text-highlighted"
      :class="sizeClass[size]"
    >
      <img
        v-if="src"
        :src="src"
        :alt="alt ?? name ?? ''"
        class="size-full object-cover"
        loading="lazy"
        referrerpolicy="no-referrer"
      >
      <div v-else class="grid size-full place-items-center">
        {{ resolvedInitials }}
      </div>
    </div>
  </div>
</template>

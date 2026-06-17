<script setup lang="ts">
import ArkAvatar from './ArkAvatar.vue'

const props = withDefaults(defineProps<{
  ariaLabel?: string
  avatarSrc?: null | string
  initials?: null | string
  name: string
  subtitle: string
  trailingIcon?: string
}>(), {
  ariaLabel: '',
  trailingIcon: 'i-lucide-settings',
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    type="button"
    class="flex h-[52px] w-full items-center gap-2 rounded-lg bg-accented px-3 text-left transition hover:bg-white/[0.06]"
    :aria-label="props.ariaLabel || props.name"
    @click="emit('click', $event)"
  >
    <ArkAvatar :src="avatarSrc" :name="name" :initials="initials" fallback="M" size="sm" />
    <div class="min-w-0 flex-1">
      <div class="truncate text-xs font-semibold leading-4 text-highlighted">
        {{ name }}
      </div>
      <div class="truncate text-[11px] leading-4 text-muted">
        {{ subtitle }}
      </div>
    </div>
    <slot name="trailing">
      <UIcon :name="trailingIcon" class="size-4 text-muted" />
    </slot>
  </button>
</template>

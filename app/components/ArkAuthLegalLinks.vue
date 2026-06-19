<script setup lang="ts">
const props = defineProps<{
  mode: 'login' | 'register'
}>()

const emit = defineEmits<{
  'navigate': []
  'update:required': [value: boolean]
}>()
const accepted = defineModel<boolean>('accepted', { default: true })

watch(() => props.mode, () => {
  accepted.value = true
  emit('update:required', false)
}, { immediate: true })
</script>

<template>
  <span class="hidden" aria-hidden="true" />
</template>

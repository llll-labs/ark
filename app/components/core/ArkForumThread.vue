<script setup lang="ts">
const props = defineProps<{
  channelId: string
  publicRead?: boolean
}>()

const auth = useArkAuth()
await auth.ready()
const readOnly = computed(() => props.publicRead && !auth.authenticated.value)
</script>

<template>
  <ArkChannelView
    :channel-id="props.channelId"
    :allow-thread-panel="false"
    embedded
    :public-read="props.publicRead"
    :read-only="readOnly"
    :show-embedded-close="false"
  />
</template>

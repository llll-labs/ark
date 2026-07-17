<script setup lang="ts">
const props = defineProps<{
  channelId: string
}>()
</script>

<template>
  <ArkChannelView
    :channel-id="props.channelId"
    :allow-thread-panel="false"
    embedded
    :show-embedded-close="false"
  />
</template>

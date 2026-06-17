<script setup lang="ts">
import ArkChannelView from '../../../components/core/ArkChannelView.vue'

definePageMeta({
  layout: 'app',
})

const route = useRoute()
const channelId = computed(() => String(route.params.channelId))
const channel = await useChannelRouteGuard(channelId, {
  jobRedirect: c => c.targetId ? `/app/jobs/${c.targetId}` : '/app/jobs',
})
const resolvedChannelId = computed(() => channel.value?.id ?? '')
</script>

<template>
  <ArkChannelView v-if="resolvedChannelId && channel?.kind !== 'job_discussion'" :channel-id="resolvedChannelId" />
</template>

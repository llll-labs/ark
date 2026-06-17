<script setup lang="ts">
import { useArkJobs } from '../../../../composables/useArkJobs'

definePageMeta({
  layout: 'app',
})

await useArkCapabilityGate('market.access')

const route = useRoute()
const spaceId = computed(() => String(route.params.spaceId))

const { jobs } = await useArkJobs({
  key: `ark-space-jobs-${spaceId.value}`,
  pageSize: 100,
  spaceId,
})
</script>

<template>
  <div class="grid min-h-full gap-4 p-4 lg:p-6">
    <header class="ark-surface rounded-lg px-4 py-4">
      <h1 class="text-2xl font-semibold text-highlighted">
        {{ $t('space.jobs') }}
      </h1>
    </header>
    <NuxtLink
      v-for="job in jobs"
      :key="job.id"
      :to="`/app/jobs/${job.id}`"
      class="ark-surface rounded-lg p-4"
    >
      <h2 class="font-medium text-highlighted">
        {{ job.title }}
      </h2>
      <p class="mt-1 text-sm text-toned">
        {{ job.summary || job.description || job.sourceUrl }}
      </p>
    </NuxtLink>
  </div>
</template>

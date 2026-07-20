<script setup lang="ts">
import ArkChannelView from '../../../components/core/ArkChannelView.vue'
import ArkJobDiscussionComposer from '../../../components/core/ArkJobDiscussionComposer.vue'
import { useJobDiscussion } from '../../../composables/useJobDiscussion'
import { formatBudget, formatDate } from '../../../utils/arkFormat'
import { useQuery } from '@tanstack/vue-query'
import { arkViewerScope } from '../../../utils/arkQueryScope'

definePageMeta({
  layout: 'app',
})

await useArkCapabilityGate('market.access')

const route = useRoute()
const { $arkApi } = useNuxtApp()
const auth = useArkAuth()
const jobId = computed(() => String(route.params.jobId))
const viewerScope = computed(() => arkViewerScope(false, auth.user.value?.id))

const jobQuery = useQuery({
  queryFn: () => $arkApi.query("market.jobs.byId", { id: jobId.value }),
  queryKey: computed(() => ['rest', 'ark', 'market', 'jobs', 'detail', jobId.value, viewerScope.value]),
})
await jobQuery.suspense()

const refresh = async () => {
  await jobQuery.refetch()
}
const job = computed(() => jobQuery.data.value ?? null)
const discussionChannelId = computed(() => job.value?.discussionChannelId ?? '')

const {
  discussionSaving,
  error: errorMessage,
  firstDiscussionMessage,
  sendFirstDiscussionMessage,
} = useJobDiscussion({
  job: () => job.value,
  onDiscussionStarted: () => refresh(),
  onMessageSent: () => refresh(),
})
</script>

<template>
  <div class="grid min-h-full content-start gap-4 bg-default p-3 text-default sm:p-4 lg:p-6">
    <UAlert v-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />

    <div class="mx-auto flex w-full max-w-6xl items-center">
      <UButton type="button" size="sm" color="neutral" variant="ghost" icon="i-lucide-arrow-left" to="/app/jobs">
        {{ $t('jobs.backToJobs') }}
      </UButton>
    </div>

    <div v-if="job" class="mx-auto grid w-full max-w-6xl items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
      <section class="min-w-0 rounded-lg border border-default bg-elevated p-4">
        <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{{ formatDate(job.updatedAt, { year: 'numeric' }) }}</span>
          <span class="rounded bg-muted px-2 py-1">{{ $t(`jobs.status.${job.status}`) }}</span>
          <span class="rounded bg-muted px-2 py-1">{{ formatBudget(job, $t('jobs.card.budgetNotSpecified')) }}</span>
          <span v-if="job.source" class="rounded bg-muted px-2 py-1">{{ job.source }}</span>
        </div>

        <h1 class="mt-3 text-2xl font-semibold leading-8 text-highlighted">
          {{ job.title }}
        </h1>
        <p v-if="job.summary" class="mt-3 text-sm leading-6 text-default">
          {{ job.summary }}
        </p>
        <p v-if="job.description" class="mt-4 whitespace-pre-line text-sm leading-7 text-toned">
          {{ job.description }}
        </p>

        <div class="mt-5 flex flex-wrap gap-2">
          <UButton v-if="job.sourceUrl" type="button" size="sm" color="neutral" variant="soft" icon="i-lucide-external-link" :to="job.sourceUrl" target="_blank">
            {{ $t('jobs.detail.openOriginal') }}
          </UButton>
        </div>
      </section>

      <aside class="flex h-[min(560px,70vh)] min-h-0 overflow-hidden rounded-lg border border-default bg-elevated">
        <ArkChannelView
          v-if="discussionChannelId"
          :channel-id="discussionChannelId"
          embedded
          :allow-thread-panel="false"
          :show-embedded-close="false"
        />
        <ArkJobDiscussionComposer
          v-else
          v-model="firstDiscussionMessage"
          :job-title="job.title"
          :heading="$t('jobs.detail.discussionHeading')"
          :empty-title="$t('jobs.detail.startChannel')"
          :empty-subtitle="$t('jobs.detail.startChannelSubtitle')"
          :loading="discussionSaving"
          @submit="sendFirstDiscussionMessage"
        />
      </aside>
    </div>
    <div v-else class="mx-auto w-full max-w-xl rounded-lg border border-dashed border-white/10 bg-elevated px-4 py-8 text-center">
      <h1 class="font-semibold text-highlighted">
        {{ $t('jobs.notFound.title') }}
      </h1>
      <p class="mt-1 text-sm text-muted">
        {{ $t('jobs.notFound.subtitle') }}
      </p>
      <UButton class="mt-4" type="button" color="neutral" variant="soft" to="/app/jobs">
        {{ $t('jobs.backToJobs') }}
      </UButton>
    </div>
  </div>
</template>

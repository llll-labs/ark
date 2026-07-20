<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { arkViewerScope } from '../../../../utils/arkQueryScope'

definePageMeta({
  layout: 'app',
})

const route = useRoute()
const { $arkApi } = useNuxtApp()
const auth = useArkAuth()
const spaceId = computed(() => String(route.params.spaceId))
const viewerScope = computed(() => arkViewerScope(false, auth.user.value?.id))

const spaceQuery = useQuery({
  queryFn: async () => {
    const [space, channels, pages, capabilities] = await Promise.all([
      $arkApi.query("spaces.byId", { id: spaceId.value }),
      $arkApi.query("channels.list", { spaceId: spaceId.value }),
      $arkApi.query("pages.list", { spaceId: spaceId.value }),
      $arkApi.query("spaces.effectiveCapabilities", { spaceId: spaceId.value }),
    ])
    return { capabilities, channels, pages, space }
  },
  queryKey: computed(() => ['rest', 'ark', 'spaces', 'detail', spaceId.value, viewerScope.value]),
})
await spaceQuery.suspense()
const data = computed(() => spaceQuery.data.value)
</script>

<template>
  <div class="grid min-h-full gap-5 p-4 lg:p-6">
    <header class="ark-surface rounded-lg px-4 py-4">
      <p class="text-sm font-medium text-primary">
        {{ data?.space?.kind }}
      </p>
      <h1 class="mt-1 text-2xl font-semibold text-highlighted">
        {{ data?.space?.name ?? $t('space.fallbackName') }}
      </h1>
      <p class="mt-2 text-sm text-toned">
        {{ data?.space?.description ?? $t('space.privateSpace') }}
      </p>
    </header>

    <div class="grid gap-4 md:grid-cols-3">
      <section class="ark-surface rounded-lg p-4">
        <h2 class="text-sm font-semibold text-highlighted">
          {{ $t('space.channels') }}
        </h2>
        <div class="mt-3 grid gap-2">
          <NuxtLink
            v-for="channel in data?.channels ?? []"
            :key="channel.id"
            :to="`/app/spaces/${spaceId}/channels/${channel.id}`"
            class="rounded bg-default px-3 py-2 text-sm text-default"
          >
            # {{ channel.name }}
          </NuxtLink>
        </div>
      </section>
      <section class="ark-surface rounded-lg p-4">
        <h2 class="text-sm font-semibold text-highlighted">
          {{ $t('space.pages') }}
        </h2>
        <div class="mt-3 grid gap-2">
          <div
            v-for="page in data?.pages ?? []"
            :key="page.id"
            class="rounded bg-default px-3 py-2 text-sm text-default"
          >
            {{ page.title }}
          </div>
        </div>
      </section>
      <section class="ark-surface rounded-lg p-4">
        <h2 class="text-sm font-semibold text-highlighted">
          {{ $t('space.capabilities') }}
        </h2>
        <div class="mt-3 flex flex-wrap gap-2">
          <UBadge
            v-for="capability in data?.capabilities.capabilities ?? []"
            :key="capability"
            color="neutral"
            variant="subtle"
          >
            {{ capability }}
          </UBadge>
        </div>
      </section>
    </div>
  </div>
</template>

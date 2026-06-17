<script setup lang="ts">
definePageMeta({
  layout: 'app',
})

await useArkCapabilityGate('knowledge.access')

const { t } = useI18n()
const pages = computed(() => [
  { slug: 'brief', title: t('knowledge.briefTitle'), summary: t('knowledge.briefSummary') },
  { slug: 'studio-notes', title: t('knowledge.studioNotesTitle'), summary: t('knowledge.studioNotesSummary') },
  { slug: 'delivery-checklist', title: t('knowledge.deliveryChecklistTitle'), summary: t('knowledge.deliveryChecklistSummary') },
])
</script>

<template>
  <div class="grid min-h-full gap-5 p-4 lg:p-6">
    <header class="ark-surface rounded-lg px-4 py-4">
      <p class="text-sm font-medium text-primary">
        {{ $t('knowledge.kicker') }}
      </p>
      <h1 class="mt-1 text-2xl font-semibold text-highlighted">
        {{ $t('knowledge.title') }}
      </h1>
    </header>
    <div class="mt-5 grid gap-3">
      <div v-for="page in pages" :key="page.slug" class="ark-surface rounded-lg p-4">
        <h2 class="font-medium text-highlighted">
          {{ page.title }}
        </h2>
        <p class="mt-1 text-sm leading-6 text-toned">
          {{ page.summary }}
        </p>
      </div>
    </div>
  </div>
</template>

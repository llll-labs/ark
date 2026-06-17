<script setup lang="ts">
definePageMeta({
  layout: 'app-settings',
})

await useArkCapabilityGate('settings.manage')

const route = useRoute()
const initialSection = computed(() => typeof route.query.section === 'string' ? route.query.section : 'overview')
</script>

<template>
  <div class="h-full min-h-0">
    <ArkSettingsWorkspace :initial-section="initialSection" show-back />
  </div>
</template>

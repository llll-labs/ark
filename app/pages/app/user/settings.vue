<script setup lang="ts">
import ArkUserSettingsPanel from '../../../components/core/ArkUserSettingsPanel.vue'

definePageMeta({
  layout: 'app-settings',
})

async function closeSettings() {
  await navigateTo('/app', { replace: true })
}
</script>

<template>
  <div class="h-full min-h-0 bg-default text-default">
    <ArkUserSettingsPanel @close="closeSettings" />
  </div>
</template>

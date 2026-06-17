<script setup lang="ts">
import ArkUserSettingsPanel from './ArkUserSettingsPanel.vue'

const open = defineModel<boolean>('open', { default: false })

const maximized = ref(false)
const { isNarrowWindow } = useArkResponsiveFullscreen()
const isFullscreen = computed(() => maximized.value || isNarrowWindow.value)
useArkEscapeDismiss(open)

const modalUi = computed(() => ({
  overlay: 'bg-black/60',
  content: isFullscreen.value
    ? 'bg-muted text-default ring-0 shadow-none'
    : 'h-[min(820px,calc(100vh-1rem))] w-[calc(100vw-1rem)] !max-w-[1240px] overflow-hidden bg-muted text-default ring ring-default shadow-none',
  header: 'hidden',
  body: 'h-full !p-0',
}))
</script>

<template>
  <UModal
    v-if="open"
    v-model:open="open"
    :fullscreen="isFullscreen"
    :title="$t('userSettings.title')"
    :content="{ onEscapeKeyDown: () => { open = false }, onInteractOutside: () => { open = false } }"
    :ui="modalUi"
  >
    <template #body>
      <ArkUserSettingsPanel
        :is-narrow-window="isNarrowWindow"
        :maximized="maximized"
        show-close
        show-maximize
        show-open-page
        @close="open = false"
        @toggle-maximized="maximized = !maximized"
      />
    </template>
  </UModal>
</template>

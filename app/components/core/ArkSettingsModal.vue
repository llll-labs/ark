<script setup lang="ts">
import ArkSettingsWorkspace from './ArkSettingsWorkspace.vue'

interface AppSettingsSection {
  icon: string
  id: string
  label: string
  slot?: string
}

withDefaults(defineProps<{
  appSections?: AppSettingsSection[]
  initialSection?: string
}>(), {
  appSections: () => [],
  initialSection: 'overview',
})
const open = defineModel<boolean>('open', { default: false })

const maximized = ref(false)
const { isNarrowWindow } = useArkResponsiveFullscreen()
const isFullscreen = computed(() => maximized.value || isNarrowWindow.value)
useArkEscapeDismiss(open)

function appSettingsSlotName(section: AppSettingsSection) {
  return section.slot ?? section.id
}

const modalUi = computed(() => ({
  overlay: 'bg-black/60',
  content: isFullscreen.value
    ? 'bg-muted text-default ring-0 shadow-none'
    : 'h-[min(800px,calc(100vh-2rem))] w-[min(1120px,calc(100vw-2rem))] !max-w-none overflow-hidden bg-muted text-default ring ring-default shadow-none',
  header: 'hidden',
  body: 'h-full !p-0',
}))
</script>

<template>
  <UModal
    v-if="open"
    v-model:open="open"
    :fullscreen="isFullscreen"
    :title="$t('settings.title')"
    :content="{ onEscapeKeyDown: () => { open = false }, onInteractOutside: () => { open = false } }"
    :ui="modalUi"
  >
    <template #body>
      <ArkSettingsWorkspace
        :app-sections="appSections"
        :initial-section="initialSection"
        :is-narrow-window="isNarrowWindow"
        :maximized="maximized"
        show-close
        show-maximize
        show-open-page
        @close="open = false"
        @toggle-maximized="maximized = !maximized"
        @keydown.esc.stop.prevent="open = false"
      >
        <template
          v-for="section in appSections"
          #[appSettingsSlotName(section)]="slotProps"
        >
          <slot :name="appSettingsSlotName(section)" v-bind="slotProps" />
        </template>
      </ArkSettingsWorkspace>
    </template>
  </UModal>
</template>

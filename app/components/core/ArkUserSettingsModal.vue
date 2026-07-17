<script setup lang="ts">
import ArkUserSettingsPanel from './ArkUserSettingsPanel.vue'

interface ArkUserSettingsSection {
  icon: string
  id: string
  label: string
}

const props = withDefaults(defineProps<{
  extraSections?: ArkUserSettingsSection[]
  hiddenSections?: string[]
}>(), {
  extraSections: () => [],
  hiddenSections: () => [],
})

const open = defineModel<boolean>('open', { default: false })
const slots = useSlots()
const forwardedSlotNames = computed(() => Object.keys(slots).filter(name => name.startsWith('section-')))

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
        :extra-sections="props.extraSections"
        :hidden-sections="props.hiddenSections"
        :is-narrow-window="isNarrowWindow"
        :maximized="maximized"
        show-close
        show-maximize
        show-open-page
        @close="open = false"
        @toggle-maximized="maximized = !maximized"
      >
        <template v-for="name in forwardedSlotNames" #[name]="slotProps">
          <slot :name="name" v-bind="slotProps || {}" />
        </template>
      </ArkUserSettingsPanel>
    </template>
  </UModal>
</template>

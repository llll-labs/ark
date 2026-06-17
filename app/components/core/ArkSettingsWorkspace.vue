<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import ArkSettingsChannelsSection from './ArkSettingsChannelsSection.vue'
import ArkSettingsContentSection from './ArkSettingsContentSection.vue'
import ArkSettingsMembersSection from './ArkSettingsMembersSection.vue'
import ArkSettingsOverviewSection from './ArkSettingsOverviewSection.vue'
import ArkSettingsPermissionsSection from './ArkSettingsPermissionsSection.vue'
import ArkSettingsRolesSection from './ArkSettingsRolesSection.vue'
import ArkSettingsSection from './ArkSettingsSection.vue'
import ArkSettingsSpacesSection from './ArkSettingsSpacesSection.vue'

interface AppSettingsSection {
  icon: string
  id: string
  label: string
  slot?: string
}

const props = withDefaults(defineProps<{
  appSections?: AppSettingsSection[]
  initialSection?: string
  isNarrowWindow?: boolean
  maximized?: boolean
  backTo?: string
  showClose?: boolean
  showBack?: boolean
  showMaximize?: boolean
  showOpenPage?: boolean
}>(), {
  appSections: () => [],
  backTo: '/app',
  initialSection: 'overview',
  isNarrowWindow: false,
  maximized: false,
  showBack: false,
  showClose: false,
  showMaximize: false,
  showOpenPage: false,
})

const emit = defineEmits<{
  close: []
  toggleMaximized: []
}>()

const activeSection = ref(props.initialSection)
const reloadSignal = ref(0)
const selectedSpaceId = ref('')
const settingsSidebarWidth = useLocalStorage('ark:settings-sidebar-width', 260)
const resizingSettingsSidebar = ref(false)
let cleanupSettingsResize: (() => void) | undefined

const { t } = useI18n()
const router = useRouter()

const minSettingsSidebarWidth = 220
const maxSettingsSidebarWidth = 520

function clampSettingsSidebarWidth(value: number) {
  return Math.min(maxSettingsSidebarWidth, Math.max(minSettingsSidebarWidth, value))
}

const settingsResizeWidth = computed(() => resizingSettingsSidebar.value ? 4 : 1)
const settingsWorkspaceStyle = computed(() => ({
  '--ark-settings-resize-width': `${settingsResizeWidth.value}px`,
  '--ark-settings-sidebar-width': `${settingsSidebarWidth.value}px`,
}))

const coreSections = computed(() => [
  { id: 'overview', label: t('settings.nav.overview'), icon: 'i-lucide-layout-dashboard' },
  { id: 'members', label: t('settings.nav.members'), icon: 'i-lucide-users' },
  { id: 'roles', label: t('settings.nav.roles'), icon: 'i-lucide-shield' },
  { id: 'permissions', label: t('settings.nav.permissions'), icon: 'i-lucide-key-round' },
  { id: 'spaces', label: t('settings.nav.spaces'), icon: 'i-lucide-panels-top-left' },
  { id: 'channels', label: t('settings.nav.channels'), icon: 'i-lucide-hash' },
  { id: 'content', label: t('settings.nav.content'), icon: 'i-lucide-database' },
])

const sections = computed(() => [
  ...coreSections.value,
  ...props.appSections,
])

const selectedSection = computed(() =>
  sections.value.find(section => section.id === activeSection.value) ?? sections.value[0],
)

const selectedAppSection = computed(() =>
  props.appSections.find(section => section.id === activeSection.value) ?? null,
)

const fullBleedSection = computed(() =>
  activeSection.value === 'content' || Boolean(selectedAppSection.value),
)

function selectSection(sectionId: string) {
  if (sections.value.some(section => section.id === sectionId))
    activeSection.value = sectionId
}

function appSettingsSlotName(section: AppSettingsSection) {
  return section.slot ?? section.id
}

function reload() {
  reloadSignal.value += 1
}

function goBack() {
  if (import.meta.client && window.history.length > 1) {
    router.back()
    return
  }
  void navigateTo(props.backTo)
}

function startSettingsSidebarResize(event: PointerEvent) {
  event.preventDefault()
  cleanupSettingsResize?.()

  const startX = event.clientX
  const startWidth = settingsSidebarWidth.value
  resizingSettingsSidebar.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  const handlePointerMove = (moveEvent: PointerEvent) => {
    settingsSidebarWidth.value = clampSettingsSidebarWidth(startWidth + moveEvent.clientX - startX)
  }

  const stopResize = () => {
    resizingSettingsSidebar.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', stopResize)
    window.removeEventListener('pointercancel', stopResize)
    cleanupSettingsResize = undefined
  }

  cleanupSettingsResize = stopResize
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', stopResize)
  window.addEventListener('pointercancel', stopResize)
}

watchEffect(() => {
  if (!sections.value.some(section => section.id === activeSection.value))
    activeSection.value = 'overview'
})

watch(() => props.initialSection, (sectionId) => {
  selectSection(sectionId)
})

onMounted(() => {
  settingsSidebarWidth.value = clampSettingsSidebarWidth(settingsSidebarWidth.value)
})

onBeforeUnmount(() => {
  cleanupSettingsResize?.()
})
</script>

<template>
  <div
    class="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] bg-default text-default min-[800px]:grid-cols-[var(--ark-settings-sidebar-width)_var(--ark-settings-resize-width)_minmax(0,1fr)] min-[800px]:grid-rows-1"
    :style="settingsWorkspaceStyle"
  >
    <aside class="min-h-0 border-b border-default bg-muted min-[800px]:border-b-0 min-[800px]:border-r">
      <div class="flex h-12 items-center gap-2 border-b border-default px-3">
        <UButton
          v-if="showBack"
          type="button"
          size="sm"
          color="neutral"
          variant="ghost"
          class="size-8 shrink-0 justify-center"
          icon="i-lucide-arrow-left"
          :aria-label="$t('common.back')"
          :title="$t('common.back')"
          @click="goBack"
        />
        <h2 class="min-w-0 flex-1 truncate text-sm font-semibold text-highlighted">
          {{ $t('settings.title') }}
        </h2>
      </div>

      <nav class="flex gap-1 overflow-x-auto p-2 min-[800px]:block min-[800px]:space-y-1">
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          class="flex shrink-0 items-center gap-2 rounded px-3 py-2 text-left text-sm transition min-[800px]:w-full"
          :class="activeSection === section.id ? 'bg-white/10 text-highlighted' : 'text-toned hover:bg-white/[0.06] hover:text-default'"
          @click="activeSection = section.id"
        >
          <UIcon :name="section.icon" class="size-4 shrink-0" />
          <span class="truncate">{{ section.label }}</span>
        </button>
      </nav>
    </aside>

    <div
      role="separator"
      aria-orientation="vertical"
      :aria-label="$t('shell.resizeMenu')"
      class="relative hidden cursor-col-resize bg-transparent after:absolute after:inset-y-0 after:-left-1.5 after:-right-1.5 min-[800px]:block"
      :class="{ 'bg-primary': resizingSettingsSidebar }"
      @pointerdown="startSettingsSidebarResize"
    />

    <section
      class="min-h-0"
      :class="fullBleedSection ? 'grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden' : 'overflow-y-auto'"
    >
      <header class="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-default bg-default pl-6 pr-3">
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-base font-semibold text-highlighted">
            {{ selectedSection?.label ?? $t('settings.title') }}
          </h3>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <UButton v-if="!fullBleedSection" type="button" size="sm" color="neutral" variant="ghost" class="size-9 justify-center" icon="i-lucide-refresh-cw" :aria-label="$t('settings.reload')" @click="reload" />
          <UButton v-if="showOpenPage" type="button" size="sm" color="neutral" variant="ghost" class="size-9 justify-center" icon="i-lucide-external-link" :aria-label="$t('settings.openPage')" :title="$t('settings.openPage')" to="/app/settings" @click="emit('close')" />
          <UButton
            v-if="showMaximize && !isNarrowWindow"
            type="button"
            size="sm"
            color="neutral"
            variant="ghost"
            class="size-9 justify-center"
            :icon="maximized ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
            :aria-label="maximized ? $t('settings.restoreWindow') : $t('settings.maximizeWindow')"
            @click="emit('toggleMaximized')"
          />
          <UButton v-if="showClose" type="button" size="sm" color="neutral" variant="ghost" class="size-9 justify-center" icon="i-lucide-x" :aria-label="$t('settings.closeSettings')" @click="emit('close')" />
        </div>
      </header>

      <div
        class="min-h-0"
        :class="fullBleedSection ? 'overflow-hidden' : 'max-w-5xl space-y-4 p-4 sm:p-6'"
      >
        <ArkSettingsOverviewSection
          v-if="activeSection === 'overview'"
          :reload-signal="reloadSignal"
        />
        <ArkSettingsMembersSection
          v-else-if="activeSection === 'members'"
          v-model:selected-space-id="selectedSpaceId"
          :reload-signal="reloadSignal"
        />
        <ArkSettingsRolesSection
          v-else-if="activeSection === 'roles'"
          v-model:selected-space-id="selectedSpaceId"
          :reload-signal="reloadSignal"
        />
        <ArkSettingsPermissionsSection
          v-else-if="activeSection === 'permissions'"
          v-model:selected-space-id="selectedSpaceId"
          :reload-signal="reloadSignal"
        />
        <ArkSettingsSpacesSection
          v-else-if="activeSection === 'spaces'"
          v-model:selected-space-id="selectedSpaceId"
          :reload-signal="reloadSignal"
        />
        <ArkSettingsChannelsSection
          v-else-if="activeSection === 'channels'"
          v-model:selected-space-id="selectedSpaceId"
          :reload-signal="reloadSignal"
        />
        <ArkSettingsContentSection v-else-if="activeSection === 'content'" />

        <section v-else-if="selectedAppSection" class="h-full min-h-0">
          <slot :name="appSettingsSlotName(selectedAppSection)" :section="selectedAppSection">
            <ArkSettingsSection :title="$t('settings.appSpecific.title')">
              <p class="text-sm leading-6 text-toned">
                {{ $t('settings.appSpecific.description') }}
              </p>
            </ArkSettingsSection>
          </slot>
        </section>
      </div>
    </section>
  </div>
</template>

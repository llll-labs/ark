<script setup lang="ts">
interface BubbleRole {
  id: string
  name: string
}

const props = withDefaults(defineProps<{
  appSrc?: string
  modelValue?: boolean
  portalIcon?: string
  portalTitle?: string
}>(), {
  appSrc: '/app',
  portalIcon: 'i-lucide-stone',
  portalTitle: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const localOpen = ref(false)
const fullscreen = ref(false)
const auth = useArkAuth()
const { t } = useI18n()
const { $arkApi } = useNuxtApp()
const checkedAuth = ref(false)
const roles = ref<BubbleRole[]>([])

const open = computed({
  get: () => props.modelValue ?? localOpen.value,
  set: (value) => {
    localOpen.value = value
    emit('update:modelValue', value)
  },
})

const portalTitle = computed(() => props.portalTitle || t('shell.portal'))
const viewerName = computed(() => auth.profile.value?.displayName || auth.me.value?.user?.name || t('shell.guest'))
const viewerInitials = computed(() => nameInitials(viewerName.value, 'M'))
const currentRoles = computed(() => {
  const roleIds = new Set(auth.memberships.value
    .map((membership: { roleId?: null | string }) => membership.roleId)
    .filter(Boolean))
  return roles.value.filter(role => roleIds.has(role.id)).slice(0, 3)
})
const viewerSubtitle = computed(() => currentRoles.value.map(role => role.name).join(', ') || t('shell.member'))
const openPortalLabel = computed(() => t('shell.openPortal', { title: portalTitle.value }))
const openPortalInAppLabel = computed(() => t('shell.openPortalInApp', { title: portalTitle.value }))
const fullscreenLabel = computed(() => fullscreen.value
  ? t('shell.restorePortal', { title: portalTitle.value })
  : t('shell.maximizePortal', { title: portalTitle.value }))
const closePortalLabel = computed(() => t('shell.closePortal', { title: portalTitle.value }))
const portalPanelClass = computed(() => fullscreen.value
  ? 'fixed inset-0'
  : 'fixed inset-0 sm:absolute sm:inset-auto sm:bottom-full sm:left-0 sm:mb-3 sm:h-[min(760px,calc(100dvh-9rem))] sm:w-[min(680px,calc(100vw-2rem))] sm:rounded-lg sm:border md:w-[min(760px,calc(100vw-2rem))] xl:w-[min(800px,calc(100vw-2rem))]')

function closePortal() {
  open.value = false
  fullscreen.value = false
}

onMounted(async () => {
  const me = await auth.ready().catch(() => null)
  if (me?.authenticated) {
    await Promise.all([
      auth.loadAccess().catch(() => null),
      auth.loadProfile().catch(() => null),
    ])
    roles.value = await $arkApi.query("roles.list", {}).catch(() => [])
  }
  checkedAuth.value = true
})
</script>

<template>
  <div v-if="checkedAuth && auth.authenticated.value" class="fixed bottom-3 left-3 z-50 w-[min(240px,calc(100vw-2rem))] sm:bottom-4 sm:left-4">
    <Transition name="fade">
      <section
        v-if="open"
        class="z-10 flex h-dvh w-screen flex-col overflow-hidden border-default bg-elevated shadow-2xl"
        :class="portalPanelClass"
      >
        <header class="flex h-12 shrink-0 items-center justify-between border-b border-default px-3 sm:h-11">
          <div class="flex min-w-0 items-center gap-2 text-sm font-semibold text-highlighted">
            <UIcon :name="props.portalIcon" class="size-4 text-primary" />
            <span class="truncate">{{ portalTitle }}</span>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <NuxtLink
              :to="props.appSrc"
              class="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-accented hover:text-default"
              :aria-label="openPortalInAppLabel"
              :title="openPortalInAppLabel"
            >
              <UIcon name="i-lucide-arrow-up-right" class="size-4" />
            </NuxtLink>
            <button
              type="button"
              class="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-accented hover:text-default"
              :aria-label="fullscreenLabel"
              :title="fullscreenLabel"
              @click="fullscreen = !fullscreen"
            >
              <UIcon :name="fullscreen ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'" class="size-4" />
            </button>
            <button
              type="button"
              class="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-accented hover:text-default"
              :aria-label="closePortalLabel"
              :title="closePortalLabel"
              @click="closePortal"
            >
              <UIcon name="i-lucide-x" class="size-4" />
            </button>
          </div>
        </header>
        <iframe
          class="min-h-0 flex-1 border-0 bg-default"
          :src="props.appSrc"
          :title="portalTitle"
          loading="lazy"
        />
      </section>
    </Transition>

    <ArkUserMenuButton
      class="shadow-lg"
      :name="viewerName"
      :subtitle="viewerSubtitle"
      :initials="viewerInitials"
      :aria-label="openPortalLabel"
      @click="open = !open"
    >
      <template #trailing>
        <UIcon :name="props.portalIcon" class="size-4 text-primary" />
      </template>
    </ArkUserMenuButton>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>

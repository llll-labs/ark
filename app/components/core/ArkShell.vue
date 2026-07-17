<script setup lang="ts">
import type { ArkCapabilityLike } from '../../../db/zod'
import type { ShellChannel, ShellRole, ShellSpace, ShellUser } from '../../composables/useArkShell'
import { useArkNavigation } from '../../composables/useArkNavigation'
import { useArkPanelResize } from '../../composables/useArkPanelResize'
import ArkAvatar from './ArkAvatar.vue'
import ArkCreateChannelModal from './ArkCreateChannelModal.vue'
import ArkCreateDmModal from './ArkCreateDmModal.vue'
import ArkCreateSpaceModal from './ArkCreateSpaceModal.vue'
import ArkSettingsModal from './ArkSettingsModal.vue'
import ArkUserMenuButton from './ArkUserMenuButton.vue'
import ArkUserSettingsModal from './ArkUserSettingsModal.vue'

interface AppSettingsSection {
  icon: string
  id: string
  label: string
  slot?: string
}

interface UserSettingsSection {
  icon: string
  id: string
  label: string
}

const props = withDefaults(defineProps<{
  appSettingsSections?: AppSettingsSection[]
  hiddenNavigationRoutes?: string[]
  logoTo?: string
  pageNavigationRoute?: string
  rootSpaceRoute?: string
  userSettingsExtraSections?: UserSettingsSection[]
  userSettingsHiddenSections?: string[]
}>(), {
  appSettingsSections: () => [],
  hiddenNavigationRoutes: () => [],
  logoTo: '',
  pageNavigationRoute: '/app',
  rootSpaceRoute: '/app/jobs',
  userSettingsExtraSections: () => [],
  userSettingsHiddenSections: () => [],
})

const route = useRoute()
const { t } = useI18n()
const appName = useRuntimeConfig().public.appName
const appSidebarVisible = ref(false)
const { gridTemplateColumns, resizingPanel, startResize } = useArkPanelResize(appSidebarVisible)

const mobileMenuOpen = ref(false)
const mobileSideOpen = ref(false)
const settingsOpen = ref(false)
const userSettingsOpen = ref(false)
const createChannelOpen = ref(false)
const createDmOpen = ref(false)
const createSpaceOpen = ref(false)
const sideTab = ref<'members' | 'roles' | 'agent'>('members')
const agentPrompt = ref('')
const initialSettingsSection = computed(() => props.appSettingsSections[0]?.id ?? 'overview')

function appSettingsSlotName(section: AppSettingsSection) {
  return section.slot ?? section.id
}

const {
  allChannels,
  channelParticipants,
  channels,
  me,
  members,
  pages,
  refresh,
  roles,
  rootSpace,
  selectedSpace,
  spaces,
  users,
} = useArkShell()

const capabilities = computed(() => (me.value?.capabilities ?? []) as ArkCapabilityLike[])
const appConfig = useArkAppConfig()
const channelsModuleEnabled = computed(() => appConfig.value.modules.includes('channels'))
const spacesModuleEnabled = computed(() => appConfig.value.modules.includes('spaces'))
const baseNavigation = useArkNavigation(capabilities)
const hiddenNavigationRouteSet = computed(() => new Set(props.hiddenNavigationRoutes))
const navigation = computed(() => {
  return baseNavigation.value.filter(item => !hiddenNavigationRouteSet.value.has(item.to))
})
const hasCapability = (capability: ArkCapabilityLike) => capabilities.value.includes(capability)
const hasAppSidebar = computed(() => channelsModuleEnabled.value && hasCapability('app.sidebar.access'))
const publicChannels = computed(() => channels.value.filter(channel => !['dm', 'forum', 'job_discussion', 'thread'].includes(channel.kind)))
const directChannels = computed(() => allChannels.value.filter(channel => channel.kind === 'dm'))
const appPageNavigationItems = computed(() => {
  return pages.value.flatMap((page) => {
    if (page.kind !== 'component' && page.kind !== 'view')
      return []

    const pageKey = page.targetType || page.slug || page.id

    return [{
      icon: page.icon || 'i-lucide-file-text',
      id: page.id,
      pageKey,
      title: page.title,
      to: {
        path: props.pageNavigationRoute,
        query: { page: pageKey },
      },
    }]
  })
})
const activeAppPageKey = computed(() => {
  const value = route.query.page
  return Array.isArray(value) ? value[0] : value
})
const navigablePages = computed(() => appPageNavigationItems.value.map((page, index) => ({
  ...page,
  active: route.path === props.pageNavigationRoute && (activeAppPageKey.value ? activeAppPageKey.value === page.pageKey : index === 0),
})))
const showPageNavigation = computed(() =>
  hasCapability('pages.read')
  && !hiddenNavigationRouteSet.value.has(props.pageNavigationRoute)
  && navigablePages.value.length > 0,
)
const switchableSpaces = computed(() => spaces.value.filter(space =>
  space.id !== rootSpace.value?.id
  && space.kind !== 'system'
  && space.kind !== 'admin'
  && !['direct-messages', 'dms', 'system'].includes(space.slug),
))
const showSpaceSwitcher = computed(() => spacesModuleEnabled.value && switchableSpaces.value.length > 1)
const switcherSpaces = computed(() => showSpaceSwitcher.value ? [rootSpace.value, ...switchableSpaces.value].filter(Boolean) as ShellSpace[] : [])
const currentChannelId = computed(() => typeof route.params.channelId === 'string' ? route.params.channelId : null)
const sidePeople = computed(() => {
  if (currentChannelId.value) {
    return channelParticipants.value.map(participant => ({
      arkUserId: participant.arkUserId,
      id: participant.id,
      messagesCount: participant.messagesCount ?? 0,
      status: participant.status,
      user: participant.user,
    }))
  }

  return members.value.map(member => ({
    arkUserId: member.arkUserId,
    id: member.id,
    messagesCount: null,
    status: member.status,
    user: users.value.find(user => user.id === member.arkUserId) ?? null,
  }))
})
const sidePeopleEmptyLabel = computed(() => currentChannelId.value ? t('shell.noChannelParticipants') : t('shell.noVisibleMembers'))
const currentName = computed(() => me.value?.arkUser?.displayName || me.value?.user?.name || t('shell.guest'))
const initials = computed(() => nameInitials(currentName.value, 'M'))
const currentRoles = computed(() => {
  const roleIds = new Set((me.value?.memberships ?? [])
    .map((membership: { roleId?: null | string }) => membership.roleId)
    .filter(Boolean))
  return roles.value.filter((role: ShellRole) => roleIds.has(role.id)).slice(0, 3)
})
const currentRoleLabel = computed(() => currentRoles.value.map(role => role.name).join(', ') || (me.value?.authenticated ? t('shell.member') : t('shell.guest')))
const currentPermissions = ['spaces.read', 'channels.read', 'messages.read', 'pages.read', 'market.jobs.read']
const shellStyle = computed(() => ({
  gridTemplateColumns: gridTemplateColumns.value,
}))

function personName(person: { arkUserId: string, user: ShellUser | null }) {
  return person.user?.displayName || person.user?.handle || t('shell.member')
}

function personAvatarUrl(person: { user: ShellUser | null }) {
  return arkAvatarFileUrl(person.user?.avatarFileId)
}

function personInitials(person: { arkUserId: string, user: ShellUser | null }) {
  return nameInitials(personName(person), 'M')
}

function personSubtitle(person: { messagesCount: null | number, status: string }) {
  if (typeof person.messagesCount === 'number')
    return `${person.status}${person.messagesCount ? ` · ${t('shell.messageCount', { n: person.messagesCount })}` : ''}`
  return person.status
}

watch(capabilities, () => {
  appSidebarVisible.value = hasAppSidebar.value
  if (!hasAppSidebar.value)
    mobileSideOpen.value = false
  if (sideTab.value === 'agent' && !hasCapability('agent.access'))
    sideTab.value = 'members'
}, { immediate: true })

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}

function isRootSpace(space: ShellSpace) {
  return space.id === rootSpace.value?.id
}

function spaceHref(space: ShellSpace) {
  if (isRootSpace(space))
    return props.rootSpaceRoute
  if (route.path.includes('/app/channels/'))
    return `/app/spaces/${space.id}/channels`
  if (route.path.includes('/app/jobs'))
    return `/app/spaces/${space.id}/jobs`
  if (route.path.includes('/app/forum'))
    return `/app/spaces/${space.id}`
  return `/app/spaces/${space.id}`
}

function channelHref(channel: ShellChannel) {
  const space = spaces.value.find(item => item.id === channel.spaceId) ?? selectedSpace.value
  if (!space || isRootSpace(space))
    return `/app/channels/${channel.id}`
  return `/app/spaces/${space.id}/channels/${channel.id}`
}

const createSpaceParentId = computed(() => (selectedSpace.value ?? rootSpace.value)?.id ?? null)

async function onChannelCreated() {
  await refresh()
}

async function onDmCreated(channel: { id: string, spaceId: string }) {
  await refresh()
  await navigateTo(channelHref(channel as ShellChannel))
}

async function onSpaceCreated(space: { id: string }) {
  await refresh()
  await navigateTo(`/app/spaces/${space.id}`)
}

watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false
    mobileSideOpen.value = false
  },
)
</script>

<template>
  <main class="relative flex h-dvh min-h-0 overflow-hidden bg-default text-default lg:grid" :style="shellStyle">
    <aside
      class="ark-scrollbar flex min-h-0 w-[min(86vw,320px)] shrink-0 flex-col border-r border-default bg-elevated lg:w-auto"
      :class="mobileMenuOpen ? 'fixed inset-y-0 left-0 z-50' : 'hidden lg:flex'"
    >
      <header class="flex h-12 shrink-0 items-center px-4">
        <NuxtLink
          v-if="props.logoTo"
          :to="props.logoTo"
          class="flex min-w-0 items-center text-highlighted"
          :aria-label="appName"
        >
          <slot name="logo">
            <ArkLogo size="sm" />
          </slot>
        </NuxtLink>
        <slot v-else name="logo">
          <ArkLogo size="sm" />
        </slot>
        <div class="flex-1" />
        <button
          v-if="hasCapability('settings.manage')"
          type="button"
          class="grid size-8 place-items-center rounded text-toned transition hover:bg-white/[0.06] hover:text-highlighted"
          :aria-label="$t('shell.openSettings')"
          @click="settingsOpen = true"
        >
          <UIcon name="i-lucide-settings" class="size-4" />
        </button>
      </header>

      <section class="ark-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div class="space-y-1">
          <NuxtLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            class="group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[15px] transition hover:bg-white/[0.06] hover:text-default"
            :class="isActive(item.to) ? 'bg-white/10 text-highlighted' : 'text-muted'"
          >
            <UIcon :name="item.icon" class="size-4 shrink-0 opacity-80" />
            <span class="min-w-0 flex-1 truncate font-medium">{{ $t(item.label) }}</span>
          </NuxtLink>
        </div>

        <div v-if="showPageNavigation" class="ark-shell-pages mt-3">
          <div class="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {{ $t('shell.pages') }}
          </div>
          <div class="space-y-1">
            <NuxtLink
              v-for="page in navigablePages"
              :key="page.id"
              :to="page.to"
              class="group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[15px] transition hover:bg-white/[0.06] hover:text-default"
              :class="page.active ? 'bg-white/10 text-highlighted' : 'text-muted'"
            >
              <UIcon :name="page.icon" class="size-4 shrink-0 opacity-80" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ page.title }}</span>
            </NuxtLink>
          </div>
        </div>

        <div v-if="channelsModuleEnabled" class="ark-shell-channels mt-3">
          <div class="mb-1 flex items-center justify-between gap-2 px-2">
            <div class="text-xs font-semibold uppercase tracking-wide text-muted">
              {{ $t('shell.channels') }}
            </div>
            <UButton v-if="hasCapability('channels.create')" type="button" size="xs" color="neutral" variant="ghost" icon="i-lucide-plus" :aria-label="$t('shell.createChannel')" @click="createChannelOpen = true" />
          </div>
          <div class="space-y-1">
            <div v-if="!publicChannels.length" class="px-2 py-2 text-sm text-muted">
              {{ $t('shell.noPublicChannels') }}
            </div>
            <NuxtLink
              v-for="channel in publicChannels"
              :key="channel.id"
              :to="channelHref(channel)"
              class="group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[15px] transition"
              :class="route.path.endsWith(channel.id) ? 'bg-white/10 text-highlighted' : 'text-muted hover:bg-white/[0.06] hover:text-default'"
            >
              <UIcon :name="channel.kind === 'announcement' ? 'i-lucide-megaphone' : 'i-lucide-hash'" class="size-4 shrink-0 opacity-80" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ channel.name }}</span>
              <span v-if="channel.messagesCount" class="rounded-full bg-muted px-1.5 text-[11px] font-semibold leading-4 text-toned">{{ channel.messagesCount }}</span>
            </NuxtLink>
          </div>
        </div>

        <div v-if="channelsModuleEnabled && hasCapability('dm.access')" class="ark-shell-direct-messages mt-3">
          <div class="mb-1 flex items-center justify-between gap-2 px-2">
            <div class="text-xs font-semibold uppercase tracking-wide text-muted">
              {{ $t('shell.directMessages') }}
            </div>
            <UButton type="button" size="xs" color="neutral" variant="ghost" icon="i-lucide-plus" :aria-label="$t('shell.startDirectMessage')" @click="createDmOpen = true" />
          </div>
          <div class="space-y-1">
            <div v-if="!directChannels.length" class="px-2 py-2 text-sm text-muted">
              {{ $t('shell.noDirectMessages') }}
            </div>
            <NuxtLink
              v-for="channel in directChannels"
              :key="channel.id"
              :to="channelHref(channel)"
              class="group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[15px] transition"
              :class="route.path.endsWith(channel.id) ? 'bg-white/10 text-highlighted' : 'text-muted hover:bg-white/[0.06] hover:text-default'"
            >
              <UIcon name="i-lucide-at-sign" class="size-4 shrink-0 opacity-80" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ channel.name }}</span>
            </NuxtLink>
          </div>
        </div>
      </section>

      <footer class="shrink-0 bg-elevated px-3 pb-4 pt-2">
        <div v-if="showSpaceSwitcher" class="mb-2 space-y-1 rounded-lg bg-muted p-1">
          <NuxtLink
            v-for="space in switcherSpaces"
            :key="space.id"
            :to="spaceHref(space)"
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold transition"
            :class="space.id === selectedSpace?.id ? 'bg-accented text-highlighted' : 'text-muted hover:text-default'"
          >
            <UIcon :name="isRootSpace(space) ? 'i-lucide-store' : 'i-lucide-panels-top-left'" class="size-4 shrink-0" />
            <span class="min-w-0 flex-1 truncate">{{ space.name }}</span>
          </NuxtLink>
          <button type="button" class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold text-muted transition hover:text-default" @click="createSpaceOpen = true">
            <UIcon name="i-lucide-plus" class="size-4 shrink-0" />
            <span>{{ $t('shell.createSpace') }}</span>
          </button>
        </div>
        <ArkUserMenuButton
          :name="currentName"
          :subtitle="currentRoleLabel"
          :initials="initials"
          :avatar-src="arkAvatarFileUrl(me?.arkUser?.avatarFileId)"
          trailing-icon="i-lucide-settings"
          :aria-label="$t('shell.openSettings')"
          @click="userSettingsOpen = true"
        />
      </footer>
    </aside>

    <div
      role="separator"
      aria-orientation="vertical"
      :aria-label="$t('shell.resizeMenu')"
      class="relative hidden cursor-col-resize bg-transparent after:absolute after:inset-y-0 after:-left-1.5 after:-right-1.5 lg:block"
      :class="{ 'bg-primary': resizingPanel === 'menu' }"
      @pointerdown="startResize('menu', $event)"
    />

    <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <header class="flex h-12 shrink-0 items-center gap-2 border-b border-default bg-default px-3 lg:hidden">
        <UButton type="button" size="sm" color="neutral" variant="ghost" icon="i-lucide-menu" :aria-label="$t('shell.openMenu')" @click="mobileMenuOpen = true" />
        <div class="min-w-0 flex-1 truncate text-sm font-semibold text-highlighted">
          {{ selectedSpace?.name ?? appName }}
        </div>
        <UButton v-if="hasAppSidebar" type="button" size="sm" color="neutral" variant="ghost" icon="i-lucide-users" :aria-label="$t('shell.openSidePanel')" @click="mobileSideOpen = true" />
      </header>
      <section class="ark-scrollbar min-h-0 flex-1 overflow-y-auto">
        <slot />
      </section>
    </div>

    <div
      v-if="hasAppSidebar"
      role="separator"
      aria-orientation="vertical"
      :aria-label="$t('shell.resizeSidePanel')"
      class="relative hidden cursor-col-resize bg-transparent after:absolute after:inset-y-0 after:-left-1.5 after:-right-1.5 lg:block"
      :class="{ 'bg-primary': resizingPanel === 'side' }"
      @pointerdown="startResize('side', $event)"
    />

    <aside
      v-if="hasAppSidebar"
      class="ark-scrollbar flex min-h-0 min-w-0 flex-col border-l border-default bg-elevated"
      :class="mobileSideOpen ? 'fixed inset-y-0 right-0 z-50 w-[min(92vw,420px)]' : 'hidden lg:flex'"
    >
      <header class="flex h-12 shrink-0 items-center border-b border-default px-3">
        <div class="grid h-8 w-full rounded-lg bg-muted p-1" :class="hasCapability('agent.access') ? 'grid-cols-3' : 'grid-cols-2'">
          <button type="button" class="h-full rounded-md px-2 text-xs font-semibold transition" :class="sideTab === 'members' ? 'bg-accented text-highlighted' : 'text-muted hover:text-default'" @click="sideTab = 'members'">
            {{ $t('shell.members') }}
          </button>
          <button type="button" class="h-full rounded-md px-2 text-xs font-semibold transition" :class="sideTab === 'roles' ? 'bg-accented text-highlighted' : 'text-muted hover:text-default'" @click="sideTab = 'roles'">
            {{ $t('shell.roles') }}
          </button>
          <button v-if="hasCapability('agent.access')" type="button" class="h-full rounded-md px-2 text-xs font-semibold transition" :class="sideTab === 'agent' ? 'bg-accented text-highlighted' : 'text-muted hover:text-default'" @click="sideTab = 'agent'">
            {{ $t('shell.agent') }}
          </button>
        </div>
      </header>

      <section v-if="sideTab === 'members'" class="ark-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <div v-for="person in sidePeople" :key="person.id" class="flex items-start gap-2 rounded px-2 py-1.5 text-default">
          <ArkAvatar
            :src="personAvatarUrl(person)"
            :name="personName(person)"
            :initials="personInitials(person)"
            size="sm"
          />
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium">
              {{ personName(person) }}
            </div>
            <div class="mt-1 text-[11px] text-muted">
              {{ personSubtitle(person) }}
            </div>
          </div>
        </div>
        <div v-if="!sidePeople.length" class="px-2 py-2 text-sm text-muted">
          {{ sidePeopleEmptyLabel }}
        </div>
      </section>

      <section v-else-if="sideTab === 'roles'" class="ark-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div class="mb-4 flex items-center gap-2">
          <ArkAvatar :name="currentName" :initials="initials" size="md" />
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-highlighted">
              {{ currentName }}
            </div>
            <div class="truncate text-xs text-muted">
              {{ currentRoleLabel }}
            </div>
          </div>
        </div>
        <div class="mb-4">
          <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {{ $t('shell.roles') }}
          </div>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="role in roles" :key="role.id" class="max-w-full truncate rounded bg-accented px-2 py-1 text-xs font-semibold text-highlighted">{{ role.name }}</span>
          </div>
        </div>
        <div>
          <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {{ $t('shell.coreCapabilities') }}
          </div>
          <div class="space-y-1">
            <div v-for="permission in currentPermissions" :key="permission" class="rounded bg-muted px-2 py-1.5 font-mono text-xs text-default">
              {{ permission }}
            </div>
          </div>
        </div>
      </section>

      <section v-else class="flex min-h-0 flex-1 flex-col">
        <div class="flex h-12 shrink-0 items-center gap-2 border-b border-default px-3">
          <ArkAvatar initials="A" size="sm" />
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-semibold text-highlighted">
              {{ $t('shell.agent') }}
            </div>
            <div class="truncate text-xs text-muted">
              {{ $t('shell.agentSubtitle') }}
            </div>
          </div>
        </div>
        <div class="ark-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <div class="space-y-4">
            <div class="flex gap-2">
              <ArkAvatar initials="A" size="sm" />
              <p class="text-sm leading-5 text-toned">
                {{ $t('shell.agentUnavailable') }}
              </p>
            </div>
          </div>
        </div>
        <form class="px-3 pb-5" @submit.prevent>
          <div class="flex h-12 items-center gap-2 rounded-lg bg-accented px-3">
            <UIcon name="i-lucide-sparkles" class="size-5 shrink-0 text-toned" />
            <input v-model="agentPrompt" class="min-w-0 flex-1 bg-transparent text-[15px] text-default outline-none placeholder:text-muted" :placeholder="$t('shell.messageAgent')" disabled>
            <UButton type="submit" size="sm" color="neutral" variant="ghost" icon="i-lucide-send" disabled :aria-label="$t('shell.sendAgentMessage')" />
          </div>
        </form>
      </section>
    </aside>

    <Transition enter-active-class="transition-opacity duration-150" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition-opacity duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <button v-if="mobileMenuOpen || mobileSideOpen" type="button" class="fixed inset-0 z-40 bg-black/60 lg:hidden" :aria-label="$t('shell.closeDrawer')" @click="mobileMenuOpen ? mobileMenuOpen = false : mobileSideOpen = false" />
    </Transition>

    <ArkSettingsModal v-model:open="settingsOpen" :app-sections="appSettingsSections" :initial-section="initialSettingsSection">
      <template
        v-for="section in appSettingsSections"
        #[appSettingsSlotName(section)]
      >
        <slot :name="`settings-${appSettingsSlotName(section)}`" />
      </template>
    </ArkSettingsModal>
    <ArkUserSettingsModal
      v-model:open="userSettingsOpen"
      :extra-sections="props.userSettingsExtraSections"
      :hidden-sections="props.userSettingsHiddenSections"
    >
      <template v-for="section in props.userSettingsExtraSections" #[`section-${section.id}`]="slotProps">
        <slot :name="`user-settings-${section.id}`" v-bind="slotProps || {}" />
      </template>
    </ArkUserSettingsModal>

    <ArkCreateChannelModal
      v-model:open="createChannelOpen"
      :space-id="selectedSpace?.id ?? null"
      @created="onChannelCreated"
    />
    <ArkCreateDmModal
      v-model:open="createDmOpen"
      :users="users"
      @created="onDmCreated"
    />
    <ArkCreateSpaceModal
      v-model:open="createSpaceOpen"
      :parent-space-id="createSpaceParentId"
      @created="onSpaceCreated"
    />
  </main>
</template>

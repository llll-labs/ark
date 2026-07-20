import type { QueryClient } from '@tanstack/vue-query'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { arkViewerScope } from '../utils/arkQueryScope'

/**
 * Owns the mutable data behind `ArkShell` in the same Vue Query cache used by
 * Ark mutations and realtime invalidation. Queries remain split by scope so
 * navigation only refetches what actually changed:
 *
 * - base   (no route watch): identity + workspace-wide data — spaces, every
 *   space's channels (for DM discovery), roles, users. Fetched once per load.
 * - space  (watch selectedSpaceId): pages + members for the active space.
 * - channel(watch routeChannelId): participants for the open channel.
 *
 * Previously a single aggregate re-ran ALL of this — including the per-space
 * channel fan-out — on every `route.fullPath` change. Now switching channels
 * only refetches participants, and switching spaces only refetches pages/members.
 *
 * `ready()` provides the SSR seam: ArkShell awaits active queries, after which
 * the Nuxt Vue Query plugin dehydrates them into the page payload.
 */

export interface ShellChannel {
  id: string
  kind: string
  messagesCount: number
  name: string
  slug: string
  spaceId: string
  visibility: string
}

export interface ShellSpace {
  id: string
  kind: string
  name: string
  parentSpaceId: null | string
  slug: string
  visibility: string
}

export interface ShellUser {
  avatarFileId?: null | string
  displayName: string
  handle?: null | string
  id: string
  kind?: string
}

export interface ShellMember {
  arkUserId: string
  id: string
  status: string
}

export interface ShellParticipant {
  arkUserId: string
  id: string
  lastMessageAt?: Date | string
  messagesCount?: number
  status: string
  user: ShellUser | null
}

export interface ShellRole {
  id: string
  key: string
  name: string
  rank?: number
}

export interface ShellPage {
  icon?: null | string
  id: string
  kind: string
  slug: string
  targetType?: null | string
  title: string
}

export const arkShellQueryKeys = {
  all: ['rest', 'ark', 'shell'] as const,
  base: (viewerScope: string) => [...arkShellQueryKeys.all, 'base', viewerScope] as const,
  participants: (channelId: string, viewerScope: string) => [...arkShellQueryKeys.all, 'participants', channelId, viewerScope] as const,
  space: (spaceId: string, viewerScope: string) => [...arkShellQueryKeys.all, 'space', spaceId, viewerScope] as const,
}

export function invalidateArkShell(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: arkShellQueryKeys.all })
}

export function useArkShell() {
  const { $arkApi } = useNuxtApp()
  const queryClient = useQueryClient()
  const route = useRoute()
  const auth = useArkAuth()
  const viewerScope = computed(() => arkViewerScope(false, auth.user.value?.id))

  const baseQuery = useQuery({
    enabled: computed(() => auth.authenticated.value),
    queryFn: async () => {
      const spaces = await $arkApi.query("spaces.list", {}) as ShellSpace[]
      const channelsBySpace = await Promise.all(
        spaces.map(space => $arkApi.query("channels.list", { spaceId: space.id }) as Promise<ShellChannel[]>),
      )
      const [roles, users] = await Promise.all([
        $arkApi.query("roles.list", {}) as Promise<ShellRole[]>,
        $arkApi.query("users.list", {}) as Promise<ShellUser[]>,
      ])
      return { allChannels: channelsBySpace.flat(), roles, spaces, users }
    },
    queryKey: computed(() => arkShellQueryKeys.base(viewerScope.value)),
  })

  const me = computed(() => auth.me.value)
  const access = computed(() => auth.access.value)
  const profile = computed(() => auth.profile.value)
  const spaces = computed(() => baseQuery.data.value?.spaces ?? [])
  const allChannels = computed(() => baseQuery.data.value?.allChannels ?? [])
  const roles = computed(() => baseQuery.data.value?.roles ?? [])
  const users = computed(() => baseQuery.data.value?.users ?? [])

  const rootSpace = computed<ShellSpace | null>(() =>
    spaces.value.find(space => !space.parentSpaceId) ?? spaces.value[0] ?? null)
  const selectedSpace = computed<ShellSpace | null>(() => {
    const routeSpaceId = typeof route.params.spaceId === 'string' ? route.params.spaceId : null
    return spaces.value.find(space => space.id === routeSpaceId) ?? rootSpace.value
  })
  const selectedSpaceId = computed(() => selectedSpace.value?.id ?? '')
  const channels = computed(() => allChannels.value.filter(channel => channel.spaceId === selectedSpaceId.value))

  const spaceQuery = useQuery({
    enabled: computed(() => Boolean(selectedSpaceId.value)),
    queryFn: async () => {
      const id = selectedSpaceId.value
      const [pages, members] = await Promise.all([
        $arkApi.query("pages.list", { spaceId: id }) as Promise<ShellPage[]>,
        $arkApi.query("members.list", { spaceId: id }) as Promise<ShellMember[]>,
      ])
      return { members, pages }
    },
    queryKey: computed(() => arkShellQueryKeys.space(selectedSpaceId.value, viewerScope.value)),
  })

  const routeChannelId = computed(() => typeof route.params.channelId === 'string' ? route.params.channelId : '')
  const participantsQuery = useQuery({
    enabled: computed(() => Boolean(routeChannelId.value)),
    queryFn: () => $arkApi.query("channels.participants", { id: routeChannelId.value }) as Promise<ShellParticipant[]>,
    queryKey: computed(() => arkShellQueryKeys.participants(routeChannelId.value, viewerScope.value)),
  })

  const pages = computed(() => spaceQuery.data.value?.pages ?? [])
  const members = computed(() => spaceQuery.data.value?.members ?? [])
  const channelParticipants = computed(() => participantsQuery.data.value ?? [])

  async function ready() {
    await Promise.all([auth.loadAccess(), auth.loadProfile()])
    if (!auth.authenticated.value)
      return
    await baseQuery.suspense()
    await Promise.all([
      selectedSpaceId.value ? spaceQuery.suspense() : Promise.resolve(),
      routeChannelId.value ? participantsQuery.suspense() : Promise.resolve(),
    ])
  }

  function refresh() {
    return invalidateArkShell(queryClient)
  }

  return {
    access,
    allChannels,
    channelParticipants,
    channels,
    me,
    members,
    pages,
    profile,
    ready,
    refresh,
    roles,
    rootSpace,
    selectedSpace,
    spaces,
    users,
  }
}

/**
 * Owns the data behind `ArkShell`. Split into three scoped `useAsyncData`
 * fetches so navigation only refetches what actually changed:
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
 * IMPORTANT: all three `useAsyncData` calls are registered synchronously (before
 * any `await`) so the Nuxt instance context is available to each during SSR;
 * awaiting between them would lose it. The space query awaits the base query
 * internally to keep its dependency on the resolved space list.
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

export function useArkShell() {
  const { $arkApi } = useNuxtApp()
  const route = useRoute()
  const auth = useArkAuth()

  // Access is intentionally lazy at the auth layer. The full Ark shell is an
  // explicit consumer, so it opts in once and shares the result through Pinia.
  const accessQuery = useAsyncData('ark-shell-access', () => auth.loadAccess())
  const profileQuery = useAsyncData('ark-shell-profile', () => auth.loadProfile())

  // Base — identity + workspace-wide data. Not watched on navigation.
  const baseQuery = useAsyncData('ark-shell-base', async () => {
    const spaces = await $arkApi.query("spaces.list", {}).catch(() => []) as ShellSpace[]
    const channelsBySpace = await Promise.all(
      spaces.map(space => $arkApi.query("channels.list", { spaceId: space.id }).catch(() => []) as Promise<ShellChannel[]>),
    )
    const [roles, users] = await Promise.all([
      $arkApi.query("roles.list", {}).catch(() => [] as ShellRole[]),
      $arkApi.query("users.list", {}).catch(() => [] as ShellUser[]),
    ]) as [ShellRole[], ShellUser[]]
    return { allChannels: channelsBySpace.flat(), roles, spaces, users }
  })

  const me = computed(() => auth.me.value)
  const access = computed(() => accessQuery.data.value ?? auth.access.value)
  const profile = computed(() => profileQuery.data.value?.arkUser ?? auth.profile.value)
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
  // Channels for the active space are derived from the base fetch — no extra request.
  const channels = computed(() => allChannels.value.filter(channel => channel.spaceId === selectedSpaceId.value))

  // Space-scoped — pages + members for the active space. Awaits base so the
  // selected space id is resolved before fetching.
  const spaceQuery = useAsyncData(
    'ark-shell-space',
    async () => {
      await baseQuery
      const id = selectedSpaceId.value
      if (!id)
        return { members: [] as ShellMember[], pages: [] as ShellPage[] }
      const [pages, members] = await Promise.all([
        $arkApi.query("pages.list", { spaceId: id }).catch(() => [] as ShellPage[]),
        $arkApi.query("members.list", { spaceId: id }).catch(() => [] as ShellMember[]),
      ])
      return { members: members as ShellMember[], pages: pages as ShellPage[] }
    },
    { watch: [selectedSpaceId] },
  )

  // Channel-scoped — participants for the open channel.
  const routeChannelId = computed(() => typeof route.params.channelId === 'string' ? route.params.channelId : null)
  const participantsQuery = useAsyncData(
    'ark-shell-participants',
    async () => {
      const id = routeChannelId.value
      if (!id)
        return [] as ShellParticipant[]
      return await $arkApi.query("channels.participants", { id }).catch(() => []) as ShellParticipant[]
    },
    { watch: [routeChannelId] },
  )

  const pages = computed(() => spaceQuery.data.value?.pages ?? [])
  const members = computed(() => spaceQuery.data.value?.members ?? [])
  const channelParticipants = computed(() => participantsQuery.data.value ?? [])

  async function refresh() {
    await Promise.all([baseQuery.refresh(), spaceQuery.refresh(), participantsQuery.refresh()])
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
    refresh,
    roles,
    rootSpace,
    selectedSpace,
    spaces,
    users,
  }
}

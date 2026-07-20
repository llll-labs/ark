import type { QueryClient } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import type { ArkMutationInput } from '../plugins/ark-api'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue } from 'vue'
import { arkViewerScope } from '../utils/arkQueryScope'
import { invalidateArkShell } from './useArkShell'
import type { ArkViewerScope } from '../utils/arkQueryScope'

export interface ArkMessageCursor {
  createdAt: string
  id: string
}

export type ArkMessageAnchor
  = | { mode: 'around', messageId: string }
    | { mode: 'latest' }

export type ArkMessagePageParam
  = | { mode: 'after', cursor: ArkMessageCursor }
    | { mode: 'around', messageId: string }
    | { mode: 'before', cursor: ArkMessageCursor }
    | { mode: 'latest' }

export const arkChannelQueryKeys = {
  all: ['rest', 'ark', 'channels'] as const,
  detailPrefix: (channelId: string) => [...arkChannelQueryKeys.all, 'detail', channelId] as const,
  detail: (channelId: string, viewerScope: ArkViewerScope) => [...arkChannelQueryKeys.detailPrefix(channelId), viewerScope] as const,
  list: (spaceId: string) => [...arkChannelQueryKeys.all, 'list', spaceId] as const,
  messages: (channelId: string) => [...arkChannelQueryKeys.all, 'messages', channelId] as const,
  messageWindow: (channelId: string, anchor: ArkMessageAnchor, limit: number, viewerScope: ArkViewerScope) => [
    ...arkChannelQueryKeys.messages(channelId),
    'window',
    anchor.mode,
    anchor.mode === 'around' ? anchor.messageId : 'tail',
    limit,
    viewerScope,
  ] as const,
  messagesList: (channelId: string, limit: number, viewerScope: ArkViewerScope) => [...arkChannelQueryKeys.messages(channelId), 'list', limit, viewerScope] as const,
  pinnedMessagesPrefix: (channelId: string) => [...arkChannelQueryKeys.messages(channelId), 'pinned'] as const,
  pinnedMessages: (channelId: string, viewerScope: ArkViewerScope) => [...arkChannelQueryKeys.pinnedMessagesPrefix(channelId), viewerScope] as const,
  statePrefix: (channelId: string) => [...arkChannelQueryKeys.all, 'state', channelId] as const,
  state: (channelId: string, viewerScope: ArkViewerScope) => [...arkChannelQueryKeys.statePrefix(channelId), viewerScope] as const,
}

export function invalidateArkChannelMessages(queryClient: QueryClient, channelId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: arkChannelQueryKeys.detailPrefix(channelId) }),
    queryClient.invalidateQueries({ queryKey: arkChannelQueryKeys.messages(channelId) }),
  ])
}

function deDupeMessages(items: any[]) {
  const seen = new Set<string>()
  const result: any[] = []
  for (const item of items) {
    if (seen.has(item.id))
      continue
    seen.add(item.id)
    result.push(item)
  }
  return result
}

export function useArkChannelQuery(channelId: MaybeRefOrGetter<string>, publicRead: MaybeRefOrGetter<boolean> = false) {
  const { $arkApi } = useNuxtApp()
  const auth = useArkAuth()
  const resolvedChannelId = computed(() => toValue(channelId))
  const resolvedPublicRead = computed(() => toValue(publicRead))
  const viewerScope = computed(() => arkViewerScope(resolvedPublicRead.value, auth.user.value?.id))

  return useQuery({
    enabled: computed(() => resolvedChannelId.value.length > 0),
    queryFn: () => $arkApi.query("channels.byId", { id: resolvedChannelId.value, publicRead: resolvedPublicRead.value }),
    queryKey: computed(() => arkChannelQueryKeys.detail(resolvedChannelId.value, viewerScope.value)),
  })
}

export function useArkMessageWindowQuery(
  channelId: MaybeRefOrGetter<string>,
  anchor: MaybeRefOrGetter<ArkMessageAnchor>,
  limit: MaybeRefOrGetter<number> = 50,
  publicRead: MaybeRefOrGetter<boolean> = false,
) {
  const { $arkApi } = useNuxtApp()
  const auth = useArkAuth()
  const resolvedChannelId = computed(() => toValue(channelId))
  const resolvedAnchor = computed(() => toValue(anchor))
  const resolvedLimit = computed(() => toValue(limit))
  const resolvedPublicRead = computed(() => toValue(publicRead))
  const viewerScope = computed(() => arkViewerScope(resolvedPublicRead.value, auth.user.value?.id))

  const query = useInfiniteQuery<any, Error, any, any, ArkMessagePageParam>({
    enabled: computed(() => resolvedChannelId.value.length > 0),
    getNextPageParam: (lastPage: any) => {
      if (!lastPage.nextCursor)
        return undefined
      return { cursor: lastPage.nextCursor, mode: 'after' as const }
    },
    getPreviousPageParam: (firstPage: any) => {
      if (!firstPage.prevCursor)
        return undefined
      return { cursor: firstPage.prevCursor, mode: 'before' as const }
    },
    initialPageParam: { mode: 'latest' },
    queryFn: ({ pageParam }) => {
      if (pageParam.mode === 'before') {
        return $arkApi.query("messages.before", {
          channelId: resolvedChannelId.value,
          cursor: pageParam.cursor,
          limit: resolvedLimit.value,
          publicRead: resolvedPublicRead.value,
        })
      }
      if (pageParam.mode === 'after') {
        return $arkApi.query("messages.after", {
          channelId: resolvedChannelId.value,
          cursor: pageParam.cursor,
          limit: resolvedLimit.value,
          publicRead: resolvedPublicRead.value,
        })
      }
      if (pageParam.mode === 'around') {
        return $arkApi.query("messages.around", {
          after: resolvedLimit.value,
          before: resolvedLimit.value,
          channelId: resolvedChannelId.value,
          messageId: pageParam.messageId,
          publicRead: resolvedPublicRead.value,
        })
      }
      const anchorValue = resolvedAnchor.value
      if (anchorValue.mode === 'around') {
        return $arkApi.query("messages.around", {
          after: resolvedLimit.value,
          before: resolvedLimit.value,
          channelId: resolvedChannelId.value,
          messageId: anchorValue.messageId,
          publicRead: resolvedPublicRead.value,
        })
      }
      return $arkApi.query("messages.latest", {
        channelId: resolvedChannelId.value,
        limit: resolvedLimit.value,
        publicRead: resolvedPublicRead.value,
      })
    },
    queryKey: computed(() => arkChannelQueryKeys.messageWindow(resolvedChannelId.value, resolvedAnchor.value, resolvedLimit.value, viewerScope.value)),
  })

  const messages = computed(() => deDupeMessages((query.data.value?.pages ?? []).flatMap((page: any) => page.items)))

  return {
    ...query,
    messages,
  }
}

export function useArkPinnedMessagesQuery(channelId: MaybeRefOrGetter<string>, publicRead: MaybeRefOrGetter<boolean> = false) {
  const { $arkApi } = useNuxtApp()
  const auth = useArkAuth()
  const resolvedChannelId = computed(() => toValue(channelId))
  const resolvedPublicRead = computed(() => toValue(publicRead))
  const viewerScope = computed(() => arkViewerScope(resolvedPublicRead.value, auth.user.value?.id))

  return useQuery({
    enabled: computed(() => resolvedChannelId.value.length > 0),
    queryFn: () => $arkApi.query("messages.pinned", {
      channelId: resolvedChannelId.value,
      limit: 20,
      publicRead: resolvedPublicRead.value,
    }),
    queryKey: computed(() => arkChannelQueryKeys.pinnedMessages(resolvedChannelId.value, viewerScope.value)),
  })
}

export function useArkChannelStateQuery(channelId: MaybeRefOrGetter<string>, enabled: MaybeRefOrGetter<boolean> = true) {
  const { $arkApi } = useNuxtApp()
  const auth = useArkAuth()
  const resolvedChannelId = computed(() => toValue(channelId))
  const viewerScope = computed(() => arkViewerScope(false, auth.user.value?.id))

  return useQuery({
    enabled: computed(() => resolvedChannelId.value.length > 0 && toValue(enabled)),
    queryFn: () => $arkApi.query("messages.state", { channelId: resolvedChannelId.value }),
    queryKey: computed(() => arkChannelQueryKeys.state(resolvedChannelId.value, viewerScope.value)),
    staleTime: 0,
  })
}

export function useArkMarkReadMutation() {
  const { $arkApi } = useNuxtApp()
  const auth = useArkAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { channelId: string, messageId?: string }) => {
      return $arkApi.mutate("messages.markRead", input)
    },
    onSuccess(state) {
      if (!state)
        return
      queryClient.setQueryData(arkChannelQueryKeys.state(state.channelId, arkViewerScope(false, auth.user.value?.id)), state)
    },
  })
}

export function useArkMessageCreateMutation() {
  const { $arkApi } = useNuxtApp()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ArkMutationInput<'messages.create'>) => {
      return $arkApi.mutate("messages.create", input)
    },
    onSuccess(message) {
      if (!message)
        return

      queryClient.invalidateQueries({ queryKey: arkChannelQueryKeys.all })
      void invalidateArkShell(queryClient)
      void invalidateArkChannelMessages(queryClient, message.channelId)
    },
  })
}

export function useArkThreadUpsertMutation() {
  const { $arkApi } = useNuxtApp()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ArkMutationInput<'channels.upsertThreadForMessage'>) => {
      return $arkApi.mutate("channels.upsertThreadForMessage", input)
    },
    onSuccess(channel) {
      if (!channel)
        return

      queryClient.invalidateQueries({ queryKey: arkChannelQueryKeys.all })
      void invalidateArkShell(queryClient)
      void invalidateArkChannelMessages(queryClient, channel.threadParentChannelId ?? channel.id)
    },
  })
}

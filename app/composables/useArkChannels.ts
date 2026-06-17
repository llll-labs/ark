import type { QueryClient } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue } from 'vue'

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
  all: ['trpc', 'ark', 'channels'] as const,
  detail: (channelId: string) => [...arkChannelQueryKeys.all, 'detail', channelId] as const,
  list: (spaceId: string) => [...arkChannelQueryKeys.all, 'list', spaceId] as const,
  messages: (channelId: string) => [...arkChannelQueryKeys.all, 'messages', channelId] as const,
  messageWindow: (channelId: string, anchor: ArkMessageAnchor) => [
    ...arkChannelQueryKeys.messages(channelId),
    'window',
    anchor.mode,
    anchor.mode === 'around' ? anchor.messageId : 'tail',
  ] as const,
  messagesList: (channelId: string, limit: number) => [...arkChannelQueryKeys.messages(channelId), 'list', limit] as const,
  pinnedMessages: (channelId: string) => [...arkChannelQueryKeys.messages(channelId), 'pinned'] as const,
  state: (channelId: string) => [...arkChannelQueryKeys.all, 'state', channelId] as const,
}

export function invalidateArkChannelMessages(queryClient: QueryClient, channelId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: arkChannelQueryKeys.detail(channelId) }),
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

export function useArkChannelQuery(channelId: MaybeRefOrGetter<string>) {
  const { $trpc } = useNuxtApp()
  const resolvedChannelId = computed(() => toValue(channelId))

  return useQuery({
    enabled: computed(() => resolvedChannelId.value.length > 0),
    queryFn: () => $trpc.ark.channels.byId.query({ id: resolvedChannelId.value }),
    queryKey: computed(() => arkChannelQueryKeys.detail(resolvedChannelId.value)),
  })
}

export function useArkMessageWindowQuery(
  channelId: MaybeRefOrGetter<string>,
  anchor: MaybeRefOrGetter<ArkMessageAnchor>,
  limit: MaybeRefOrGetter<number> = 50,
) {
  const { $trpc } = useNuxtApp()
  const resolvedChannelId = computed(() => toValue(channelId))
  const resolvedAnchor = computed(() => toValue(anchor))
  const resolvedLimit = computed(() => toValue(limit))

  const query = useInfiniteQuery<any, Error, any, any, ArkMessagePageParam>({
    enabled: computed(() => resolvedChannelId.value.length > 0),
    getNextPageParam: (lastPage: any) => {
      if (!lastPage.hasNewer || !lastPage.newerCursor)
        return undefined
      return { cursor: lastPage.newerCursor, mode: 'after' as const }
    },
    getPreviousPageParam: (firstPage: any) => {
      if (!firstPage.hasOlder || !firstPage.olderCursor)
        return undefined
      return { cursor: firstPage.olderCursor, mode: 'before' as const }
    },
    initialPageParam: { mode: 'latest' },
    queryFn: ({ pageParam }) => {
      if (pageParam.mode === 'before') {
        return $trpc.ark.messages.before.query({
          channelId: resolvedChannelId.value,
          cursor: pageParam.cursor,
          limit: resolvedLimit.value,
        })
      }
      if (pageParam.mode === 'after') {
        return $trpc.ark.messages.after.query({
          channelId: resolvedChannelId.value,
          cursor: pageParam.cursor,
          limit: resolvedLimit.value,
        })
      }
      if (pageParam.mode === 'around') {
        return $trpc.ark.messages.around.query({
          after: resolvedLimit.value,
          before: resolvedLimit.value,
          channelId: resolvedChannelId.value,
          messageId: pageParam.messageId,
        })
      }
      const anchorValue = resolvedAnchor.value
      if (anchorValue.mode === 'around') {
        return $trpc.ark.messages.around.query({
          after: resolvedLimit.value,
          before: resolvedLimit.value,
          channelId: resolvedChannelId.value,
          messageId: anchorValue.messageId,
        })
      }
      return $trpc.ark.messages.latest.query({
        channelId: resolvedChannelId.value,
        limit: resolvedLimit.value,
      })
    },
    queryKey: computed(() => arkChannelQueryKeys.messageWindow(resolvedChannelId.value, resolvedAnchor.value)),
  })

  const messages = computed(() => deDupeMessages((query.data.value?.pages ?? []).flatMap((page: any) => page.items)))

  return {
    ...query,
    messages,
  }
}

export function useArkPinnedMessagesQuery(channelId: MaybeRefOrGetter<string>) {
  const { $trpc } = useNuxtApp()
  const resolvedChannelId = computed(() => toValue(channelId))

  return useQuery({
    enabled: computed(() => resolvedChannelId.value.length > 0),
    queryFn: () => $trpc.ark.messages.pinned.query({
      channelId: resolvedChannelId.value,
      limit: 20,
    }),
    queryKey: computed(() => arkChannelQueryKeys.pinnedMessages(resolvedChannelId.value)),
  })
}

export function useArkChannelStateQuery(channelId: MaybeRefOrGetter<string>) {
  const { $trpc } = useNuxtApp()
  const resolvedChannelId = computed(() => toValue(channelId))

  return useQuery({
    enabled: computed(() => resolvedChannelId.value.length > 0),
    queryFn: () => $trpc.ark.messages.state.query({ channelId: resolvedChannelId.value }),
    queryKey: computed(() => arkChannelQueryKeys.state(resolvedChannelId.value)),
    staleTime: 0,
  })
}

export function useArkMarkReadMutation() {
  const { $trpc } = useNuxtApp()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { channelId: string, messageId?: string }) => {
      return $trpc.ark.messages.markRead.mutate(input)
    },
    onSuccess(state) {
      if (!state)
        return
      queryClient.setQueryData(arkChannelQueryKeys.state(state.channelId), state)
    },
  })
}

export function useArkMessageCreateMutation() {
  const { $trpc } = useNuxtApp()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Parameters<typeof $trpc.ark.messages.create.mutate>[0]) => {
      return $trpc.ark.messages.create.mutate(input)
    },
    onSuccess(message) {
      if (!message)
        return

      queryClient.invalidateQueries({ queryKey: arkChannelQueryKeys.all })
      void invalidateArkChannelMessages(queryClient, message.channelId)
    },
  })
}

export function useArkThreadUpsertMutation() {
  const { $trpc } = useNuxtApp()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Parameters<typeof $trpc.ark.channels.upsertThreadForMessage.mutate>[0]) => {
      return $trpc.ark.channels.upsertThreadForMessage.mutate(input)
    },
    onSuccess(channel) {
      if (!channel)
        return

      queryClient.invalidateQueries({ queryKey: arkChannelQueryKeys.all })
      void invalidateArkChannelMessages(queryClient, channel.threadParentChannelId ?? channel.id)
    },
  })
}

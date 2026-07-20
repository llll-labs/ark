import type { MaybeRefOrGetter } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useWebSocket } from '@vueuse/core'
import { computed, toValue } from 'vue'
import { arkChannelQueryKeys, invalidateArkChannelMessages } from './useArkChannels'
import { invalidateArkShell } from './useArkShell'

interface ArkRealtimeMessage {
  channelId?: string
  reason?: string
  type?: string
}

interface ArkRealtimeOptions {
  onMessagesChanged?: (message: ArkRealtimeMessage & { channelId: string }) => false | void
}

export function useArkRealtime(channelId: MaybeRefOrGetter<string | null | undefined>, options: ArkRealtimeOptions = {}) {
  const queryClient = useQueryClient()
  const resolvedChannelId = computed(() => toValue(channelId) ?? '')
  const url = computed(() => {
    if (import.meta.server || !resolvedChannelId.value)
      return undefined

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws/ark?channelId=${encodeURIComponent(resolvedChannelId.value)}`
  })

  const socket = useWebSocket<string>(url, {
    autoReconnect: {
      delay: 1000,
      retries: 10,
    },
    onMessage: (_ws, event) => {
      let message: ArkRealtimeMessage
      try {
        message = JSON.parse(String(event.data)) as ArkRealtimeMessage
      }
      catch {
        return
      }

      if (message.type !== 'messages:changed' || !message.channelId)
        return
      if (message.channelId !== resolvedChannelId.value)
        return

      const handled = options.onMessagesChanged?.(message as ArkRealtimeMessage & { channelId: string })
      if (handled === false)
        return

      void invalidateArkChannelMessages(queryClient, message.channelId)
      void queryClient.invalidateQueries({ queryKey: arkChannelQueryKeys.all })
      void invalidateArkShell(queryClient)
    },
  })

  return socket
}

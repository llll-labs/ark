export type ArkChatEventReason = 'created' | 'pinned' | 'reacted' | 'related'

export interface ArkChatEvent {
  channelId: string
  reason: ArkChatEventReason
  type: 'messages:changed'
}

interface ArkRealtimePeer {
  id: string
  send: (data: unknown) => unknown
}

const channelPeers = new Map<string, Set<ArkRealtimePeer>>()

function peersForChannel(channelId: string) {
  let peers = channelPeers.get(channelId)
  if (!peers) {
    peers = new Set()
    channelPeers.set(channelId, peers)
  }
  return peers
}

export function registerArkChannelPeer(channelId: string, peer: ArkRealtimePeer) {
  peersForChannel(channelId).add(peer)
}

export function unregisterArkChannelPeer(channelId: string, peer: ArkRealtimePeer) {
  const peers = channelPeers.get(channelId)
  if (!peers)
    return

  peers.delete(peer)
  if (peers.size === 0)
    channelPeers.delete(channelId)
}

export function publishChatEvent(event: ArkChatEvent) {
  const peers = channelPeers.get(event.channelId)
  if (!peers?.size)
    return

  const payload = JSON.stringify(event)
  for (const peer of peers) {
    try {
      peer.send(payload)
    }
    catch {
      unregisterArkChannelPeer(event.channelId, peer)
    }
  }
}

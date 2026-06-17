import { defineWebSocketHandler } from 'h3'
import { auth } from '../../utils/auth'
import { canReadChannel } from '../../utils/authorization'
import { registerArkChannelPeer, unregisterArkChannelPeer } from '../../utils/realtime'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function channelIdFromRequest(request: { url: string }) {
  const channelId = new URL(request.url).searchParams.get('channelId')
  return channelId && uuidPattern.test(channelId) ? channelId : null
}

export default defineWebSocketHandler({
  upgrade(request) {
    const channelId = channelIdFromRequest(request)
    if (!channelId) {
      return new Response('Missing or invalid channelId', { status: 400 })
    }

    request.context.channelId = channelId
  },

  async open(peer) {
    const channelId = typeof peer.context.channelId === 'string' ? peer.context.channelId : null
    if (!channelId) {
      peer.close(1008, 'Missing channel')
      return
    }

    const session = await auth.api.getSession({ headers: peer.request.headers })
    const access = await canReadChannel(channelId, session)
    if (!access.allowed) {
      peer.close(1008, 'Channel access denied')
      return
    }

    registerArkChannelPeer(channelId, peer)
    peer.send(JSON.stringify({ channelId, type: 'connected' }))
  },

  message(peer, message) {
    try {
      const data = message.json<{ type?: string }>()
      if (data.type === 'ping')
        peer.send(JSON.stringify({ type: 'pong' }))
    }
    catch {
      peer.send(JSON.stringify({ type: 'error' }))
    }
  },

  close(peer) {
    const channelId = typeof peer.context.channelId === 'string' ? peer.context.channelId : null
    if (channelId)
      unregisterArkChannelPeer(channelId, peer)
  },
})

import { installOutboundProxyFetch } from '../utils/outbound-proxy'

export default defineNitroPlugin(() => {
  installOutboundProxyFetch(process.env)
})

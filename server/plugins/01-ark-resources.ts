import { registerCoreArkResources } from '../resources/core'
import { loadPersistedArkResources } from '../resources/discovery'

export default defineNitroPlugin(async () => {
  registerCoreArkResources()
  await loadPersistedArkResources()
})

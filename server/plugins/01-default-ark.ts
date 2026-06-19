import { ensureDefaultArk } from '../utils/authorization'

export default defineNitroPlugin(async () => {
  await ensureDefaultArk()
})

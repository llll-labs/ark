import { runTelegramMiniAuthGuard } from '../utils/arkRouteGuards'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    void runTelegramMiniAuthGuard(useRoute())
  })
})

export default defineNuxtPlugin({
  dependsOn: ['ark-api'],
  name: 'ark-auth-preload',
  async setup() {
    const authRuntime = useArkAuthRuntimeStore()
    await authRuntime.initialize()
    if (import.meta.client)
      void authRuntime.loadAuthUi()
  },
})

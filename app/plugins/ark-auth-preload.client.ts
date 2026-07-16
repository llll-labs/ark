export default defineNuxtPlugin({
  dependsOn: ['ark-api'],
  name: 'ark-auth-preload',
  setup() {
    const authRuntime = useArkAuthRuntimeStore()
    void authRuntime.preload()
  },
})

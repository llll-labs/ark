export default defineNuxtPlugin({
  dependsOn: ['ark-trpc'],
  name: 'ark-auth-preload',
  setup() {
    const authRuntime = useArkAuthRuntimeStore()
    void authRuntime.preload()
  },
})

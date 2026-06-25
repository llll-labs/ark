export default defineNuxtPlugin(() => {
  const authRuntime = useArkAuthRuntimeStore()
  void authRuntime.preload()
})

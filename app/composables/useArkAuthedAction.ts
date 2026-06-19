export function useArkAuthedAction() {
  const auth = useArkAuth()
  const authModalOpen = ref(false)
  const pendingAction = shallowRef<null | (() => Promise<void> | void)>(null)

  async function runAuthed(action: () => Promise<void> | void) {
    const me = auth.checked.value ? auth.me.value : await auth.check()
    if (me?.authenticated) {
      await action()
      return
    }
    pendingAction.value = action
    authModalOpen.value = true
  }

  async function onAuthenticated() {
    authModalOpen.value = false
    const action = pendingAction.value
    pendingAction.value = null
    if (action)
      await action()
  }

  return {
    authModalOpen,
    onAuthenticated,
    runAuthed,
  }
}

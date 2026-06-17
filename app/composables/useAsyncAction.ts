/**
 * Wraps the recurring `pending / error / success + try/catch/finally` mutation
 * pattern. `run()` returns the action result, or `undefined` if it threw (the
 * message is captured in `error`). Each `run()` resets `error`/`success` first.
 */
export function useAsyncAction() {
  const pending = ref(false)
  const error = ref('')
  const success = ref('')

  async function run<T>(
    action: () => Promise<T>,
    options?: { successMessage?: string, errorFallback?: string },
  ): Promise<T | undefined> {
    pending.value = true
    error.value = ''
    success.value = ''
    try {
      const result = await action()
      if (options?.successMessage)
        success.value = options.successMessage
      return result
    }
    catch (cause) {
      error.value = cause instanceof Error
        ? cause.message
        : (options?.errorFallback ?? 'Something went wrong')
      return undefined
    }
    finally {
      pending.value = false
    }
  }

  return { error, pending, run, success }
}

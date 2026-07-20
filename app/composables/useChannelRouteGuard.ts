import type { MaybeRefOrGetter } from 'vue'

/**
 * Loads a channel for a channel route and bounces job-discussion channels back
 * to the owning job (those channels are not part of normal channel navigation).
 * `jobRedirect` lets each route pick the destination; defaults to `/app/jobs`.
 */
export function useChannelRouteGuard(
  channelId: MaybeRefOrGetter<string>,
  options?: { jobRedirect?: (channel: any) => string },
) {
  const id = computed(() => toValue(channelId))
  const query = useArkChannelQuery(id)

  watch(query.data, (value) => {
    if (value?.kind !== 'job_discussion')
      return

    const target = options?.jobRedirect?.(value) ?? '/app/jobs'
    void navigateTo(target, { replace: true })
  }, { immediate: true })

  return query.suspense().then(() => query.data)
}

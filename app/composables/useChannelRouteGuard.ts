import type { MaybeRefOrGetter } from 'vue'

/**
 * Loads a channel for a channel route and bounces job-discussion channels back
 * to the owning job (those channels are not part of normal channel navigation).
 * `jobRedirect` lets each route pick the destination; defaults to `/app/jobs`.
 */
export async function useChannelRouteGuard(
  channelId: MaybeRefOrGetter<string>,
  options?: { jobRedirect?: (channel: any) => string },
) {
  const { $trpc } = useNuxtApp()
  const id = computed(() => toValue(channelId))
  const { data: channel } = await useAsyncData(
    `ark-channel-route-${id.value}`,
    () => $trpc.ark.channels.byId.query({ id: id.value }),
  )

  if (channel.value?.kind === 'job_discussion') {
    const target = options?.jobRedirect?.(channel.value) ?? '/app/jobs'
    await navigateTo(target, { replace: true })
  }

  return channel
}

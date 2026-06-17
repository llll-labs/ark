/**
 * Shared "start a job discussion" flow used by jobs/index.vue (modal aside) and
 * jobs/[jobId].vue. Both call `jobs.startDiscussion` to lazily create the
 * channel, then `messages.create` with `bodyJson: { jobId }` for the first
 * message. Uses `useAsyncAction` for the pending/error bookkeeping.
 */

export interface UseJobDiscussionOptions {
  /** Returns the job the composer is attached to (or null when none). */
  job: () => any | null
  /**
   * Called after `startDiscussion` succeeds, with the raw mutation result.
   * Lets the caller patch local state (e.g. set `discussionChannelId`) and/or
   * refresh server data. Should resolve before the first message is sent.
   */
  onDiscussionStarted?: (result: { channel: { id: string }, job?: any }) => Promise<void> | void
  /** Called after the first message is sent, e.g. to re-sync the job. */
  onMessageSent?: () => Promise<void> | void
}

export function useJobDiscussion(options: UseJobDiscussionOptions) {
  const { $trpc } = useNuxtApp()
  const { error, pending: discussionSaving, run } = useAsyncAction()
  const firstDiscussionMessage = ref('')

  /** Resolve (creating if needed) the discussion channel for the current job. */
  async function ensureJobDiscussion(): Promise<{ id: string }> {
    const job = options.job()
    if (!job)
      throw new Error('Job is not loaded')
    if (job.discussionChannelId)
      return { id: job.discussionChannelId }
    const result = await $trpc.ark.market.jobs.startDiscussion.mutate({ id: job.id })
    if (!result.channel)
      throw new Error('Channel was not created')
    await options.onDiscussionStarted?.(result as { channel: { id: string }, job?: any })
    return result.channel
  }

  async function sendFirstDiscussionMessage() {
    const job = options.job()
    if (!job)
      return
    const body = firstDiscussionMessage.value.trim()
    if (!body)
      return
    await run(async () => {
      const channel = await ensureJobDiscussion()
      await $trpc.ark.messages.create.mutate({
        body,
        bodyJson: { jobId: job.id },
        channelId: channel.id,
      })
      firstDiscussionMessage.value = ''
      await options.onMessageSent?.()
    }, { errorFallback: 'Message was not sent' })
  }

  return {
    discussionSaving,
    ensureJobDiscussion,
    error,
    firstDiscussionMessage,
    sendFirstDiscussionMessage,
  }
}

import type { AppRouter } from '../server/trpc/routers'
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import '../server/utils/env'

const CHANNEL_SLUG = process.env.STRESS_CHANNEL_SLUG ?? 'war-and-peace'
const BASE_URL = process.env.STRESS_BASE_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:5404'
const TRUSTED_ORIGIN = process.env.BETTER_AUTH_URL ?? 'http://localhost:5400'
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL ?? 'admin@example.com')
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD ?? 'password')

interface Cursor {
  createdAt: string
  id: string
}

interface WindowResult {
  anchorMessageId?: string
  hasNewer: boolean
  hasOlder: boolean
  items: Array<{ createdAt: string | Date, id: string }>
  newerCursor: Cursor | null
  olderCursor: Cursor | null
}

function cookieHeaderFrom(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const setCookies = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')!] : [])
  return setCookies.map(value => value.split(';')[0]).join('; ')
}

function assertChronological(windowName: string, items: Array<{ createdAt: string | Date, id: string }>) {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1]!
    const current = items[index]!
    const previousTime = new Date(previous.createdAt).getTime()
    const currentTime = new Date(current.createdAt).getTime()
    if (previousTime > currentTime || (previousTime === currentTime && previous.id > current.id))
      throw new Error(`${windowName} is not chronological at index ${index}.`)
  }
}

function assertBoundedAround(result: WindowResult, messageId: string, maxItems: number) {
  if (result.anchorMessageId !== messageId)
    throw new Error(`around(${messageId}) returned anchor ${result.anchorMessageId}`)
  if (!result.items.some(item => item.id === messageId))
    throw new Error(`around(${messageId}) did not include the target message.`)
  if (result.items.length > maxItems)
    throw new Error(`around(${messageId}) returned ${result.items.length} items; expected at most ${maxItems}.`)
  assertChronological(`around(${messageId})`, result.items)
}

async function login() {
  const response = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
    headers: {
      'content-type': 'application/json',
      'origin': TRUSTED_ORIGIN,
      'referer': `${TRUSTED_ORIGIN}/login`,
    },
    method: 'POST',
  })

  if (!response.ok)
    throw new Error(`Admin login failed: HTTP ${response.status} ${await response.text()}`)

  const cookie = cookieHeaderFrom(response)
  if (!cookie)
    throw new Error('Admin login returned no session cookie.')

  return cookie
}

async function collectPinned(trpc: ReturnType<typeof createTRPCProxyClient<AppRouter>>, channelId: string) {
  const items: Array<{ message: { id: string, createdAt: string | Date }, pin: { id: string } }> = []
  let cursor: Cursor | undefined

  for (let page = 0; page < 20; page += 1) {
    const result = await trpc.ark.messages.pinned.query({
      channelId,
      cursor,
      limit: 100,
    })
    items.push(...result.items)
    cursor = result.nextCursor ?? undefined
    if (!result.hasMore || !cursor)
      break
  }

  return items
}

async function main() {
  const cookie = await login()
  const trpc = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        headers: () => ({ cookie }),
        url: `${BASE_URL}/api/trpc`,
      }),
    ],
  })

  const spaces = await trpc.ark.spaces.list.query({})
  const root = spaces[0]
  if (!root)
    throw new Error('No readable spaces found.')

  const channels = await trpc.ark.channels.list.query({ spaceId: root.id })
  const channel = channels.find(row => row.slug === CHANNEL_SLUG)
  if (!channel)
    throw new Error(`#${CHANNEL_SLUG} was not found. Run stress:seed:war-and-peace first.`)

  const latest = await trpc.ark.messages.latest.query({ channelId: channel.id, limit: 50 })
  if (latest.items.length !== 50)
    throw new Error(`latest returned ${latest.items.length} items; expected 50.`)
  if (!latest.hasOlder || !latest.olderCursor || !latest.newerCursor)
    throw new Error('latest did not expose older/newer cursors for the stress channel.')
  assertChronological('latest', latest.items)

  const before = await trpc.ark.messages.before.query({
    channelId: channel.id,
    cursor: latest.olderCursor,
    limit: 50,
  })
  if (!before.items.length || !before.newerCursor)
    throw new Error('before returned no items or no newer cursor.')
  assertChronological('before', before.items)

  const after = await trpc.ark.messages.after.query({
    channelId: channel.id,
    cursor: before.newerCursor,
    limit: 50,
  })
  if (!after.items.length)
    throw new Error('after returned no items.')
  assertChronological('after', after.items)

  const pinned = await collectPinned(trpc, channel.id)
  if (pinned.length < 50)
    throw new Error(`pinned returned ${pinned.length} pins; expected chapter-level pins.`)

  const sampleIndexes = [
    0,
    Math.floor(pinned.length / 2),
    pinned.length - 1,
  ]
  const sampleMessageIds = [...new Set(sampleIndexes.map(index => pinned[index]!.message.id))]
  for (const messageId of sampleMessageIds) {
    const around = await trpc.ark.messages.around.query({
      after: 10,
      before: 10,
      channelId: channel.id,
      messageId,
    })
    assertBoundedAround(around, messageId, 21)
  }

  console.log(JSON.stringify({
    after: after.items.length,
    before: before.items.length,
    channelId: channel.id,
    channelSlug: channel.slug,
    latest: latest.items.length,
    pinned: pinned.length,
    sampledAround: sampleMessageIds.length,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
})

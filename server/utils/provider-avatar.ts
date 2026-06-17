import type { AvatarSyncMetadata } from './provider-avatar-rules'
import { Buffer } from 'node:buffer'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { arkUsers, arkAuthAccounts } from '../../db/schema'
import { useDatabase } from './db'
import { storeFileFromBuffer } from './files'
import {
  providerAvatarSourceHash,
  shouldReplaceProviderAvatar,
} from './provider-avatar-rules'

type ArkUserRow = typeof arkUsers.$inferSelect

interface AuthUserWithAvatar {
  id: string
  image?: null | string
}

interface ProviderAccountRow {
  accountId: string
  providerId: string
}

interface ProviderAvatarFetchResult {
  data: Buffer
  mimeType: string
}

const supportedProviderIds = ['discord', 'telegram', 'telegram-mini'] as const
const allowedImageTypes = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const maxAvatarBytes = 5 * 1024 * 1024
const avatarFetchTimeoutMs = 5000

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function extensionForMimeType(mimeType: string) {
  switch (mimeType) {
    case 'image/avif':
      return 'avif'
    case 'image/gif':
      return 'gif'
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return 'bin'
  }
}

function mimeTypeFromUrl(url: string) {
  const path = new URL(url).pathname.toLowerCase()
  if (path.endsWith('.avif'))
    return 'image/avif'
  if (path.endsWith('.gif'))
    return 'image/gif'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg'))
    return 'image/jpeg'
  if (path.endsWith('.png'))
    return 'image/png'
  if (path.endsWith('.webp'))
    return 'image/webp'
  return ''
}

function avatarSyncMetadata(profileJson: Record<string, unknown>): AvatarSyncMetadata {
  const value = profileJson.avatarSync
  return isRecord(value) ? value as AvatarSyncMetadata : {}
}

function providerFromImageUrl(imageUrl: string, accounts: ProviderAccountRow[]) {
  if (/cdn\.discordapp\.com|discordapp\.net/i.test(imageUrl)) {
    return accounts.find(account => account.providerId === 'discord')
  }
  if (/telegram|t\.me/i.test(imageUrl)) {
    return accounts.find(account => account.providerId === 'telegram-mini')
      ?? accounts.find(account => account.providerId === 'telegram')
  }

  return accounts[0] ?? null
}

async function providerAccountsForUser(authUserId: string) {
  return useDatabase()
    .select({
      accountId: arkAuthAccounts.accountId,
      providerId: arkAuthAccounts.providerId,
    })
    .from(arkAuthAccounts)
    .where(and(
      eq(arkAuthAccounts.userId, authUserId),
      inArray(arkAuthAccounts.providerId, [...supportedProviderIds]),
    ))
    .orderBy(desc(arkAuthAccounts.updatedAt))
}

async function fetchProviderAvatar(url: string, fetcher: typeof fetch = globalThis.fetch): Promise<ProviderAvatarFetchResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), avatarFetchTimeoutMs)
  try {
    const response = await fetcher(url, { signal: controller.signal })
    if (!response.ok)
      throw new Error(`Provider avatar fetch failed: ${response.status}`)

    const declaredLength = Number.parseInt(response.headers.get('content-length') ?? '', 10)
    if (Number.isFinite(declaredLength) && declaredLength > maxAvatarBytes)
      throw new Error('Provider avatar is too large.')

    const headerMimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
    const mimeType = headerMimeType || mimeTypeFromUrl(url)
    if (!allowedImageTypes.has(mimeType))
      throw new Error(`Provider avatar content type is not supported: ${mimeType || 'unknown'}`)

    const data = Buffer.from(await response.arrayBuffer())
    if (data.length > maxAvatarBytes)
      throw new Error('Provider avatar is too large.')

    return { data, mimeType }
  }
  finally {
    clearTimeout(timeout)
  }
}

export async function syncArkUserProviderAvatar(arkUser: ArkUserRow, authUser: AuthUserWithAvatar) {
  const sourceUrl = String(authUser.image ?? '').trim()
  if (!sourceUrl)
    return arkUser

  let parsedUrl: URL
  try {
    parsedUrl = new URL(sourceUrl)
  }
  catch {
    return arkUser
  }
  if (parsedUrl.protocol !== 'https:')
    return arkUser

  const accounts = await providerAccountsForUser(authUser.id)
  const provider = providerFromImageUrl(sourceUrl, accounts)
  if (!provider)
    return arkUser

  const profileJson = isRecord(arkUser.profileJson) ? arkUser.profileJson : {}
  const metadata = avatarSyncMetadata(profileJson)
  const sourceUrlHash = providerAvatarSourceHash(provider.providerId, sourceUrl)
  if (!shouldReplaceProviderAvatar(arkUser.avatarFileId, metadata, sourceUrlHash))
    return arkUser

  const avatar = await fetchProviderAvatar(sourceUrl)
  const extension = extensionForMimeType(avatar.mimeType)
  const file = await storeFileFromBuffer({
    data: avatar.data,
    filename: `${provider.providerId}-${provider.accountId}.${extension}`,
    metadataJson: {
      provider: provider.providerId,
      providerUserId: provider.accountId,
      sourceUrlHash,
    },
    mimeType: avatar.mimeType,
    originalFilename: `${provider.providerId}-${provider.accountId}.${extension}`,
    ownerArkUserId: arkUser.id,
    visibility: 'public',
  })
  const [updated] = await useDatabase().update(arkUsers).set({
    avatarFileId: file.id,
    profileJson: {
      ...profileJson,
      avatarSync: {
        fileId: file.id,
        provider: provider.providerId,
        providerUserId: provider.accountId,
        sourceUrlHash,
        syncedAt: new Date().toISOString(),
      },
    },
    updatedAt: new Date(),
  }).where(eq(arkUsers.id, arkUser.id)).returning()

  return updated ?? { ...arkUser, avatarFileId: file.id }
}

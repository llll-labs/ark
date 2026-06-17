import { createHash } from 'node:crypto'

export interface AvatarSyncMetadata {
  fileId?: string
  provider?: string
  providerUserId?: string
  sourceUrlHash?: string
  syncedAt?: string
}

export function providerAvatarSourceHash(providerId: string, sourceUrl: string) {
  return createHash('sha256').update(`${providerId}\n${sourceUrl}`).digest('hex')
}

export function shouldReplaceProviderAvatar(currentAvatarFileId: null | string | undefined, metadata: AvatarSyncMetadata, nextSourceUrlHash: string) {
  const current = String(currentAvatarFileId ?? '').trim()
  if (!current)
    return true

  if (!metadata.fileId)
    return false

  if (current !== metadata.fileId)
    return false

  return metadata.sourceUrlHash !== nextSourceUrlHash
}

import type { arkFiles } from '../../db/schema'

type FileRow = Pick<typeof arkFiles.$inferSelect, 'deletedAt' | 'id' | 'mimeType' | 'ownerArkUserId' | 'visibility'>

export function canUseFileAsProfileAvatar(file: null | undefined | FileRow, arkUserId: string) {
  return Boolean(
    file
    && !file.deletedAt
    && file.ownerArkUserId === arkUserId
    && file.visibility === 'public'
    && file.mimeType.startsWith('image/'),
  )
}

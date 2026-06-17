export function arkAvatarFileUrl(fileId: null | string | undefined) {
  return fileId ? `/api/ark/files/${fileId}?variant=thumb` : ''
}

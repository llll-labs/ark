export interface ArkFileAttachment {
  id: string
  filename?: string | null
  height?: number | null
  mimeType?: string | null
  originalFilename?: string | null
  sizeBytes?: number | null
  width?: number | null
}

export function isImageMime(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType?.startsWith('image/'))
}

export function attachmentName(file: ArkFileAttachment): string {
  return file.originalFilename || file.filename || file.id
}

export function attachmentUrl(file: ArkFileAttachment, variant?: 'preview' | 'thumb'): string {
  const params = new URLSearchParams()
  if (variant)
    params.set('variant', variant)
  const query = params.toString()
  return `/api/ark/files/${file.id}${query ? `?${query}` : ''}`
}

export function attachmentDownloadUrl(file: ArkFileAttachment): string {
  return `/api/ark/files/${file.id}?disposition=attachment`
}

function attachmentList(message: any): ArkFileAttachment[] {
  return Array.isArray(message?.attachments) ? message.attachments : []
}

export function imageAttachments(message: any): ArkFileAttachment[] {
  return attachmentList(message).filter(file => isImageMime(file.mimeType))
}

export function otherAttachments(message: any): ArkFileAttachment[] {
  return attachmentList(message).filter(file => !isImageMime(file.mimeType))
}

/**
 * Visible message body: blank when the body is empty or merely echoes the
 * attachment filenames (the chat upload flow stores filenames as the body).
 */
export function messageBody(message: any): string {
  const body = typeof message?.body === 'string' ? message.body.trim() : ''
  if (!body)
    return ''
  const names = attachmentList(message).map(attachmentName)
  if (names.length && (names.includes(body) || names.join(', ') === body))
    return ''
  return body
}

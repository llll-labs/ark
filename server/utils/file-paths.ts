import { extname } from 'node:path'

const mimeExtensions: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'text/plain': 'txt',
}

function normalizeExtension(value: string) {
  return value.replace(/^\.+/, '').replace(/[^\da-z]+/gi, '').toLowerCase()
}

export function originalFileExtension(filename: string | undefined, mimeType: string) {
  const filenameExtension = normalizeExtension(extname(filename ?? ''))
  if (filenameExtension)
    return filenameExtension

  return mimeExtensions[mimeType.toLowerCase()] ?? 'bin'
}

export function originalFileObjectPath(id: string, filename: string | undefined, mimeType: string) {
  return `${id}.${originalFileExtension(filename, mimeType)}`
}

export function fileVariantObjectPath(id: string, kind: string, extension: string) {
  return `${id}__${kind.replace(/[^\w.-]+/g, '-')}.${normalizeExtension(extension) || 'bin'}`
}

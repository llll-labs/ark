import type { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { arkFiles, arkFileVariants } from '../../db/schema'
import { createBoundRequestAuth } from './authorization'
import { useDatabase } from './db'
import { fileVariantObjectPath, originalFileObjectPath } from './file-paths'
import { defaultPrivateStorage, defaultPublicStorage, putStoredObject } from './storage'
import { uuidv7 } from './uuid'

interface StoredVariant {
  bucket: string
  height?: number
  kind: string
  mimeType: string
  path: string
  sizeBytes: number
  storage: string
  width?: number
}

export interface StoreFileFromBufferInput {
  data: Buffer
  filename?: string
  metadataJson?: Record<string, unknown>
  mimeType?: string
  originalFilename?: string
  ownerArkUserId?: null | string
  visibility?: 'private' | 'public'
}

async function maybeSharp(input: Buffer) {
  try {
    const sharp = (await import('sharp')).default
    return sharp(input)
  }
  catch {
    return null
  }
}

export async function storeFileFromBuffer(input: StoreFileFromBufferInput) {
  const db = useDatabase()
  const id = uuidv7()
  const mimeType = input.mimeType ?? 'application/octet-stream'
  const filename = input.filename ?? originalFileObjectPath(id, undefined, mimeType)
  const basePath = originalFileObjectPath(id, input.originalFilename ?? input.filename, mimeType)
  const visibility = input.visibility ?? 'private'
  const originalStorage = visibility === 'public' ? defaultPublicStorage() : defaultPrivateStorage()
  const variantStorage = originalStorage
  await putStoredObject(originalStorage, basePath, input.data, mimeType)
  const sizeBytes = input.data.length
  const checksum = createHash('sha256').update(input.data).digest('hex')
  const variants: StoredVariant[] = []
  let width: number | undefined
  let height: number | undefined

  if (mimeType.startsWith('image/')) {
    const image = await maybeSharp(input.data)
    if (image) {
      const metadata = await image.metadata()
      width = metadata.width
      height = metadata.height
      for (const variant of [
        { kind: 'preview', size: 1280 },
        { kind: 'thumb', size: 320 },
      ]) {
        const output = await image.clone().rotate().resize({
          fit: 'inside',
          height: variant.size,
          withoutEnlargement: true,
          width: variant.size,
        }).webp({ quality: variant.kind === 'thumb' ? 72 : 82 }).toBuffer({ resolveWithObject: true })
        const variantPath = fileVariantObjectPath(id, variant.kind, 'webp')
        await putStoredObject(variantStorage, variantPath, output.data, 'image/webp')
        variants.push({
          bucket: variantStorage.bucket,
          height: output.info.height,
          kind: variant.kind,
          mimeType: 'image/webp',
          path: variantPath,
          sizeBytes: output.data.length,
          storage: variantStorage.name,
          width: output.info.width,
        })
      }
    }
  }

  const [file] = await db.insert(arkFiles).values({
    bucket: originalStorage.bucket,
    checksum,
    filename,
    height,
    id,
    metadataJson: input.metadataJson ?? {},
    mimeType,
    originalFilename: input.originalFilename ?? input.filename,
    ownerArkUserId: input.ownerArkUserId,
    path: basePath,
    sizeBytes,
    storage: originalStorage.name,
    visibility,
    width,
  }).returning()
  if (!file)
    throw new Error('File insert did not return a row.')

  if (variants.length) {
    await db.insert(arkFileVariants).values(variants.map(variant => ({
      bucket: variant.bucket,
      fileId: file.id,
      height: variant.height,
      kind: variant.kind,
      mimeType: variant.mimeType,
      path: variant.path,
      sizeBytes: variant.sizeBytes,
      storage: variant.storage,
      width: variant.width,
    })))
  }

  return file
}

export async function storeUploadedFile(
  event: any,
  part: { data: Buffer, filename?: string, type?: string },
  spaceId?: string,
  options: { visibility?: 'private' | 'public' } = {},
) {
  const { auth } = await createBoundRequestAuth(event)
  const targetSpace = spaceId ?? (await auth.publicSpace())?.id
  if (!targetSpace)
    throw new Error('Public space is missing.')

  const access = await auth.requireSpace(targetSpace, 'files.upload')
  const arkUser = access.arkUser ?? await auth.arkUser()

  return storeFileFromBuffer({
    data: part.data,
    metadataJson: { spaceId: targetSpace },
    mimeType: part.type,
    originalFilename: part.filename,
    ownerArkUserId: arkUser?.id,
    visibility: options.visibility ?? 'private',
  })
}

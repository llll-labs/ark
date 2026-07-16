import type { Readable } from 'node:stream'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { arkFiles, arkFileVariants } from '../../db/schema'
import type { ArkResourceAccountability, ArkResourceServices } from '../resources/types'
import { registerCoreArkResources } from '../resources/core'
import { systemArkResourceAccountability, withArkResourceTransaction } from '../resources/service'
import { createBoundRequestAuth } from './authorization'
import { useDatabase } from './db'
import { fileVariantObjectPath, originalFileObjectPath } from './file-paths'
import {
  buildSignedFileUrl,
  defaultPrivateStorage,
  defaultPublicStorage,
  deleteStoredObject,
  putStoredObject,
  readStoredObject,
  resolveStorageLocation,
  signedReadUrl,
} from './storage'
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
  accountability?: ArkResourceAccountability
  accessMode?: 'public' | 'signed_only' | 'space'
  data: Buffer
  filename?: string
  metadataJson?: Record<string, unknown>
  mimeType?: string
  onRollbackCleanup?: (cleanup: () => Promise<void>) => void
  originalFilename?: string
  ownerArkUserId?: null | string
  visibility?: 'private' | 'public'
}

export interface ArkFileResourceContext {
  database: any
  services: ArkResourceServices
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

export async function storeFileFromBuffer(input: StoreFileFromBufferInput, context?: ArkFileResourceContext) {
  registerCoreArkResources()
  const db = useDatabase()
  const id = uuidv7()
  const mimeType = input.mimeType ?? 'application/octet-stream'
  const filename = input.filename ?? originalFileObjectPath(id, undefined, mimeType)
  const basePath = originalFileObjectPath(id, input.originalFilename ?? input.filename, mimeType)
  const visibility = input.visibility ?? 'private'
  const accessMode = input.accessMode ?? (visibility === 'public' ? 'public' : 'space')
  if (visibility === 'public' && accessMode !== 'public')
    throw new Error('Public Ark files must use public access mode.')
  if (visibility !== 'public' && accessMode === 'public')
    throw new Error('Private Ark files cannot use public access mode.')
  const originalStorage = visibility === 'public' ? defaultPublicStorage() : defaultPrivateStorage()
  const variantStorage = originalStorage
  const sizeBytes = input.data.length
  const checksum = createHash('sha256').update(input.data).digest('hex')
  const variants: StoredVariant[] = []
  const storedObjects: Array<{ location: typeof originalStorage, path: string }> = []
  let width: number | undefined
  let height: number | undefined

  const cleanup = async () => {
    await Promise.allSettled(storedObjects.map(object => deleteStoredObject(object.location, object.path)))
  }
  input.onRollbackCleanup?.(cleanup)

  try {
    storedObjects.push({ location: originalStorage, path: basePath })
    await putStoredObject(originalStorage, basePath, input.data, mimeType)

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
          storedObjects.push({ location: variantStorage, path: variantPath })
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
  }
  catch (error) {
    await cleanup()
    throw error
  }

  const persist = async ({ database, services }: ArkFileResourceContext) => {
    const file = await services.resource('ark.files').create({
      accessMode,
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
    }) as typeof arkFiles.$inferSelect
    if (file.id !== id || file.path !== basePath)
      throw new Error('File lifecycle changed its storage identity.')

    if (variants.length) {
      await database.insert(arkFileVariants).values(variants.map(variant => ({
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

  try {
    if (context)
      return await persist(context)

    return await withArkResourceTransaction({
      accountability: input.accountability ?? systemArkResourceAccountability(),
      authorization: 'domain',
      database: db,
    }, persist)
  }
  catch (error) {
    await cleanup()
    throw error
  }
}

function safeDispositionFilename(value: string) {
  return value.replace(/[\r\n"]/g, '_')
}

/**
 * Creates a short-lived delivery URL after trusted tenant/domain code has
 * completed its own entitlement checks. This function intentionally performs
 * no authorization and must never be called directly from an untrusted route.
 */
export async function createTrustedArkFileDeliveryUrl(input: {
  disposition?: 'attachment' | 'inline'
  expiresInSeconds?: number
  fileId: string
}) {
  const db = useDatabase()
  const [file] = await db.select().from(arkFiles).where(and(
    eq(arkFiles.id, input.fileId),
    isNull(arkFiles.deletedAt),
  )).limit(1)
  if (!file)
    throw new Error('Ark file not found.')

  const dispositionKind = input.disposition ?? 'attachment'
  const filename = safeDispositionFilename(file.originalFilename || file.filename)
  const disposition = `${dispositionKind}; filename="${filename}"`
  const location = resolveStorageLocation(file.storage)
  if (location.driver === 's3') {
    return signedReadUrl({
      bucket: file.bucket,
      path: file.path,
      storage: file.storage,
    }, {
      disposition,
      expiresInSeconds: input.expiresInSeconds,
    })
  }

  const expiresInSeconds = input.expiresInSeconds ?? location.signedUrlExpiresSeconds
  return buildSignedFileUrl({
    disposition: dispositionKind,
    expires: Math.floor(Date.now() / 1000) + expiresInSeconds,
    id: file.id,
  })
}

/**
 * Permanently removes an Ark object after trusted domain code has established
 * that no entitlement may still deliver it. This performs no authorization.
 */
export async function deleteTrustedArkFileObject(input: {
  allowPublic?: boolean
  expectedStorage?: string
  fileId: string
  now?: Date
}) {
  const db = useDatabase()
  const [file] = await db.select().from(arkFiles).where(and(
    eq(arkFiles.id, input.fileId),
    isNull(arkFiles.deletedAt),
  )).limit(1)
  if (!file)
    return null
  if (input.expectedStorage && file.storage !== input.expectedStorage)
    throw new Error(`Ark file is stored in ${file.storage}, not ${input.expectedStorage}.`)
  if (file.accessMode === 'public' && !input.allowPublic)
    throw new Error('Public Ark files require explicit derivative retirement before object deletion.')
  const now = input.now ?? new Date()
  await deleteStoredObject({ bucket: file.bucket, path: file.path, storage: file.storage })
  registerCoreArkResources()
  try {
    return await withArkResourceTransaction({
      accountability: systemArkResourceAccountability(),
      authorization: 'domain',
      database: db,
    }, ({ services }) => services.resource('ark.files').update(file.id, {
      deletedAt: now,
      updatedAt: now,
    })) as typeof arkFiles.$inferSelect
  }
  catch (error: any) {
    if (error?.code === 'RECORD_NOT_FOUND')
      return file
    throw error
  }
}

async function streamToLimitedBuffer(stream: Readable, maximumBytes: number) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maximumBytes)
      throw new Error(`Image source exceeds the ${maximumBytes} byte derivative limit.`)
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

/** Creates a sanitized, separately-addressable public WebP and its variants. */
export async function createArkPublicImageDerivative(input: {
  metadataJson?: Record<string, unknown>
  ownerArkUserId?: null | string
  sourceFileId: string
}) {
  const db = useDatabase()
  const [source] = await db.select().from(arkFiles).where(and(
    eq(arkFiles.id, input.sourceFileId),
    isNull(arkFiles.deletedAt),
  )).limit(1)
  if (!source)
    throw new Error('Source Ark file not found.')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(source.mimeType.toLowerCase()))
    throw new Error('Public derivatives support JPEG, PNG, and WebP sources only.')
  const maximumBytes = 25_000_000
  if (source.sizeBytes < 1 || source.sizeBytes > maximumBytes)
    throw new Error('Public image derivative source must be no larger than 25 MB.')

  const stream = await readStoredObject({ bucket: source.bucket, path: source.path, storage: source.storage })
  const data = await streamToLimitedBuffer(stream, maximumBytes)
  const sharp = (await import('sharp')).default
  const maximumPixels = 40_000_000
  const image = sharp(data, { failOn: 'error', limitInputPixels: maximumPixels })
  const metadata = await image.metadata()
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > maximumPixels)
    throw new Error('Public image derivative source exceeds the 40 megapixel limit.')
  const sanitized = await image.rotate().webp({ quality: 90 }).toBuffer()
  return storeFileFromBuffer({
    accessMode: 'public',
    data: sanitized,
    metadataJson: {
      ...input.metadataJson,
      derivativeKind: 'sanitized_public_image',
      sourceFileId: source.id,
    },
    mimeType: 'image/webp',
    originalFilename: `${source.id}.webp`,
    ownerArkUserId: input.ownerArkUserId ?? source.ownerArkUserId,
    visibility: 'public',
  })
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
    accountability: {
      arkUserId: arkUser?.id ?? null,
      capabilities: access.capabilities,
      spaceId: targetSpace,
      system: false,
      userId: access.arkUser?.authUserId ?? null,
    },
    data: part.data,
    metadataJson: { spaceId: targetSpace },
    mimeType: part.type,
    originalFilename: part.filename,
    ownerArkUserId: arkUser?.id,
    visibility: options.visibility ?? 'private',
  })
}

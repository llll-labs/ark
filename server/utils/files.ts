import type { Readable } from 'node:stream'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { basename } from 'node:path'
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
  variantVisibility?: 'private' | 'public'
  visibility?: 'private' | 'public'
}

export interface UploadArkFileByUrlInput extends Omit<StoreFileFromBufferInput, 'accessMode' | 'data' | 'variantVisibility' | 'visibility'> {
  maximumBytes?: number
  timeoutMs?: number
  url: string
}

export interface UploadArkFileByUrlDependencies {
  fetcher?: typeof fetch
  resolveHostname?: (hostname: string) => Promise<string[]>
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

const genericRemoteMimeTypes = new Set([
  'application/binary',
  'application/octet-stream',
  'binary/octet-stream',
])

const sharpImageMimeTypes: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  heif: 'image/heif',
  jpeg: 'image/jpeg',
  jp2: 'image/jp2',
  jxl: 'image/jxl',
  png: 'image/png',
  svg: 'image/svg+xml',
  tiff: 'image/tiff',
  webp: 'image/webp',
}

async function remoteFileMimeType(data: Buffer, declaredMimeType?: string) {
  if (declaredMimeType && !genericRemoteMimeTypes.has(declaredMimeType))
    return declaredMimeType
  try {
    const image = await maybeSharp(data)
    const format = (await image?.metadata())?.format
    if (format && sharpImageMimeTypes[format])
      return sharpImageMimeTypes[format]
  }
  catch {
    // Generic remote files that are not readable images remain generic files.
  }
  return declaredMimeType ?? 'application/octet-stream'
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
  const variantVisibility = input.variantVisibility ?? visibility
  const variantStorage = variantVisibility === 'public' ? defaultPublicStorage() : defaultPrivateStorage()
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

const blockedRemoteAddresses = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedRemoteAddresses.addSubnet(address, prefix, 'ipv4')
}
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blockedRemoteAddresses.addSubnet(address, prefix, 'ipv6')
}

async function resolveRemoteHostname(hostname: string) {
  if (isIP(hostname))
    return [hostname]
  return (await lookup(hostname, { all: true, verbatim: true })).map(result => result.address)
}

async function assertRemoteUrlAllowed(url: URL, resolveHostname: (hostname: string) => Promise<string[]>) {
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Remote Ark files require an HTTP or HTTPS URL.')
  if (url.username || url.password)
    throw new Error('Remote Ark file URLs must not contain credentials.')
  if (url.hostname.toLowerCase() === 'localhost' || url.hostname.toLowerCase().endsWith('.localhost'))
    throw new Error('Remote Ark file URL resolves to a private address.')
  const addresses = await resolveHostname(url.hostname)
  if (!addresses.length || addresses.some((address) => {
    const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1]
    if (mappedIpv4)
      return blockedRemoteAddresses.check(mappedIpv4, 'ipv4')
    const family = isIP(address)
    return !family || blockedRemoteAddresses.check(address, family === 6 ? 'ipv6' : 'ipv4')
  })) {
    throw new Error('Remote Ark file URL resolves to a private address.')
  }
}

async function readRemoteResponse(response: Response, maximumBytes: number) {
  const declaredSize = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(declaredSize) && declaredSize > maximumBytes) {
    await response.body?.cancel().catch(() => {})
    throw new Error(`Remote Ark file exceeds ${maximumBytes} bytes.`)
  }
  if (!response.body)
    throw new Error('Remote Ark file response has no body.')

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      return Buffer.concat(chunks)
    size += value.byteLength
    if (size > maximumBytes) {
      await reader.cancel().catch(() => {})
      throw new Error(`Remote Ark file exceeds ${maximumBytes} bytes.`)
    }
    chunks.push(Buffer.from(value))
  }
}

function remoteFilename(url: URL) {
  const value = basename(url.pathname)
  if (!value)
    return undefined
  try {
    return decodeURIComponent(value)
  }
  catch {
    return value
  }
}

/**
 * Imports a trusted remote file as one private Ark original. Image variants are
 * stored in public storage and remain related to that original through
 * ark.file_variants.file_id; the private original itself is never made public.
 */
export async function uploadArkFileByUrl(
  input: UploadArkFileByUrlInput,
  dependencies: UploadArkFileByUrlDependencies = {},
) {
  const maximumBytes = input.maximumBytes ?? 25_000_000
  const timeoutMs = input.timeoutMs ?? 30_000
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw new Error('Remote Ark file maximumBytes must be a positive integer.')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new Error('Remote Ark file timeoutMs must be a positive integer.')

  const fetcher = dependencies.fetcher ?? globalThis.fetch
  const resolveHostname = dependencies.resolveHostname ?? resolveRemoteHostname
  let url = new URL(input.url)
  let response: Response | null = null
  for (let redirects = 0; redirects <= 5; redirects++) {
    await assertRemoteUrlAllowed(url, resolveHostname)
    response = await fetcher(url, {
      headers: { Accept: '*/*' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (![301, 302, 303, 307, 308].includes(response.status))
      break
    const location = response.headers.get('location')
    await response.body?.cancel().catch(() => {})
    if (!location)
      throw new Error(`Remote Ark file redirect ${response.status} has no location.`)
    if (redirects === 5)
      throw new Error('Remote Ark file exceeded 5 redirects.')
    url = new URL(location, url)
  }
  if (!response?.ok) {
    await response?.body?.cancel().catch(() => {})
    throw new Error(`Remote Ark file download failed: ${response?.status ?? 0} ${response?.statusText ?? 'Unknown Error'}`)
  }

  const data = await readRemoteResponse(response, maximumBytes)
  const headerMimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  const {
    maximumBytes: _maximumBytes,
    timeoutMs: _timeoutMs,
    url: _url,
    ...fileInput
  } = input
  const mimeType = input.mimeType ?? await remoteFileMimeType(data, headerMimeType)
  return storeFileFromBuffer({
    ...fileInput,
    accessMode: 'signed_only',
    data,
    mimeType,
    originalFilename: input.originalFilename ?? input.filename ?? remoteFilename(url),
    variantVisibility: 'public',
    visibility: 'private',
  })
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

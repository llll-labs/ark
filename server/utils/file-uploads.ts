import type { H3Event } from 'h3'
import type { useDatabase } from './db'
import { arkFiles, arkFileUploads } from '../../db/schema'
import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm'
import { createError } from 'h3'
import { requireCurrentArkUser } from './authorization'
import { useDatabase as defaultDatabase } from './db'
import { originalFileObjectPath } from './file-paths'
import {
  createDirectUploadUrl,
  deleteStoredObject,
  getStorageConfig,
  headStoredObject,
  resolveStorageLocation,
} from './storage'
import { uuidv7 } from './uuid'

type Database = ReturnType<typeof useDatabase>
type FileAccessMode = 'signed_only' | 'space'

export interface CreateArkFileUploadInput {
  accessMode?: FileAccessMode
  arkUserId: string
  metadataJson?: Record<string, unknown>
  mimeType: string
  originalFilename: string
  sizeBytes: number
  spaceId: string
  storage?: string
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function validateArkFileUploadInput(input: CreateArkFileUploadInput, env: NodeJS.ProcessEnv = process.env) {
  const originalFilename = input.originalFilename.trim()
  const mimeType = input.mimeType.trim().toLowerCase()
  const maxBytes = positiveInteger(env.FILES_DIRECT_UPLOAD_MAX_BYTES, 5_000_000_000)
  if (!originalFilename || originalFilename.length > 512 || /[\r\n]/.test(originalFilename))
    throw createError({ statusCode: 400, statusMessage: 'Upload filename must contain 1-512 characters without line breaks.' })
  if (!mimeType || mimeType.length > 255 || !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(mimeType))
    throw createError({ statusCode: 400, statusMessage: 'Upload MIME type is invalid.' })
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > maxBytes)
    throw createError({ statusCode: 400, statusMessage: `Upload size must be between 1 and ${maxBytes} bytes.` })
  if (input.accessMode && !['signed_only', 'space'].includes(input.accessMode))
    throw createError({ statusCode: 400, statusMessage: 'Direct uploads support only space or signed_only access.' })
  return {
    accessMode: input.accessMode ?? 'space' as FileAccessMode,
    maxBytes,
    mimeType,
    originalFilename,
  }
}

export async function createArkFileUpload(
  input: CreateArkFileUploadInput,
  options: {
    createUploadUrl?: typeof createDirectUploadUrl
    db?: Database
    env?: NodeJS.ProcessEnv
    now?: Date
  } = {},
) {
  const db = options.db ?? defaultDatabase()
  const env = options.env ?? process.env
  const now = options.now ?? new Date()
  const validated = validateArkFileUploadInput(input, env)
  const storageConfig = getStorageConfig()
  const storage = input.storage ?? storageConfig.defaultPrivateLocation
  const location = resolveStorageLocation(storage)
  if (location.driver !== 's3')
    throw createError({ statusCode: 400, statusMessage: `Direct uploads require an S3 storage location; "${storage}" uses ${location.driver}.` })
  if ((storageConfig.defaultPublicLocation !== storageConfig.defaultPrivateLocation && storage === storageConfig.defaultPublicLocation) || location.publicUrl)
    throw createError({ statusCode: 400, statusMessage: 'Untrusted direct uploads cannot target a public storage location.' })

  const fileId = uuidv7()
  const path = originalFileObjectPath(fileId, validated.originalFilename, validated.mimeType)
  const expiresInSeconds = positiveInteger(env.FILES_UPLOAD_URL_EXPIRES, 900)
  if (expiresInSeconds > 3600)
    throw new Error('FILES_UPLOAD_URL_EXPIRES must be between 1 and 3600 seconds.')
  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000)
  const uploadUrl = await (options.createUploadUrl ?? createDirectUploadUrl)(location, path, validated.mimeType, input.sizeBytes, expiresInSeconds)
  const [upload] = await db.insert(arkFileUploads).values({
    accessMode: validated.accessMode,
    bucket: location.bucket,
    expiresAt,
    fileId,
    metadataJson: input.metadataJson ?? {},
    mimeType: validated.mimeType,
    originalFilename: validated.originalFilename,
    ownerArkUserId: input.arkUserId,
    path,
    sizeBytes: input.sizeBytes,
    spaceId: input.spaceId,
    storage,
  }).returning()
  if (!upload)
    throw new Error('Ark file upload session was not created.')

  return {
    accessMode: upload.accessMode,
    expiresAt: upload.expiresAt,
    fileId: upload.fileId,
    headers: { 'Content-Type': upload.mimeType, 'If-None-Match': '*' },
    id: upload.id,
    method: 'PUT' as const,
    uploadUrl,
  }
}

export async function createArkFileUploadForRequest(event: H3Event, input: Omit<CreateArkFileUploadInput, 'arkUserId'>) {
  const { auth, arkUser } = await requireCurrentArkUser(event)
  await auth.requireSpace(input.spaceId, 'files.upload')
  return createArkFileUpload({ ...input, arkUserId: arkUser.id })
}

async function ownedUpload(db: Database, arkUserId: string, uploadId: string) {
  const [upload] = await db.select().from(arkFileUploads).where(and(
    eq(arkFileUploads.id, uploadId),
    eq(arkFileUploads.ownerArkUserId, arkUserId),
    isNull(arkFileUploads.deletedAt),
  )).limit(1)
  if (!upload)
    throw createError({ statusCode: 404, statusMessage: 'File upload session not found.' })
  return upload
}

export async function finalizeArkFileUpload(
  input: { arkUserId: string, uploadId: string },
  options: { db?: Database, headObject?: typeof headStoredObject, now?: Date } = {},
) {
  const db = options.db ?? defaultDatabase()
  const now = options.now ?? new Date()
  const initial = await ownedUpload(db, input.arkUserId, input.uploadId)
  if (initial.status === 'finalized') {
    const [file] = await db.select().from(arkFiles).where(eq(arkFiles.id, initial.fileId)).limit(1)
    if (!file)
      throw new Error('Finalized upload is missing its Ark file.')
    return file
  }
  if (initial.status !== 'pending')
    throw createError({ statusCode: 409, statusMessage: `File upload is ${initial.status}.` })
  if (initial.expiresAt <= now) {
    await db.update(arkFileUploads).set({ status: 'expired', updatedAt: now }).where(eq(arkFileUploads.id, initial.id))
    throw createError({ statusCode: 410, statusMessage: 'File upload session expired.' })
  }

  let object
  try {
    object = await (options.headObject ?? headStoredObject)({ bucket: initial.bucket, path: initial.path, storage: initial.storage })
  }
  catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || ['NoSuchKey', 'NotFound'].includes(error?.name))
      throw createError({ statusCode: 409, statusMessage: 'Uploaded object was not found.' })
    throw error
  }
  if (object.contentLength !== initial.sizeBytes)
    throw createError({ statusCode: 409, statusMessage: 'Uploaded object size does not match the declared size.' })
  const uploadedMimeType = (object.contentType ?? '').split(';', 1)[0]!.trim().toLowerCase()
  if (uploadedMimeType !== initial.mimeType.toLowerCase())
    throw createError({ statusCode: 409, statusMessage: 'Uploaded object MIME type does not match the declared type.' })
  if (!object.etag)
    throw createError({ statusCode: 409, statusMessage: 'Uploaded object does not have a verifiable ETag.' })

  return db.transaction(async (tx: any) => {
    const [upload] = await tx.select().from(arkFileUploads).where(and(
      eq(arkFileUploads.id, initial.id),
      eq(arkFileUploads.ownerArkUserId, input.arkUserId),
      isNull(arkFileUploads.deletedAt),
    )).for('update').limit(1)
    if (!upload)
      throw createError({ statusCode: 404, statusMessage: 'File upload session not found.' })
    if (upload.status === 'finalized') {
      const [file] = await tx.select().from(arkFiles).where(eq(arkFiles.id, upload.fileId)).limit(1)
      if (!file)
        throw new Error('Finalized upload is missing its Ark file.')
      return file
    }
    if (upload.status !== 'pending' || upload.expiresAt <= now)
      throw createError({ statusCode: 409, statusMessage: 'File upload can no longer be finalized.' })

    const [file] = await tx.insert(arkFiles).values({
      accessMode: upload.accessMode,
      bucket: upload.bucket,
      checksum: `etag:${object.etag}`,
      filename: upload.path,
      metadataJson: { ...upload.metadataJson, spaceId: upload.spaceId },
      mimeType: upload.mimeType,
      originalFilename: upload.originalFilename,
      ownerArkUserId: upload.ownerArkUserId,
      path: upload.path,
      sizeBytes: upload.sizeBytes,
      storage: upload.storage,
      visibility: 'private',
      id: upload.fileId,
    }).returning()
    if (!file)
      throw new Error('Ark file was not finalized.')
    await tx.update(arkFileUploads).set({
      etag: object.etag,
      finalizedAt: now,
      status: 'finalized',
      updatedAt: now,
    }).where(eq(arkFileUploads.id, upload.id))
    return file
  })
}

export async function finalizeArkFileUploadForRequest(event: H3Event, uploadId: string) {
  const { auth, arkUser } = await requireCurrentArkUser(event)
  const upload = await ownedUpload(defaultDatabase(), arkUser.id, uploadId)
  if (!upload.spaceId)
    throw createError({ statusCode: 409, statusMessage: 'The upload space no longer exists.' })
  await auth.requireSpace(upload.spaceId, 'files.upload')
  return finalizeArkFileUpload({ arkUserId: arkUser.id, uploadId })
}

export async function abortArkFileUpload(
  input: { arkUserId: string, uploadId: string },
  options: { db?: Database, deleteObject?: typeof deleteStoredObject, now?: Date } = {},
) {
  const db = options.db ?? defaultDatabase()
  const now = options.now ?? new Date()
  const upload = await db.transaction(async (tx: any) => {
    const [current] = await tx.select().from(arkFileUploads).where(and(
      eq(arkFileUploads.id, input.uploadId),
      eq(arkFileUploads.ownerArkUserId, input.arkUserId),
      isNull(arkFileUploads.deletedAt),
    )).for('update').limit(1)
    if (!current)
      throw createError({ statusCode: 404, statusMessage: 'File upload session not found.' })
    if (current.status === 'finalized')
      throw createError({ statusCode: 409, statusMessage: 'A finalized upload cannot be aborted.' })
    if (current.status === 'expired')
      throw createError({ statusCode: 409, statusMessage: 'An expired upload cannot be aborted.' })
    if (current.status === 'aborted')
      return current
    const [aborted] = await tx.update(arkFileUploads).set({
      abortedAt: now,
      status: 'aborted',
      updatedAt: now,
    }).where(eq(arkFileUploads.id, current.id)).returning()
    return aborted!
  })
  if (upload.objectDeletedAt)
    return upload
  // Keep the object in quarantine until its PUT URL has expired. Deleting it
  // earlier would let the still-valid create-only URL recreate an orphan.
  if (upload.expiresAt > now)
    return upload
  await (options.deleteObject ?? deleteStoredObject)({ bucket: upload.bucket, path: upload.path, storage: upload.storage })
  const [deleted] = await db.update(arkFileUploads).set({
    objectDeletedAt: now,
    updatedAt: now,
  }).where(and(
    eq(arkFileUploads.id, upload.id),
    eq(arkFileUploads.status, 'aborted'),
    isNull(arkFileUploads.objectDeletedAt),
  )).returning()
  return deleted ?? upload
}

export async function abortArkFileUploadForRequest(event: H3Event, uploadId: string) {
  const { arkUser } = await requireCurrentArkUser(event)
  return abortArkFileUpload({ arkUserId: arkUser.id, uploadId })
}

/** Deletes abandoned S3 objects and marks their internal sessions expired. */
export async function cleanupExpiredArkFileUploads(
  input: { limit?: number, now?: Date } = {},
  options: { db?: Database, deleteObject?: typeof deleteStoredObject } = {},
) {
  const db = options.db ?? defaultDatabase()
  const now = input.now ?? new Date()
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 1000)
  const uploads = await db.select().from(arkFileUploads).where(and(
    isNull(arkFileUploads.objectDeletedAt),
    isNull(arkFileUploads.deletedAt),
    lte(arkFileUploads.expiresAt, now),
    or(
      eq(arkFileUploads.status, 'pending'),
      inArray(arkFileUploads.status, ['aborted', 'expired']),
    ),
  )).orderBy(asc(arkFileUploads.expiresAt)).limit(limit)

  const expired: string[] = []
  const failed: Array<{ error: string, id: string }> = []
  for (const candidate of uploads) {
    try {
      const upload = await db.transaction(async (tx: any) => {
        const [current] = await tx.select().from(arkFileUploads).where(eq(arkFileUploads.id, candidate.id)).for('update').limit(1)
        if (!current || current.objectDeletedAt || current.status === 'finalized')
          return null
        if (current.status === 'pending') {
          if (current.expiresAt > now)
            return null
          const [expiredUpload] = await tx.update(arkFileUploads).set({ status: 'expired', updatedAt: now }).where(eq(arkFileUploads.id, current.id)).returning()
          return expiredUpload ?? null
        }
        return ['aborted', 'expired'].includes(current.status) ? current : null
      })
      if (!upload)
        continue
      await (options.deleteObject ?? deleteStoredObject)({
        bucket: upload.bucket,
        path: upload.path,
        storage: upload.storage,
      })
      await db.update(arkFileUploads).set({
        objectDeletedAt: now,
        updatedAt: now,
      }).where(and(
        eq(arkFileUploads.id, upload.id),
        eq(arkFileUploads.status, upload.status),
        isNull(arkFileUploads.objectDeletedAt),
      ))
      if (upload.status === 'expired')
        expired.push(upload.id)
    }
    catch (error) {
      failed.push({ error: error instanceof Error ? error.message : String(error), id: candidate.id })
    }
  }
  return { expired, failed }
}

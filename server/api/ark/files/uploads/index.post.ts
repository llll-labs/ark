import { createError, defineEventHandler, readBody } from 'h3'
import { createArkFileUploadForRequest } from '../../../../utils/file-uploads'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  if (typeof body?.spaceId !== 'string' || !body.spaceId)
    throw createError({ statusCode: 400, statusMessage: 'spaceId is required.' })
  if (typeof body.originalFilename !== 'string')
    throw createError({ statusCode: 400, statusMessage: 'originalFilename is required.' })
  if (typeof body.mimeType !== 'string')
    throw createError({ statusCode: 400, statusMessage: 'mimeType is required.' })
  if (typeof body.sizeBytes !== 'number')
    throw createError({ statusCode: 400, statusMessage: 'sizeBytes must be a number.' })
  if (body.storage !== undefined && typeof body.storage !== 'string')
    throw createError({ statusCode: 400, statusMessage: 'storage must be a string.' })
  if (body.accessMode !== undefined && body.accessMode !== 'space' && body.accessMode !== 'signed_only')
    throw createError({ statusCode: 400, statusMessage: 'accessMode must be space or signed_only.' })
  if (body.metadataJson !== undefined && (!body.metadataJson || typeof body.metadataJson !== 'object' || Array.isArray(body.metadataJson)))
    throw createError({ statusCode: 400, statusMessage: 'metadataJson must be an object.' })

  return createArkFileUploadForRequest(event, {
    accessMode: body.accessMode as 'signed_only' | 'space' | undefined,
    mimeType: body.mimeType,
    metadataJson: body.metadataJson as Record<string, unknown> | undefined,
    originalFilename: body.originalFilename,
    sizeBytes: body.sizeBytes,
    spaceId: body.spaceId,
    storage: body.storage as string | undefined,
  })
})

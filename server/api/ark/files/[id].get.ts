import { and, eq } from 'drizzle-orm'
import { createError, defineEventHandler, getQuery, getRouterParam, sendRedirect, sendStream } from 'h3'
import { arkFiles, arkFileVariants } from '../../../../db/schema'
import { createBoundRequestAuth } from '../../../utils/authorization'
import { useDatabase } from '../../../utils/db'
import { publicObjectUrl, readStoredObject, verifySignedFileUrl } from '../../../utils/storage'

function contentDispositionFilename(name: string) {
  return name.replace(/[\r\n"]/g, '_')
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'File id is required.' })

  const db = useDatabase()
  const [file] = await db.select().from(arkFiles).where(eq(arkFiles.id, id)).limit(1)
  if (!file || file.deletedAt)
    throw createError({ statusCode: 404, statusMessage: 'File not found.' })

  const query = getQuery(event)
  const queryVariant = query.variant
  const variantKind = typeof queryVariant === 'string' ? queryVariant : null
  const disposition = typeof query.disposition === 'string' ? query.disposition : null
  const signature = typeof query.sig === 'string' ? query.sig : undefined
  const hasSignedUrlParams = signature || query.expires || query.v
  const signedUrlIsValid = hasSignedUrlParams
    ? verifySignedFileUrl({
        disposition,
        expires: typeof query.expires === 'string' ? query.expires : undefined,
        id: file.id,
        signature,
        variant: variantKind,
        version: typeof query.v === 'string' ? query.v : undefined,
      })
    : false

  if (file.visibility !== 'public' && !signedUrlIsValid) {
    if (hasSignedUrlParams)
      throw createError({ statusCode: 403, statusMessage: 'File signed URL is invalid or expired.' })

    const spaceId = typeof file.metadataJson.spaceId === 'string' ? file.metadataJson.spaceId : null
    const { auth, session } = await createBoundRequestAuth(event)
    if (!session?.user)
      throw createError({ statusCode: 403, statusMessage: 'File access denied.' })
    if (spaceId) {
      const access = await auth.capabilitiesFor(spaceId)
      if (!access.capabilities.includes('files.read'))
        throw createError({ statusCode: 403, statusMessage: 'File access denied.' })
    }
  }

  const [variant] = variantKind
    ? await db.select().from(arkFileVariants).where(and(eq(arkFileVariants.fileId, file.id), eq(arkFileVariants.kind, variantKind))).limit(1)
    : []
  const asset = variant ?? file
  const objectRef = {
    bucket: asset.bucket,
    path: asset.path,
    storage: asset.storage,
  }
  const publicUrl = file.visibility === 'public' ? publicObjectUrl(objectRef) : null
  if (publicUrl)
    return sendRedirect(event, publicUrl, 302)

  event.node.res.setHeader('Content-Type', asset.mimeType)
  event.node.res.setHeader('Content-Length', asset.sizeBytes)
  event.node.res.setHeader('Cache-Control', `${file.visibility === 'public' ? 'public' : 'private'}, max-age=31536000, immutable`)
  if (disposition === 'attachment' || disposition === 'inline') {
    const filename = variant
      ? asset.path.split('/').at(-1) ?? file.filename
      : file.originalFilename || file.filename
    event.node.res.setHeader('Content-Disposition', `${disposition}; filename="${contentDispositionFilename(filename)}"`)
  }
  return sendStream(event, await readStoredObject(objectRef))
})

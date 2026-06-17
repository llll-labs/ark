import { createError, defineEventHandler, readMultipartFormData } from 'h3'
import { storeUploadedFile } from '../../../utils/files'

export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  if (!form?.length)
    throw createError({ statusCode: 400, statusMessage: 'Multipart upload is required.' })

  const spaceId = form.find(part => part.name === 'spaceId')?.data?.toString()
  const rawVisibility = form.find(part => part.name === 'visibility')?.data?.toString()
  const visibility = rawVisibility === 'public' ? 'public' : 'private'
  const uploads = form.filter(part => part.name === 'file' && part.data?.length)
  if (!uploads.length)
    throw createError({ statusCode: 400, statusMessage: 'No file part found.' })

  const files = []
  for (const part of uploads) {
    files.push(await storeUploadedFile(event, {
      data: part.data,
      filename: part.filename,
      type: part.type,
    }, spaceId || undefined, { visibility }))
  }

  return { files }
})

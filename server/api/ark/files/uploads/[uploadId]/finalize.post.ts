import { createError, defineEventHandler, getRouterParam } from 'h3'
import { finalizeArkFileUploadForRequest } from '../../../../../utils/file-uploads'

export default defineEventHandler((event) => {
  const uploadId = getRouterParam(event, 'uploadId')
  if (!uploadId)
    throw createError({ statusCode: 400, statusMessage: 'uploadId is required.' })
  return finalizeArkFileUploadForRequest(event, uploadId)
})

import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { withArkResourceRequest } from '../../../../resources/http'
import { resourceBadRequest } from '../../../../resources/errors'

export default defineEventHandler(event => withArkResourceRequest(event, async ({ service }) => {
  const body = await readBody(event)
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw resourceBadRequest('Request body must be an object.', 'INVALID_PAYLOAD')
  const data = await service.create(body)
  setResponseStatus(event, 201)
  return { data }
}))

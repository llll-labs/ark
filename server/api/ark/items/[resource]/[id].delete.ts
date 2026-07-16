import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3'
import { withArkResourceRequest } from '../../../../resources/http'

export default defineEventHandler(event => withArkResourceRequest(event, async ({ service }) => {
  await service.delete(getRouterParam(event, 'id'))
  setResponseStatus(event, 204)
  return null
}))

import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import { withArkResourceRequest } from '../../../../resources/http'

export default defineEventHandler(event => withArkResourceRequest(event, async ({ service }) => {
  const query = getQuery(event)
  const parsedFields = typeof query.fields === 'string'
    ? query.fields.split(',').map(field => field.trim()).filter(Boolean)
    : []
  const fields = parsedFields.length && !parsedFields.includes('*') ? parsedFields : undefined
  const data = await service.readOne(getRouterParam(event, 'id'), fields)
  return { data }
}))

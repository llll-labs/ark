import { defineEventHandler, getQuery } from 'h3'
import { withArkResourceRequest } from '../../../../resources/http'
import { parseArkResourceQuery } from '../../../../resources/query'

export default defineEventHandler(event => withArkResourceRequest(event, async ({ service }) => {
  const result = await service.readMany(parseArkResourceQuery(getQuery(event)))
  return { data: result.data, meta: result.meta }
}))

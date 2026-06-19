import { createError, defineEventHandler } from 'h3'
import { ensureArkUser, requireAuthUser } from '../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const session = await requireAuthUser(event)

  try {
    const arkUser = await ensureArkUser(session.user)
    return { arkUser, ok: true }
  }
  catch (error) {
    throw createError({
      cause: error,
      statusCode: 409,
      statusMessage: error instanceof Error ? error.message : 'Ark profile could not be completed.',
    })
  }
})

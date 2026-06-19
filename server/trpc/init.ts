import type { H3Event } from 'h3'
import { initTRPC, TRPCError } from '@trpc/server'
import { bindRequestAuth, createRequestAuth } from '../utils/authorization'
import { useDatabase } from '../utils/db'

export async function createTRPCContext(event: H3Event) {
  const db = useDatabase()
  const auth = createRequestAuth(event, db)
  const session = await auth.session()
  bindRequestAuth(session, auth)

  return {
    auth,
    db,
    event,
    session,
  }
}

const t = initTRPC.context<Awaited<ReturnType<typeof createTRPCContext>>>().create()

const requireUser = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    })
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  })
})

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const baseProcedure = t.procedure
export const protectedProcedure = t.procedure.use(requireUser)

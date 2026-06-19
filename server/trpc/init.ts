import type { H3Event } from 'h3'
import { initTRPC, TRPCError } from '@trpc/server'
import { createBoundRequestAuth } from '../utils/authorization'
import { useDatabase } from '../utils/db'

export async function createTRPCContext(event: H3Event) {
  const db = useDatabase()
  const { auth, session } = await createBoundRequestAuth(event, db)

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

const requireArkUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    })
  }

  const arkUser = await ctx.auth.arkUser()
  if (!arkUser) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Ark profile is not provisioned.',
    })
  }

  return next({
    ctx: {
      ...ctx,
      arkUser,
      session: ctx.session,
    },
  })
})

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const arkUserProcedure = t.procedure.use(requireArkUser)
export const baseProcedure = t.procedure
export const protectedProcedure = t.procedure.use(requireUser)

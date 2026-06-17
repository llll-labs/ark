import { createTRPCRouter } from '../init'
import { arkRouter } from './ark'

export const appRouter = createTRPCRouter({
  ark: arkRouter,
})

export type AppRouter = typeof appRouter

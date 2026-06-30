import type { AppRouter } from '../../server/trpc/routers'
import { createTRPCNuxtClient, httpBatchLink } from 'trpc-nuxt/client'

export default defineNuxtPlugin({
  name: 'ark-trpc',
  setup() {
    const trpc = createTRPCNuxtClient<AppRouter>({
      links: [
        httpBatchLink({
          pickHeaders: ['cookie'],
          url: '/api/trpc',
        }),
      ],
    })

    return {
      provide: {
        trpc,
      },
    }
  },
})

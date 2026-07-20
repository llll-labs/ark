import type { DehydratedState } from '@tanstack/vue-query'
import { dehydrate, hydrate, QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        staleTime: 30 * 1000,
      },
    },
  })
  const dehydratedState = useState<DehydratedState | null>('ark-vue-query', () => null)

  if (import.meta.client && dehydratedState.value)
    hydrate(queryClient, dehydratedState.value)

  nuxtApp.vueApp.use(VueQueryPlugin, {
    queryClient,
  })

  if (import.meta.server) {
    nuxtApp.hook('app:rendered', () => {
      dehydratedState.value = dehydrate(queryClient)
    })
  }
})

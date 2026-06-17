import { useWindowSize } from '@vueuse/core'

export function useArkResponsiveFullscreen(breakpoint = 800) {
  const { width } = useWindowSize({ initialWidth: 1024 })

  return {
    isNarrowWindow: computed(() => width.value < breakpoint),
  }
}

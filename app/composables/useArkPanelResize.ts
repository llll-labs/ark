import type { MaybeRefOrGetter } from 'vue'
import { useLocalStorage } from '@vueuse/core'

type ArkResizablePanel = 'menu' | 'side'

const menuWidthKey = 'ark:menu-width'
const sidePanelWidthKey = 'ark:side-panel-width'
const minMenuWidth = 220
const minSidePanelWidth = 320
const maxPanelWidth = 520

function clampWidth(value: number, minWidth: number) {
  return Math.min(maxPanelWidth, Math.max(minWidth, value))
}

export function useArkPanelResize(showSidePanel: MaybeRefOrGetter<boolean> = true) {
  const menuWidth = useLocalStorage(menuWidthKey, 260)
  const sidePanelWidth = useLocalStorage(sidePanelWidthKey, 340)
  const resizingPanel = ref<ArkResizablePanel | null>(null)
  let cleanupResize: (() => void) | undefined

  // Re-clamp any stale/out-of-range persisted values once on the client.
  onMounted(() => {
    menuWidth.value = clampWidth(menuWidth.value, minMenuWidth)
    sidePanelWidth.value = clampWidth(sidePanelWidth.value, minSidePanelWidth)
  })

  const sidePanelVisible = computed(() => toValue(showSidePanel))
  const menuSeparatorWidth = computed(() => resizingPanel.value === 'menu' ? 4 : 1)
  const sideSeparatorWidth = computed(() => resizingPanel.value === 'side' ? 4 : 1)
  const gridTemplateColumns = computed(() =>
    sidePanelVisible.value
      ? `${menuWidth.value}px ${menuSeparatorWidth.value}px minmax(0,1fr) ${sideSeparatorWidth.value}px ${sidePanelWidth.value}px`
      : `${menuWidth.value}px ${menuSeparatorWidth.value}px minmax(0,1fr)`,
  )

  const startResize = (panel: ArkResizablePanel, event: PointerEvent) => {
    if (panel === 'side' && !sidePanelVisible.value)
      return

    event.preventDefault()
    cleanupResize?.()

    const startX = event.clientX
    const startMenuWidth = menuWidth.value
    const startSidePanelWidth = sidePanelWidth.value
    resizingPanel.value = panel
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      if (panel === 'menu') {
        menuWidth.value = clampWidth(startMenuWidth + delta, minMenuWidth)
      }
      else {
        sidePanelWidth.value = clampWidth(startSidePanelWidth - delta, minSidePanelWidth)
      }
    }

    const stopResize = () => {
      resizingPanel.value = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
      cleanupResize = undefined
    }

    cleanupResize = stopResize
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
  }

  watch(sidePanelVisible, (visible) => {
    if (!visible && resizingPanel.value === 'side')
      cleanupResize?.()
  })

  onBeforeUnmount(() => {
    cleanupResize?.()
  })

  return {
    gridTemplateColumns,
    resizingPanel,
    startResize,
  }
}

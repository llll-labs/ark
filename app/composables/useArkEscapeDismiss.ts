import type { Ref } from 'vue'
import { useEventListener } from '@vueuse/core'

type OpenState = Ref<boolean> | (() => boolean)

export function useArkEscapeDismiss(open: OpenState, close?: () => void) {
  const isOpen = () => typeof open === 'function' ? open() : open.value
  const closeOpen = () => {
    if (close) {
      close()
      return
    }
    if (typeof open !== 'function')
      open.value = false
  }

  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    if ((event.key.toLowerCase() !== 'escape' && event.code !== 'Escape') || !isOpen())
      return
    event.stopPropagation()
    closeOpen()
  }, true)

  useEventListener(window, 'pointerdown', (event: PointerEvent) => {
    if (!isOpen() || !(event.target instanceof Element))
      return
    if (!document.querySelector('[data-slot="content"][data-state="open"], [role="dialog"][data-state="open"]'))
      return
    if (event.target.closest('[data-slot="content"], [role="dialog"]'))
      return
    event.stopPropagation()
    closeOpen()
  }, true)
}

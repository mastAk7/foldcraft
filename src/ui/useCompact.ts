import { useSyncExternalStore } from 'react'

const QUERY = '(max-width: 719px)'

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** True on phone-sized viewports. */
export function useCompact() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}

/** True when the viewport is at least `px` wide. */
export function useMinWidth(px: number) {
  const query = `(min-width: ${px}px)`
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => true,
  )
}

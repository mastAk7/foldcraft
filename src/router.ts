import { useSyncExternalStore } from 'react'

/**
 * Minimal History-API routing: the landing page lives at `/`, the consumer world at `/world`.
 * Two routes don't justify a router dependency.
 */
export const WORLD_PATH = '/world'

const NAV_EVENT = 'foldcraft:navigate'

function subscribe(cb: () => void) {
  window.addEventListener('popstate', cb)
  window.addEventListener(NAV_EVENT, cb)
  return () => {
    window.removeEventListener('popstate', cb)
    window.removeEventListener(NAV_EVENT, cb)
  }
}

const normalise = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p)

export function usePath() {
  return useSyncExternalStore(
    subscribe,
    () => normalise(window.location.pathname),
    () => '/',
  )
}

export function navigate(path: string) {
  if (normalise(window.location.pathname) === normalise(path)) return
  window.history.pushState(null, '', path)
  window.dispatchEvent(new Event(NAV_EVENT))
}

export const isWorldPath = (path: string) => path === WORLD_PATH || path.startsWith(`${WORLD_PATH}/`)

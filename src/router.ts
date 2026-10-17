import { useSyncExternalStore } from 'react'

/**
 * Minimal History-API routing: the landing page lives at `/`, the consumer world at `/world`,
 * the Producer Studio at `/studio`. A handful of routes doesn't justify a router dependency.
 */
export const WORLD_PATH = '/world'
export const STUDIO_PATH = '/studio'

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
  if (normalise(window.location.pathname) + window.location.search === normalise(path)) return
  window.history.pushState(null, '', path)
  window.dispatchEvent(new Event(NAV_EVENT))
}

/**
 * A product QR opened by a phone's own camera app lands on `/p/<id>…`. Hand the whole link
 * (query and `#d=` snapshot included) to the consumer world's add flow. Runs once, before render.
 */
export function forwardProductLink() {
  if (!/^\/p\/[^/]+\/?$/.test(window.location.pathname)) return
  window.history.replaceState(null, '', `${WORLD_PATH}?scan=${encodeURIComponent(window.location.href)}&via=qr_link`)
}

export const isWorldPath =(path: string) => path === WORLD_PATH || path.startsWith(`${WORLD_PATH}/`)
export const isStudioPath = (path: string) => path === STUDIO_PATH || path.startsWith(`${STUDIO_PATH}/`)

export type StudioRoute = { view: 'projects' } | { view: 'project'; id: string } | { view: 'report'; id: string }

export function parseStudioPath(path: string): StudioRoute {
  const m = /^\/studio\/([^/]+)(\/report)?$/.exec(path)
  if (!m) return { view: 'projects' }
  const id = decodeURIComponent(m[1])
  return m[2] ? { view: 'report', id } : { view: 'project', id }
}

/** Search params of the current URL, reactive to navigation. */
export function useSearch() {
  return useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => '',
  )
}

/** Replace the query string without adding a history entry. */
export function setSearch(params: Record<string, string | null>) {
  const q = new URLSearchParams(window.location.search)
  for (const [k, v] of Object.entries(params)) {
    if (v === null) q.delete(k)
    else q.set(k, v)
  }
  const s = q.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${s ? `?${s}` : ''}`)
  window.dispatchEvent(new Event(NAV_EVENT))
}

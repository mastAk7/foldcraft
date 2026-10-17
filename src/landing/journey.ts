import { useEffect, useSyncExternalStore } from 'react'
import { STAGES, stageFocus, stageIndexAt, TEXT_FADE } from './content'
import { darkSceneAt } from './timeline'

/**
 * Scroll → progress. One rAF loop owns it: it damps `progress` towards the scroll position,
 * writes per-frame styles straight to the DOM, and only notifies React when the stage changes.
 * The 3D scene reads `journey.progress` inside its own frame loop.
 */
export const journey = {
  /** Raw scroll position as 0..1 of the track. */
  target: 0,
  /** Damped value that the scene and copy follow. */
  progress: 0,
  /** Progress used by the camera (equals `progress`, or a stage still under reduced motion). */
  camera: 0,
  stage: 0,
  reducedMotion: false,
  /** Set while the CTA plays its short push towards the island. */
  exit: 0,
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function useStage() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => journey.stage,
    () => 0,
  )
}

/** Scroll position (px) at which a progress value is reached. */
export function scrollForProgress(track: HTMLElement, p: number) {
  const max = Math.max(1, track.offsetHeight - window.innerHeight)
  return track.offsetTop + p * max
}

export function scrollToStage(track: HTMLElement | null, i: number) {
  if (!track) return
  const top = scrollForProgress(track, stageFocus(i))
  window.scrollTo({ top, behavior: journey.reducedMotion ? 'auto' : 'smooth' })
}

/** Opacity of a stage's copy at progress p (1 inside its text window, fading just outside). */
export function textVisibility(i: number, p: number) {
  const [a, b] = STAGES[i].text
  if (p < a) return i === 0 ? 1 : Math.max(0, 1 - (a - p) / TEXT_FADE)
  if (p > b) return Math.max(0, 1 - (p - b) / TEXT_FADE)
  return 1
}

interface Targets {
  track: HTMLElement | null
  copies: (HTMLElement | null)[]
  gauge: HTMLElement | null
  root: HTMLElement | null
}

/**
 * Drives the journey from native scrolling. Keyboard, touch, anchors and screen readers keep
 * working because the page really scrolls; the scene only interprets the position.
 */
export function useJourneyScroll(targets: () => Targets) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const applyMotion = () => (journey.reducedMotion = mq.matches)
    applyMotion()
    mq.addEventListener('change', applyMotion)

    const read = () => {
      const { track } = targets()
      if (!track) return
      const max = Math.max(1, track.offsetHeight - window.innerHeight)
      journey.target = Math.min(1, Math.max(0, (window.scrollY - track.offsetTop) / max))
    }
    read()
    // Start exactly where the page is (e.g. restored scroll) instead of sweeping there.
    journey.progress = journey.target
    window.addEventListener('scroll', read, { passive: true })
    window.addEventListener('resize', read)

    let raf = 0
    let last = performance.now()
    const lastVis: number[] = []
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const k = journey.reducedMotion ? 1 : 1 - Math.exp(-dt * 7)
      journey.progress += (journey.target - journey.progress) * k
      if (Math.abs(journey.target - journey.progress) < 0.00002) journey.progress = journey.target
      const p = journey.progress

      const stage = stageIndexAt(p)
      // Reduced motion: hold a composed still per stage instead of travelling.
      journey.camera = journey.reducedMotion ? stageFocus(stage) : p
      if (stage !== journey.stage) {
        journey.stage = stage
        emit()
      }

      const { copies, gauge, root } = targets()
      copies.forEach((el, i) => {
        if (!el) return
        const v = textVisibility(i, p)
        if (lastVis[i] !== undefined && Math.abs(lastVis[i] - v) < 0.001) return
        lastVis[i] = v
        // Outgoing copy drifts up, incoming rises from below.
        const dir = p > STAGES[i].text[1] ? -1 : 1
        el.style.opacity = v.toFixed(3)
        el.style.transform = `translate3d(0, ${((1 - v) * dir * 18).toFixed(1)}px, 0)`
        const active = v > 0.04
        if (el.dataset.active !== String(active)) el.dataset.active = String(active)
      })
      // Nav and gauge ink follow what is actually on screen, not the stage boundaries.
      const theme = darkSceneAt(journey.camera) ? 'dark' : 'light'
      if (document.documentElement.dataset.lpTheme !== theme) document.documentElement.dataset.lpTheme = theme
      if (gauge) gauge.style.setProperty('--p', p.toFixed(4))
      if (root) root.style.setProperty('--p', p.toFixed(4))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      delete document.documentElement.dataset.lpTheme
      window.removeEventListener('scroll', read)
      window.removeEventListener('resize', read)
      mq.removeEventListener('change', applyMotion)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

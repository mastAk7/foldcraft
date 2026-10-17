import '@fontsource-variable/manrope'
import './landing.css'
import { Component, lazy, Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { navigate, WORLD_PATH } from '../router'
import { useWorld } from '../services/store'
import { journey, scrollToStage, useJourneyScroll, useStage } from './journey'
import { Footer } from './ui/Footer'
import { Gauge } from './ui/Gauge'
import { Nav } from './ui/Nav'
import { StageCopy } from './ui/StageCopy'

const LandingCanvas = lazy(() => import('./scene/LandingCanvas'))

const SCROLL_KEY = 'foldcraft:landing-scroll'

function detectWebGL(): boolean {
  if (new URLSearchParams(window.location.search).get('webgl') === '0') return false
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('Landing world failed to render', error)
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

const prefetchWorld = () => {
  void import('../App')
  void import('../world/WorldCanvas')
}

export default function LandingPage() {
  const root = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const gauge = useRef<HTMLDivElement>(null)
  const copies = useRef<(HTMLDivElement | null)[]>([])
  const footer = useRef<HTMLElement>(null)
  const stage = useStage()
  const webgl = useMemo(detectWebGL, [])
  const [crashed, setCrashed] = useState(false)
  const [ready, setReady] = useState(false)
  const onboarded = useWorld((s) => s.onboarded)
  const worldName = useWorld((s) => s.worldName)
  const fallback = !webgl || crashed

  // The consumer app locks the page to the viewport; the landing page needs a real scrolling document.
  useLayoutEffect(() => {
    const html = document.documentElement
    html.classList.add('landing')
    const prev = history.scrollRestoration
    history.scrollRestoration = 'manual'
    // Coming back from /world returns to the same point in the journey.
    let saved = 0
    try {
      saved = Number(sessionStorage.getItem(SCROLL_KEY) ?? 0)
      sessionStorage.removeItem(SCROLL_KEY)
    } catch {
      /* storage unavailable */
    }
    if (saved > 0) window.scrollTo(0, saved)
    return () => {
      html.classList.remove('landing')
      history.scrollRestoration = prev
    }
  }, [])

  useJourneyScroll(() => ({ track: track.current, copies: copies.current, gauge: gauge.current, root: root.current }))

  const jump = useCallback((i: number) => scrollToStage(track.current, i), [])

  const enter = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    try {
      sessionStorage.setItem(SCROLL_KEY, String(Math.round(window.scrollY)))
    } catch {
      /* storage unavailable: returning to the top is fine */
    }
    const go = () => {
      journey.exit = 0
      window.scrollTo(0, 0)
      navigate(WORLD_PATH)
    }
    if (journey.reducedMotion || fallback) return go()
    root.current?.setAttribute('data-exiting', '')
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 650)
      journey.exit = t * t * (3 - 2 * t)
      if (t < 1) requestAnimationFrame(step)
      else go()
    }
    requestAnimationFrame(step)
  }, [fallback])

  return (
    <div ref={root} className="lp-root" data-fallback={fallback || undefined} data-ready={ready || fallback || undefined}>
      <a className="lp-skip" href={WORLD_PATH} onClick={enter}>
        Skip to Enter Your World
      </a>

      {/* The world: fixed behind everything, interpreted from scroll position */}
      <div className="lp-stage" aria-hidden>
        <div className="lp-poster" />
        {!fallback && (
          <div className="lp-canvas">
            <SceneBoundary onError={() => setCrashed(true)}>
              <Suspense fallback={null}>
                <LandingCanvas onReady={() => setReady(true)} />
              </Suspense>
            </SceneBoundary>
          </div>
        )}
        <div className="lp-vignette" />
        <div className="lp-curtain" />
      </div>
      {!fallback && !ready && (
        <div className="lp-loading" role="status">
          <span className="lp-loading-block" aria-hidden />
          Building the world…
        </div>
      )}

      <Nav
        onHome={() => window.scrollTo({ top: 0, behavior: journey.reducedMotion ? 'auto' : 'smooth' })}
        onHowItWorks={() => jump(1)}
        onAbout={() => footer.current?.scrollIntoView({ behavior: journey.reducedMotion ? 'auto' : 'smooth' })}
        onEnter={enter}
        onPrefetch={prefetchWorld}
        returning={onboarded ? worldName : null}
      />

      <main>
        <StageCopy ref={copies} onFocusStage={jump} onEnter={enter} onPrefetch={prefetchWorld} onReplay={() => window.scrollTo({ top: 0 })} />
        {/* The scroll track: its height is the length of the journey. */}
        <div ref={track} className="lp-track" />
      </main>

      <Gauge ref={gauge} stage={stage} onJump={jump} />
      <Footer ref={footer} onEnter={enter} onPrefetch={prefetchWorld} />
    </div>
  )
}

import { AnimatePresence } from 'motion/react'
import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { vitality } from './domain/progression'
import { selectItem, useWorld } from './services/store'
import { About } from './ui/About'
import { ActivityLog } from './ui/ActivityLog'
import { AddProductFlow } from './ui/add/AddProductFlow'
import { BeforeYouBuy } from './ui/BeforeYouBuy'
import { CoachPanel } from './ui/CoachPanel'
import { CoachPrompt } from './ui/CoachPrompt'
import { DemoQrSheet } from './ui/DemoQrSheet'
import { ListView } from './ui/ListView'
import { Onboarding } from './ui/Onboarding'
import { ProductPanel } from './ui/ProductPanel'
import { Toasts } from './ui/Toasts'
import { TopBar } from './ui/TopBar'
import { useCompact } from './ui/useCompact'
import { ZoneDock } from './ui/ZoneDock'

const WorldCanvas = lazy(() => import('./world/WorldCanvas'))

function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

class WorldBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('3D world failed to render', error)
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function Loading() {
  return (
    <div className="absolute inset-0 grid place-items-center" role="status">
      <div className="text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 animate-bounce place-items-center rounded-xl bg-[#4f9d5a] shadow-[inset_0_-4px_0_rgba(0,0,0,0.2)]" />
        <p className="font-display text-lg text-ink-2">Building your world…</p>
      </div>
    </div>
  )
}

const SKY_LOW = { top: [185, 222, 240], mid: [220, 239, 244], bottom: [246, 238, 221] }
const SKY_HIGH = { top: [150, 212, 246], mid: [214, 240, 236], bottom: [255, 232, 196] }
const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`

export default function App() {
  const onboarded = useWorld((s) => s.onboarded)
  const listView = useWorld((s) => s.listView)
  const panel = useWorld((s) => s.panel)
  const selectedId = useWorld((s) => s.selectedId)
  const selected = useWorld(selectItem(selectedId))
  const events = useWorld((s) => s.events)
  const compact = useCompact()
  const webgl = useMemo(detectWebGL, [])
  const [crashed, setCrashed] = useState(false)
  const showList = listView || !webgl || crashed
  const sideOpen = !!selected || panel === 'coach' || panel === 'buy' || panel === 'activity'

  // Sky warms as the world recovers.
  const level = useMemo(() => vitality(events).continuous / 5, [events])
  useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--sky-top', mix(SKY_LOW.top, SKY_HIGH.top, level))
    r.setProperty('--sky-mid', mix(SKY_LOW.mid, SKY_HIGH.mid, level))
    r.setProperty('--sky-bottom', mix(SKY_LOW.bottom, SKY_HIGH.bottom, level))
  }, [level])

  return (
    <main className="relative h-full w-full select-none overflow-hidden">
      <h1 className="sr-only">Foldcraft: your product world</h1>
      {webgl && !crashed && (
        <div className="absolute inset-0" style={{ visibility: listView ? 'hidden' : undefined }} aria-hidden={listView || undefined}>
          <WorldBoundary onError={() => setCrashed(true)}>
            <Suspense fallback={<Loading />}>
              <WorldCanvas compact={compact} panelOpen={sideOpen} paused={listView} />
            </Suspense>
          </WorldBoundary>
        </div>
      )}

      {onboarded && showList && (
        <ListView
          reason={
            !webgl
              ? 'Your browser can’t display the 3D world (WebGL is unavailable), so here is the list view. Everything else works the same.'
              : crashed
                ? 'The 3D world hit a problem, so here is the list view instead.'
                : undefined
          }
        />
      )}

      {onboarded && (
        <>
          <TopBar webgl={webgl && !crashed} />
          {!compact && (
            <div className="pointer-events-none absolute left-3 top-[84px] z-20">
              <CoachPrompt />
            </div>
          )}
          {!(compact && (sideOpen || panel)) && (
            <div
              className="safe-bottom pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 px-3 transition-[padding]"
              style={{ paddingRight: sideOpen && !compact ? 424 : undefined }}
            >
              {compact && !showList && <CoachPrompt compact />}
              <ZoneDock showZones={!showList} />
            </div>
          )}
          <Toasts />
        </>
      )}

      <AnimatePresence>
        {selected && <ProductPanel key={`p-${selected.id}`} item={selected} />}
        {!selected && panel === 'coach' && <CoachPanel key="coach" />}
        {!selected && panel === 'buy' && <BeforeYouBuy key="buy" />}
        {!selected && panel === 'activity' && <ActivityLog key="activity" />}
      </AnimatePresence>
      <AnimatePresence>
        {panel === 'add' && <AddProductFlow key="add" />}
        {panel === 'qr' && <DemoQrSheet key="qr" />}
        {panel === 'about' && <About key="about" />}
      </AnimatePresence>

      {!onboarded && <Onboarding />}
    </main>
  )
}

import { AnimatePresence, MotionConfig } from 'motion/react'
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { vitality } from './domain/progression'
import { selectItem, useWorld } from './services/store'
import { About } from './ui/About'
import { ActivityLog } from './ui/ActivityLog'
import { AddProductFlow } from './ui/add/AddProductFlow'
import { BeforeYouBuy } from './ui/BeforeYouBuy'
import { CoachChat } from './ui/CoachChat'
import { CoachPanel } from './ui/CoachPanel'
import { CoachPrompt } from './ui/CoachPrompt'
import { DemoAlerts } from './ui/DemoAlerts'
import { DemoAlertsDialog } from './ui/DemoAlertsDialog'
import { DemoQrSheet } from './ui/DemoQrSheet'
import { GuideCard } from './ui/GuideCard'
import { ItemsPanel } from './ui/ItemsPanel'
import { ListView } from './ui/ListView'
import { Onboarding } from './ui/Onboarding'
import { ProductPanel } from './ui/ProductPanel'
import { LEFT_SHEET, sheetWidth } from './ui/Sheet'
import { Toasts } from './ui/Toasts'
import { TopBar } from './ui/TopBar'
import type { AddMethod } from './domain/types'
import { useCompact, useMinWidth } from './ui/useCompact'
import { useCoarsePointer, WalkHud } from './ui/WalkHud'
import { WalkGuide } from './ui/WalkGuide'
import { ZoneDock } from './ui/ZoneDock'
import { mixRgb, rgb, SKY_HIGH, SKY_LOW } from './world/sky'
import { useWalk } from './world/walk/walkState'

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

const mix = (a: number[], b: number[], t: number) => rgb(mixRgb(a, b, t))

/** A touchpad pinch arrives as ctrl+wheel; over overlay cards it would zoom the whole page. */
const blockPinch = (e: WheelEvent) => {
  if (e.ctrlKey) e.preventDefault()
}
function noPinchZoom(el: HTMLElement | null) {
  // React's onWheel is passive and can't cancel, so listen directly. The listener is idempotent per element.
  el?.addEventListener('wheel', blockPinch, { passive: false })
}

export default function App() {
  const onboarded = useWorld((s) => s.onboarded)
  const listView = useWorld((s) => s.listView)
  const panel = useWorld((s) => s.panel)
  const selectedId = useWorld((s) => s.selectedId)
  const selected = useWorld(selectItem(selectedId))
  const events = useWorld((s) => s.events)
  const guideOpen = useWorld((s) => !s.guide.dismissed)
  const chatKind = useWorld((s) => s.coachChat.kind)
  const compact = useCompact()
  const webgl = useMemo(detectWebGL, [])
  const [crashed, setCrashed] = useState(false)
  // A product link (/world?scan=<payload>&via=...) hands a QR payload to the normal add flow once the world is ready.
  // `via` says how it got here: the phone's camera opening a printed code, or the Producer Studio button.
  const [scan, setScan] = useState<string | null>(() => new URLSearchParams(window.location.search).get('scan'))
  const [scanVia] = useState<AddMethod>(() => (new URLSearchParams(window.location.search).get('via') === 'qr_link' ? 'qr_link' : 'studio_link'))
  useEffect(() => {
    if (!scan || !onboarded) return
    window.history.replaceState(null, '', window.location.pathname)
    useWorld.getState().openPanel('add')
  }, [scan, onboarded])
  const showList = listView || !webgl || crashed
  const walking = useWalk((s) => s.mode === 'walk')
  // Walk mode only exists in the 3D world: the list view, a missing or crashed renderer, or a
  // reset back to onboarding all return to the ordinary view.
  useEffect(() => {
    if (showList || !onboarded) useWalk.getState().exit()
  }, [showList, onboarded])
  const sideOpen = !!selected || panel === 'items' || panel === 'coach' || panel === 'buy' || panel === 'activity'
  // The coach chats open on the left, under their buttons, so the world, help rail and alerts stay in view.
  const chatLeft = !compact && !selected && panel === 'chat'
  const walkGuideOpen = useWalk((s) => s.guideOpen)
  const touch = useCoarsePointer()

  // The help rail (guide, coach suggestion, walk controls, demo alerts) sits on the far right. Beside an
  // open side panel it moves to the panel's left, or steps aside when there isn't room for both; while
  // walking it drops below the centred walk controls when they would otherwise meet.
  // Beside a panel the rail needs room for itself and the toasts to its left.
  const roomBesidePanel = useMinWidth(1180)
  const toastsClearOfRail = useMinWidth(1230)
  const roomBesideWalk = useMinWidth(1260)
  const railHidden = !compact && sideOpen && !roomBesidePanel
  // The walk controls card is the widest thing the rail holds.
  const RAIL_WIDTH = walking && walkGuideOpen ? 440 : 380
  const railStyle = compact
    ? undefined
    : {
        right: sideOpen ? 24 + sheetWidth(!selected && panel === 'coach') : 12,
        top: walking && !showList && (sideOpen || !roomBesideWalk) ? 236 : 72,
      }
  const toastsAside = !!railStyle && !railHidden && (sideOpen || !toastsClearOfRail)

  const scanShown = useRef(false)
  useEffect(() => {
    if (panel === 'add' && scan) scanShown.current = true
    else if (scanShown.current) {
      scanShown.current = false
      setScan(null)
    }
  }, [panel, scan])

  // Sky warms as the world recovers.
  const level = useMemo(() => vitality(events).continuous / 5, [events])
  useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--sky-top', mix(SKY_LOW.top, SKY_HIGH.top, level))
    r.setProperty('--sky-mid', mix(SKY_LOW.mid, SKY_HIGH.mid, level))
    r.setProperty('--sky-bottom', mix(SKY_LOW.bottom, SKY_HIGH.bottom, level))
  }, [level])

  return (
    // Panels, sheets and toasts follow the system "reduce motion" setting, like the 3D world does.
    <MotionConfig reducedMotion="user">
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
          {/* Far right: the first-use guide while it's running, otherwise the single most useful suggestion. */}
          {!railHidden && (
            <div
              ref={noPinchZoom}
              // It takes the wheel itself (scrolling its own cards, never zooming the world behind) and a
              // touchpad pinch over it doesn't zoom the page.
              className={`scroll-thin pointer-events-auto absolute z-20 flex flex-col items-end gap-2 overflow-y-auto overscroll-contain p-2 ${compact ? 'inset-x-1 top-[116px] max-h-[calc(100%-116px-190px)]' : ''}`}
              // Stops above the bottom dock and scrolls if the guide and alerts don't all fit. The 8 px
              // padding (offset outside) keeps card shadows from being clipped by the scroll box.
              style={
                railStyle && {
                  right: railStyle.right - 8,
                  top: railStyle.top - 8,
                  width: RAIL_WIDTH + 16,
                  maxHeight: `calc(100% - ${railStyle.top - 8}px - 190px)`,
                }
              }
              data-testid="help-rail"
            >
              {/* Alerts first, just below the top-right button that raises them. On a phone a panel covers
                  most of the screen, so they wait until it closes. */}
              {!(compact && (sideOpen || panel)) && <DemoAlerts />}
              {guideOpen
                ? // On a phone the walk controls take this space; Help brings the guide back afterwards.
                  !(compact && (sideOpen || panel || walking)) && <GuideCard />
                : !compact && !walking && <CoachPrompt />}
              <AnimatePresence>{walking && !showList && !compact && walkGuideOpen && <WalkGuide key="walk-guide" touch={touch} />}</AnimatePresence>
            </div>
          )}
          {!(compact && (sideOpen || panel)) && (
            <div
              className="safe-bottom pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 px-3 transition-[padding]"
              style={{ paddingRight: sideOpen && !compact ? 424 : undefined, paddingLeft: chatLeft ? LEFT_SHEET.width + 24 : undefined }}
            >
              {compact && !showList && !guideOpen && !walking && <CoachPrompt compact />}
              <ZoneDock showZones={!showList} />
            </div>
          )}
          {walking && !showList && <WalkHud sideOpen={sideOpen} compact={compact} />}
          {/* Moved left of the rail, or on a phone, toasts would sit on the coach buttons: start them below the header. */}
          <Toasts
            avoidRight={toastsAside ? railStyle.right + RAIL_WIDTH + 12 : undefined}
            avoidLeft={chatLeft ? LEFT_SHEET.width + 24 : undefined}
            belowHeader={compact || toastsAside}
          />
        </>
      )}

      <AnimatePresence>
        {selected && <ProductPanel key={`p-${selected.id}`} item={selected} />}
        {!selected && panel === 'items' && <ItemsPanel key="items" />}
        {!selected && panel === 'coach' && <CoachPanel key="coach" />}
        {!selected && panel === 'chat' && <CoachChat key={`chat-${chatKind}`} />}
        {!selected && panel === 'buy' && <BeforeYouBuy key="buy" />}
        {!selected && panel === 'activity' && <ActivityLog key="activity" />}
      </AnimatePresence>
      <AnimatePresence>
        {panel === 'add' && <AddProductFlow key="add" initialPayload={scan ?? undefined} initialVia={scanVia} />}
        {panel === 'qr' && <DemoQrSheet key="qr" />}
        {panel === 'about' && <About key="about" />}
        {panel === 'demo' && <DemoAlertsDialog key="demo" />}
      </AnimatePresence>

      {!onboarded && <Onboarding />}
    </main>
    </MotionConfig>
  )
}

import { CircleHelp, LogOut, Pause, Settings2 } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { ZONE_ORDER, ZONES } from '../domain/storage'
import { useWorld } from '../services/store'
import { LANDMARKS, ZONE_CENTER } from '../world/terrainData'
import { PANEL_SHIFT } from '../world/useViewOffset'
import { SPEEDS, type SpeedName } from '../world/walk/walkGrid'
import { held, pose, useWalk } from '../world/walk/walkState'
import { WalkGuide } from './WalkGuide'
import { ZoneIcon } from './ZoneIcon'

const COARSE = '(pointer: coarse)'
export function useCoarsePointer() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(COARSE)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(COARSE).matches,
    () => false,
  )
}

/** Things the compass points at: the five zones, the outer landmarks and the four directions. */
const MARKS = [
  ...ZONE_ORDER.map((id) => ({ key: id, x: ZONE_CENTER[id][0], z: ZONE_CENTER[id][1], label: ZONES[id].plain, zone: id, color: ZONES[id].color })),
  ...Object.entries(LANDMARKS).map(([key, l]) => ({ key, x: l.x, z: l.z, label: l.name, zone: undefined, color: '#555c6b' })),
]
const CARDINALS = [
  { key: 'N', yaw: 0 },
  { key: 'E', yaw: -Math.PI / 2 },
  { key: 'S', yaw: Math.PI },
  { key: 'W', yaw: Math.PI / 2 },
]
/** The compass shows what's within this angle either side of straight ahead. */
const HALF_SPAN = (75 * Math.PI) / 180
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * A strip that slides as you turn, so you always know which way the zones are. Every place shows
 * as an icon; only the one closest to straight ahead is named, so labels never pile up.
 */
function Compass() {
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = strip.current
      if (el) {
        const w = el.clientWidth
        const place = (node: HTMLElement | null, rel: number) => {
          if (!node) return
          const visible = Math.abs(rel) <= HALF_SPAN
          node.style.opacity = visible ? String(Math.min(1, (1 - Math.abs(rel) / HALF_SPAN) * 4)) : '0'
          node.style.transform = `translateX(${(w / 2 - (rel / HALF_SPAN) * (w / 2)).toFixed(1)}px) translateX(-50%)`
        }
        // Name the place most nearly straight ahead; on a near-tie the closer one wins.
        let ahead: string | null = null
        let best = Infinity
        for (const m of MARKS) {
          const dx = m.x - pose.x
          const dz = m.z - pose.z
          const d = Math.hypot(dx, dz)
          const rel = wrap(Math.atan2(-dx, -dz) - pose.yaw)
          const node = el.querySelector<HTMLElement>(`[data-mark="${m.key}"]`)
          place(node, rel)
          const dist = node?.querySelector<HTMLElement>('[data-dist]')
          if (dist) dist.textContent = `${Math.round(d)} m`
          const score = Math.abs(rel) + d * 0.004
          if (Math.abs(rel) < (22 * Math.PI) / 180 && d > 2 && score < best) {
            best = score
            ahead = m.key
          }
        }
        for (const m of MARKS) {
          const node = el.querySelector<HTMLElement>(`[data-mark="${m.key}"] [data-name]`)
          if (node) node.style.display = m.key === ahead ? '' : 'none'
        }
        for (const c of CARDINALS) place(el.querySelector<HTMLElement>(`[data-mark="${c.key}"]`), wrap(c.yaw - pose.yaw))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div
      ref={strip}
      className="walk-compass relative h-[58px] w-[min(520px,calc(100vw-24px))] overflow-hidden rounded-xl bg-white/80 shadow-sm backdrop-blur"
      aria-hidden
    >
      <div className="absolute inset-y-1 left-1/2 w-px bg-ink/25" />
      {CARDINALS.map((c) => (
        <span key={c.key} data-mark={c.key} className="absolute left-0 top-0.5 font-display text-[11px] text-ink-3">
          {c.key}
        </span>
      ))}
      {MARKS.map((m) => (
        <span key={m.key} data-mark={m.key} className="absolute left-0 top-[15px] flex flex-col items-center whitespace-nowrap text-[12px] font-semibold" style={{ color: m.color }}>
          <span className="grid h-5 w-5 place-items-center rounded-md bg-white shadow-[0_1px_0_rgba(0,0,0,0.12)]">
            {m.zone ? <ZoneIcon zone={m.zone} size={12} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
          </span>
          <span data-name className="mt-0.5 rounded-md bg-white px-1 leading-tight">
            {m.label} <span data-dist className="font-normal text-ink-3" />
          </span>
        </span>
      ))}
    </div>
  )
}

function Settings() {
  const prefs = useWalk((s) => s.prefs)
  const setPrefs = useWalk((s) => s.setPrefs)
  return (
    <div role="group" aria-label="Walk settings" className="panel panel-solid pointer-events-auto w-[min(320px,calc(100vw-24px))] p-3 text-[13px]">
      <label className="block font-semibold" htmlFor="walk-look">
        Look speed
      </label>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-ink-3">Slower</span>
        <input
          id="walk-look"
          type="range"
          min={0.4}
          max={2}
          step={0.1}
          value={prefs.look}
          onChange={(e) => setPrefs({ look: Number(e.target.value) })}
          className="min-w-0 flex-1"
        />
        <span className="text-ink-3">Faster</span>
      </div>
      <div className="mt-3 font-semibold" id="walk-speed-label">
        Walking speed
      </div>
      <div className="mt-1 flex gap-1" role="radiogroup" aria-labelledby="walk-speed-label">
        {(Object.keys(SPEEDS) as SpeedName[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={prefs.speed === k}
            className={`btn btn-sm flex-1 capitalize ${prefs.speed === k ? 'btn-primary' : ''}`}
            onClick={() => setPrefs({ speed: k })}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Hold-to-walk arrows for touch screens; dragging on the world looks around. */
function TouchPad() {
  const bind = (code: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      held.down(code)
    },
    onPointerUp: () => held.up(code),
    onPointerCancel: () => held.up(code),
    onLostPointerCapture: () => held.up(code),
  })
  const cls = 'grid h-12 w-12 place-items-center rounded-xl bg-white/85 text-lg font-bold shadow-sm backdrop-blur active:bg-white select-none touch-none'
  return (
    <div className="pointer-events-auto grid grid-cols-3 gap-1" aria-label="Walk controls">
      <span />
      <button type="button" className={cls} aria-label="Walk forward" {...bind('KeyW')}>
        ▲
      </button>
      <span />
      <button type="button" className={cls} aria-label="Step left" {...bind('KeyA')}>
        ◀
      </button>
      <button type="button" className={cls} aria-label="Walk back" {...bind('KeyS')}>
        ▼
      </button>
      <button type="button" className={cls} aria-label="Step right" {...bind('KeyD')}>
        ▶
      </button>
    </div>
  )
}

/** Everything drawn over the world while walking. The product panels themselves are unchanged. */
export function WalkHud({ sideOpen, compact }: { sideOpen: boolean; compact: boolean }) {
  const guideOpen = useWalk((s) => s.guideOpen)
  const settingsOpen = useWalk((s) => s.settingsOpen)
  const id = useWalk((s) => s.hoverId ?? s.targetId)
  const item = useWorld((s) => (id ? s.items.find((i) => i.id === id) : undefined))
  const paused = useWorld((s) => !!s.selectedId || !!s.panel)
  const touch = useCoarsePointer()
  const { exit, openGuide, openSettings } = useWalk.getState()
  // The reticle sits where the camera is pointing, which shifts left beside the desktop side panel.
  const centre = sideOpen && !compact ? `calc(50% - ${PANEL_SHIFT}px)` : '50%'

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-[76px] z-20 flex flex-col items-center gap-2 px-3">
        <div className="pointer-events-auto flex flex-wrap justify-center gap-1.5">
          <button type="button" className="btn panel h-10 !rounded-xl px-3 text-[13.5px]" onClick={exit}>
            <LogOut size={16} aria-hidden /> Leave walk mode <kbd className="walk-key walk-key-sm">Esc</kbd>
          </button>
          <button type="button" className="btn panel h-10 !rounded-xl px-3 text-[13.5px]" aria-expanded={guideOpen} onClick={() => openGuide(!guideOpen)}>
            <CircleHelp size={16} aria-hidden /> Controls
          </button>
          <button
            type="button"
            className="btn panel h-10 !rounded-xl px-3 text-[13.5px]"
            aria-expanded={settingsOpen}
            onClick={() => openSettings(!settingsOpen)}
          >
            <Settings2 size={16} aria-hidden /> <span className="max-sm:sr-only">Settings</span>
          </button>
        </div>
        {!compact || !sideOpen ? <Compass /> : null}
        {paused && (
          <div className="panel pointer-events-auto flex items-center gap-2 px-3 py-1.5 text-[13px]" role="status">
            <Pause size={14} aria-hidden /> Walking is paused while a panel is open. Close it (Esc) to keep walking.
          </div>
        )}
        <AnimatePresence>
          {/* On wider screens the controls card sits in the help rail on the right (see App). */}
          {guideOpen && compact && <WalkGuide key="guide" touch={touch} />}
        </AnimatePresence>
        {settingsOpen && <Settings />}
      </div>

      {/* Reticle and what it would open. */}
      <div className="pointer-events-none absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: centre }} aria-hidden>
        <div className={`walk-reticle ${item ? 'walk-reticle-on' : ''}`} />
      </div>
      <div className="pointer-events-none absolute top-1/2 z-10 mt-6 -translate-x-1/2" style={{ left: centre }} role="status" aria-live="polite">
        {item && !paused && (
          <div className="panel flex items-center gap-2 whitespace-nowrap px-3 py-1.5 text-[13.5px]" data-testid="walk-target">
            <strong>{item.record.name}</strong>
            <span className="text-ink-2">{touch ? 'Tap to open' : <>Press <kbd className="walk-key walk-key-sm">E</kbd> or click to open</>}</span>
          </div>
        )}
      </div>

      {touch && !paused && (
        // Above the bottom bar, which wraps to more rows on a phone.
        <div className={`pointer-events-none absolute left-3 z-20 ${compact ? 'bottom-[300px]' : 'bottom-[170px]'}`}>
          <TouchPad />
        </div>
      )}
    </>
  )
}

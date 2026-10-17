import { useEffect, useMemo, useRef } from 'react'

/**
 * Playback clock shared by a scene (writer, inside the canvas frame loop) and the timeline (reader).
 * Kept outside React state so only the timeline re-renders while a scene plays.
 */
export interface SceneClock {
  get(): number
  set(t: number): void
  subscribe(cb: () => void): () => void
}

export function makeClock(): SceneClock {
  let t = 0
  const subs = new Set<() => void>()
  return {
    get: () => t,
    set(next) {
      if (Math.abs(next - t) < 1e-4) return
      t = next
      subs.forEach((f) => f())
    },
    subscribe(cb) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
  }
}

export interface Series {
  label: string
  unit: string
  color: string
  values: number[]
  digits?: number
}

function idx(t: number[], time: number) {
  let lo = 0
  let hi = t.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (t[mid] <= time) lo = mid
    else hi = mid - 1
  }
  return lo
}

/**
 * Small multiples of the model's own trace with a playhead synced to the scene. Each row is scaled
 * to its own range; the current value is printed so nothing has to be read off the curve.
 * The curves are built once per trace; the playhead and readouts are written straight to the DOM on
 * each clock tick, so playback causes no React renders.
 */
export function TraceTimeline({ t, series, clock, markers = [], ticks, tickLabel, note }: { t: number[]; series: Series[]; clock: SceneClock; markers?: { t: number; label: string }[]; ticks?: number[]; tickLabel?: string; note?: string }) {
  const t0 = t[0] ?? 0
  const t1 = t[t.length - 1] ?? 1
  const W = 1000
  const ROW = 30
  const H = series.length * ROW + (ticks ? 8 : 0)
  const timeRef = useRef<HTMLSpanElement>(null)
  const headRef = useRef<SVGLineElement>(null)
  const valueRefs = useRef<(HTMLSpanElement | null)[]>([])

  const curves = useMemo(() => {
    const x = (v: number) => ((v - t0) / (t1 - t0 || 1)) * W
    const step = Math.max(1, Math.floor(t.length / 500))
    const paths = series.map((s, r) => {
      let lo = Infinity
      let hi = -Infinity
      for (const v of s.values) {
        lo = Math.min(lo, v)
        hi = Math.max(hi, v)
      }
      const span = hi - lo || 1
      const y = (v: number) => r * ROW + ROW - 3 - ((v - lo) / span) * (ROW - 6)
      let d = ''
      for (let k = 0; k < s.values.length; k += step) d += `${k ? 'L' : 'M'}${x(t[k]).toFixed(1)},${y(s.values[k]).toFixed(1)}`
      return { label: s.label, color: s.color, d, r }
    })
    // Merge tick runs into one path instead of one element per sample.
    let tickPath = ''
    if (ticks) for (let k = 0; k < ticks.length; k++) if (ticks[k]) tickPath += `M${x(t[k]).toFixed(1)},${H - 6}h2v5h-2z`
    return { paths, tickPath, markerX: markers.map((m) => x(m.t)) }
  }, [t, t0, t1, series, ticks, markers, H])

  useEffect(() => {
    const update = () => {
      const time = clock.get()
      const i = idx(t, time)
      if (timeRef.current) timeRef.current.textContent = `${time.toFixed(3)} s`
      series.forEach((s, k) => {
        const el = valueRefs.current[k]
        if (el) el.textContent = `${(s.values[i] ?? 0).toFixed(s.digits ?? 1)} ${s.unit}`
      })
      const px = String(((time - t0) / (t1 - t0 || 1)) * W)
      headRef.current?.setAttribute('x1', px)
      headRef.current?.setAttribute('x2', px)
    }
    update()
    return clock.subscribe(update)
  }, [clock, t, t0, t1, series])

  return (
    <div className="border-t border-line bg-white/95 px-2 py-1.5 text-[11px]" aria-label="Model trace timeline">
      <div className="flex items-center justify-between gap-2 text-ink-3">
        <span>
          Model trace · t = <span ref={timeRef} className="tabular-nums text-ink" />
        </span>
        {note && <span className="truncate">{note}</span>}
      </div>
      <div className="mt-0.5 flex gap-2">
        <ul className="w-[148px] shrink-0 space-y-0" aria-hidden>
          {series.map((s, k) => (
            <li key={s.label} className="flex h-[30px] items-center justify-between gap-1 leading-tight">
              <span className="flex items-center gap-1 text-ink-2">
                <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
                {s.label}
              </span>
              <span ref={(el) => void (valueRefs.current[k] = el)} className="tabular-nums font-semibold" />
            </li>
          ))}
        </ul>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-auto min-w-0 flex-1" style={{ height: H }} role="img" aria-label={`Trace of ${series.map((s) => s.label).join(', ')} over ${(t1 - t0).toFixed(2)} s`}>
          {curves.paths.map((c) => (
            <g key={c.label}>
              <line x1={0} x2={W} y1={c.r * ROW + ROW} y2={c.r * ROW + ROW} stroke="#e7dfcd" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <path d={c.d} fill="none" stroke={c.color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          {ticks && curves.tickPath && <path d={curves.tickPath} fill="#c4613b" aria-label={tickLabel} />}
          {markers.map((m, k) => (
            <line key={m.label} x1={curves.markerX[k]} x2={curves.markerX[k]} y1={0} y2={H} stroke="#6d6553" strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <line ref={headRef} x1={0} x2={0} y1={0} y2={H} stroke="#1f2a24" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      {(markers.length > 0 || ticks) && (
        <div className="mt-0.5 flex flex-wrap gap-x-3 pl-[156px] text-ink-3">
          {markers.map((m) => (
            <span key={m.label}>
              ┊ {m.label} ({m.t.toFixed(3)} s)
            </span>
          ))}
          {ticks && tickLabel && (
            <span>
              <span className="inline-block h-2 w-[2px] bg-clay align-middle" /> {tickLabel}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

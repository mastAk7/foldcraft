import { Download } from 'lucide-react'
import { dielineSvg } from '../domain/dieline'
import type { Dieline } from '../domain/types'
import { download } from '../ui'

/** 2D flat blank of the folding carton, drawn from the same parameters as the 3D model. */
export function DielineView({ dieline, title }: { dieline: Dieline; title: string }) {
  const pad = 14
  const vb = `${-pad} ${-pad} ${dieline.width + pad * 2} ${dieline.height + pad * 2}`
  return (
    <div className="studio-blueprint flex h-full flex-col px-4 pb-32 pt-12">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-2">
        <span>
          <span className="mr-3 inline-flex items-center gap-1">
            <span className="inline-block h-0.5 w-5 bg-[#c0392b]" /> Cut
          </span>
          <span className="mr-3 inline-flex items-center gap-1">
            <span className="inline-block h-0 w-5 border-t-2 border-dashed border-[#2f78b7]" /> Crease
          </span>
          Blank {Math.round(dieline.width)} × {Math.round(dieline.height)} mm · net area {(dieline.netAreaMm2 / 1e4).toFixed(0)} cm² · <strong>Concept dieline</strong>, not validated for production tooling.
        </span>
        <button type="button" className="btn btn-sm" onClick={() => download(`${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-dieline.svg`, dielineSvg(dieline, title), 'image/svg+xml')}>
          <Download size={14} aria-hidden /> Download SVG
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <svg viewBox={vb} className="h-full w-full" role="img" aria-label={`Concept dieline, ${Math.round(dieline.width)} by ${Math.round(dieline.height)} millimetres`}>
          {dieline.panels.map((p) => (
            <polygon key={p.id} points={p.polygon.map(([x, y]) => `${x},${y}`).join(' ')} fill={p.id.includes('glue') ? '#efe4cc' : '#fffaf0'} stroke="none" />
          ))}
          {dieline.cuts.map(([a, b], i) => (
            <line key={`c${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#c0392b" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          ))}
          {dieline.creases.map(([a, b], i) => (
            <line key={`k${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#2f78b7" strokeWidth={0.8} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
    </div>
  )
}

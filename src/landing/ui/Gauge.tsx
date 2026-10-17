import { forwardRef } from 'react'
import { STAGES } from '../content'

/**
 * Quiet progress indicator. The fill and marker read `--p` (written by the journey loop);
 * the active label only changes when the stage changes.
 */
export const Gauge = forwardRef<HTMLDivElement, { stage: number; onJump: (i: number) => void }>(function Gauge({ stage, onJump }, ref) {
  return (
    <div ref={ref} className="lp-gauge">
      <nav aria-label="Journey stages">
        <ol className="lp-gauge-list">
          {STAGES.map((s, i) => (
            <li key={s.id} style={{ top: `${s.range[0] * 100}%` }}>
              <button
                type="button"
                className="lp-gauge-tick"
                data-on={i <= stage || undefined}
                aria-current={i === stage ? 'step' : undefined}
                onClick={() => onJump(i)}
                style={{ '--swatch': s.swatch } as React.CSSProperties}
              >
                <span className="lp-gauge-label">{s.name}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="lp-gauge-rail" aria-hidden>
        <div className="lp-gauge-fill" />
      </div>
      <div className="lp-gauge-now" aria-hidden>
        <span className="lp-gauge-now-num">{String(stage + 1).padStart(2, '0')}</span>
        <span>{STAGES[stage].name}</span>
      </div>
    </div>
  )
})

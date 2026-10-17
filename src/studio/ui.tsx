import { AlertTriangle, CheckCircle2, CircleAlert, Info } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import type { Bound } from './domain/params'
import type { ResultMethod, Risk } from './domain/types'

/* ---------------------------------------------------------------- method + risk */

export const METHOD_META: Record<ResultMethod, { label: string; title: string; cls: string }> = {
  calculated: { label: 'Calculated', title: 'Deterministic calculation from the generated geometry and stated inputs.', cls: 'border-frost/25 bg-frost-2 text-frost' },
  simplified_estimate: { label: 'Estimate', title: 'Simplified estimate built on assumed coefficients. Shows trends, not certified values.', cls: 'border-amber/25 bg-amber-2 text-amber' },
  simplified_motion_model: { label: 'Motion model', title: 'Simplified spring–damper motion model integrated in time. Not a physics engine and not FEA.', cls: 'border-clay/25 bg-clay-2 text-clay' },
  illustrative: { label: 'Illustrative', title: 'Visual illustration only. Not a measurement.', cls: 'border-black/10 bg-black/5 text-ink-2' },
}

export function MethodBadge({ method }: { method: ResultMethod }) {
  const m = METHOD_META[method]
  return (
    <span className={`chip ${m.cls}`} title={m.title}>
      {m.label}
    </span>
  )
}

const RISK_META: Record<Risk, { label: string; cls: string; Icon: typeof Info; bars: number }> = {
  low: { label: 'Low', cls: 'text-moss bg-moss-2 border-moss/25', Icon: CheckCircle2, bars: 1 },
  moderate: { label: 'Moderate', cls: 'text-amber bg-amber-2 border-amber/30', Icon: CircleAlert, bars: 2 },
  high: { label: 'High', cls: 'text-rose bg-rose-2 border-rose/30', Icon: AlertTriangle, bars: 3 },
}

/** Risk is shown with text, an icon and a bar count, never colour alone. */
export function RiskChip({ risk, prefix = 'Est. risk' }: { risk: Risk; prefix?: string }) {
  const m = RISK_META[risk]
  return (
    <span className={`chip ${m.cls}`}>
      <m.Icon size={12} aria-hidden />
      {prefix}: {m.label}
      <span className="ml-0.5 inline-flex gap-[2px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="inline-block h-2 w-1 rounded-[1px]" style={{ background: i < m.bars ? 'currentColor' : 'rgba(0,0,0,0.12)' }} />
        ))}
      </span>
    </span>
  )
}

/* ---------------------------------------------------------------- inputs */

/**
 * Numeric input with units and bounds. Typing is free; the value is only committed when it is valid,
 * otherwise an inline message explains the problem and the last valid value stays in force.
 */
export function NumberField({
  label,
  value,
  onCommit,
  bound,
  hint,
  error,
  slider = true,
  disabled,
}: {
  label: string
  value: number
  onCommit: (v: number) => void
  bound: Bound
  hint?: ReactNode
  /** External validation message (e.g. cross-parameter check) for the current value. */
  error?: string
  slider?: boolean
  disabled?: boolean
}) {
  const id = useId()
  const [text, setText] = useState(String(value))
  const [local, setLocal] = useState<string | null>(null)
  useEffect(() => {
    setText(String(value))
    setLocal(null)
  }, [value])

  const commit = (raw: string) => {
    const n = Number(raw.replace(',', '.'))
    if (raw.trim() === '' || !Number.isFinite(n)) return setLocal(`${label} must be a number.`)
    if (n < bound.min || n > bound.max) return setLocal(`${label} must be between ${bound.min} and ${bound.max}${bound.unit ? ` ${bound.unit}` : ''}. Keeping ${value}${bound.unit ? ` ${bound.unit}` : ''}.`)
    setLocal(null)
    if (n !== value) onCommit(n)
  }
  const msg = local ?? error
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-semibold text-ink-2">
          {label}
        </label>
        <div className="flex items-center gap-1">
          <input
            id={id}
            inputMode="decimal"
            className={`field h-8 min-h-0 w-[78px] px-2 py-0 text-right text-[13px] tabular-nums ${msg ? 'border-rose' : ''}`}
            value={text}
            disabled={disabled}
            aria-invalid={!!msg}
            aria-describedby={msg ? `${id}-err` : undefined}
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
            }}
          />
          <span className="w-7 text-[11.5px] text-ink-3">{bound.unit}</span>
        </div>
      </div>
      {slider && (
        <input
          type="range"
          aria-label={`${label} slider`}
          className="studio-range mt-1 w-full"
          min={bound.min}
          max={bound.max}
          step={bound.step}
          value={Math.min(bound.max, Math.max(bound.min, value))}
          disabled={disabled}
          onChange={(e) => onCommit(Number(e.target.value))}
        />
      )}
      {hint && !msg && <p className="mt-0.5 text-[11.5px] text-ink-3">{hint}</p>}
      {msg && (
        <p id={`${id}-err`} role="alert" className="mt-1 rounded-md bg-rose-2 px-2 py-1 text-[11.5px] text-rose">
          {msg}
        </p>
      )}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label, size = 'md' }: { value: T; options: { id: T; label: ReactNode; disabled?: boolean }[]; onChange: (v: T) => void; label: string; size?: 'sm' | 'md' }) {
  return (
    <div className="grid gap-1 rounded-xl bg-black/5 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          disabled={o.disabled}
          onClick={() => onChange(o.id)}
          className={`rounded-lg px-2 font-semibold transition disabled:opacity-40 ${size === 'sm' ? 'min-h-[30px] text-[12px]' : 'min-h-[36px] text-[13px]'} ${value === o.id ? 'bg-white text-moss shadow-sm' : 'text-ink-2 hover:bg-white/60'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 py-1.5 ${disabled ? 'opacity-50' : ''}`}>
      <input type="checkbox" className="studio-check mt-0.5" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-ink-2">{label}</span>
        {hint && <span className="block text-[11.5px] text-ink-3">{hint}</span>}
      </span>
    </label>
  )
}

export function Field({ label, children, hint, error, htmlFor, optional }: { label: ReactNode; children: ReactNode; hint?: ReactNode; error?: string; htmlFor?: string; optional?: boolean }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1 flex items-baseline gap-1.5 text-[13px] font-semibold text-ink-2">
        {label}
        {optional && <span className="text-[11px] font-normal text-ink-3">optional</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[11.5px] text-ink-3">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-[12px] font-medium text-rose">
          {error}
        </p>
      )}
    </div>
  )
}

/** Panel group heading with a pixel-block marker, the studio's quiet voxel accent. */
export function GroupTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-1.5 mt-4 flex items-center justify-between gap-2 first:mt-0">
      <h3 className="eyebrow flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-[2px] bg-moss/70 shadow-[2px_2px_0_rgba(47,107,79,0.25)]" aria-hidden />
        {children}
      </h3>
      {aside}
    </div>
  )
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'error' | 'success'; children: ReactNode }) {
  const cls = {
    info: 'border-frost/20 bg-frost-2/70 text-ink-2',
    warning: 'border-amber/30 bg-amber-2 text-ink-2',
    error: 'border-rose/30 bg-rose-2 text-rose',
    success: 'border-moss/25 bg-moss-2 text-ink-2',
  }[tone]
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle
  return (
    <div className={`flex gap-2 rounded-xl border px-3 py-2 text-[12.5px] leading-snug ${cls}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon size={15} className="mt-[1px] shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function fmt(n: number, digits = 1) {
  if (!Number.isFinite(n)) return '–'
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function download(filename: string, content: string | Blob, type = 'application/octet-stream') {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

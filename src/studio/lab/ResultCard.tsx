import { ChevronDown, Wand2 } from 'lucide-react'
import { useState } from 'react'
import type { SimResult, Suggestion } from '../domain/types'
import { fmt, MethodBadge, RiskChip } from '../ui'

const TEST_LABEL = { drop: 'Drop test', stack: 'Stack pressure', vibration: 'Transport vibration' }

export function ResultCard({ result, onApply, compact }: { result: SimResult; onApply?: (s: Suggestion) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <article className="rounded-xl border border-line bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <h3 className="text-[13px] font-bold">{TEST_LABEL[result.test]}</h3>
        <MethodBadge method={result.method} />
      </div>
      <p className="mt-1 text-[14px] font-semibold leading-snug">{result.headline}</p>
      <div className="mt-1.5">
        <RiskChip risk={result.risk} />
      </div>
      {!compact && (
        <dl className="mt-2 divide-y divide-line text-[12.5px]">
          {result.metrics.map((m) => (
            <div key={m.key} className="flex items-center justify-between gap-2 py-1.5">
              <dt className="text-ink-2">{m.label}</dt>
              <dd className="flex items-center gap-1.5 tabular-nums">
                <strong>
                  {fmt(m.value, m.digits ?? 1)} {m.unit}
                </strong>
                <span title={m.method === 'calculated' ? 'Calculated' : 'Model output'} className={`inline-block h-2 w-2 rounded-[2px] ${m.method === 'calculated' ? 'bg-frost' : m.method === 'simplified_estimate' ? 'bg-amber' : 'bg-clay'}`} aria-hidden />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {result.concerns.length > 0 && (
        <div className="mt-2">
          <h4 className="eyebrow mb-1">Concerns in this model</h4>
          <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-ink-2">
            {result.concerns.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {result.failureModes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {result.failureModes.map((f) => (
            <span key={f} className="chip border-rose/20 bg-rose-2 text-rose">
              {f}
            </span>
          ))}
        </div>
      )}
      {onApply && result.suggestions.length > 0 && (
        <div className="mt-2.5">
          <h4 className="eyebrow mb-1">Suggested changes</h4>
          <ul className="space-y-1.5">
            {result.suggestions.map((s) => (
              <li key={s.id} className="rounded-lg bg-black/[0.03] p-2">
                <div className="text-[12.5px] font-semibold">{s.title}</div>
                <div className="text-[12px] text-ink-3">{s.reason}</div>
                <button type="button" className="btn btn-sm mt-1" onClick={() => onApply(s)}>
                  <Wand2 size={13} aria-hidden /> Apply &amp; re-run
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" className="btn btn-ghost btn-sm mt-2 w-full justify-between" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Assumptions &amp; limits <ChevronDown size={14} className={open ? 'rotate-180' : ''} aria-hidden />
      </button>
      {open && (
        <div className="text-[12px] text-ink-2">
          <ul className="list-disc space-y-1 pl-4">
            {result.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-3">
            {result.limitations.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

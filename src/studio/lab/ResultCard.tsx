import { ArrowRight, ChevronDown, Wand2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { SlimResult } from '../domain/runs'
import type { Metric, Risk, SimResult, SimTest, Suggestion } from '../domain/types'
import { fmt, MethodBadge, RiskChip } from '../ui'

export const TEST_LABEL: Record<SimTest, string> = { drop: 'Drop test', stack: 'Stack pressure', vibration: 'Transport vibration' }

const m = (r: Pick<SimResult, 'metrics'>, key: string) => r.metrics.find((x) => x.key === key)
const val = (x: Metric | undefined) => (x ? `${fmt(x.value, x.digits ?? 1)} ${x.unit}` : '–')

/** The one modelled response a producer should read first, with the reference it is judged against. */
export function primaryResponse(r: Pick<SimResult, 'test' | 'metrics'>): { label: string; value: string; reference: string } {
  if (r.test === 'drop') return { label: 'Peak deceleration on a unit', value: val(m(r, 'prodG')), reference: `assumed sensitivity ${val(m(r, 'threshold'))}` }
  if (r.test === 'stack') {
    const tip = m(r, 'com')
    return { label: 'Margin on the bottom pack', value: val(m(r, 'margin')), reference: `≥1.2× reads as low risk${tip && tip.value > 0 ? ` · centre-of-mass offset ${val(tip)}` : ''}` }
  }
  return { label: 'Sliding · peak contact', value: `${val(m(r, 'travel'))} · ${val(m(r, 'peak'))}`, reference: `${val(m(r, 'impacts'))} wall/lid contacts` }
}

export function primaryNumber(r: Pick<SimResult, 'test' | 'metrics'>): number {
  return m(r, r.test === 'drop' ? 'prodG' : r.test === 'stack' ? 'margin' : 'travel')?.value ?? 0
}

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm mt-1 w-full justify-between" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label} <ChevronDown size={14} className={open ? 'rotate-180' : ''} aria-hidden />
      </button>
      {open && <div className="pb-1 text-[12px] text-ink-2">{children}</div>}
    </>
  )
}

/**
 * Result in reading order: conditions → main modelled response → main concern → what to try →
 * details. The input → response → recommendation strip ties the scene to the advice.
 */
export function ResultCard({ result, onApply, compact, conditions, stale }: { result: SimResult; onApply?: (s: Suggestion) => void; compact?: boolean; conditions?: string; stale?: boolean }) {
  const pr = primaryResponse(result)
  const top = result.suggestions.slice(0, 2)
  const rest = result.suggestions.slice(2)
  return (
    <article className={`rounded-xl border bg-white p-3 ${stale ? 'border-amber/40 opacity-70' : 'border-line'}`} aria-label={`${TEST_LABEL[result.test]} result${stale ? ' (outdated)' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <h3 className="text-[13px] font-bold">{TEST_LABEL[result.test]}</h3>
        <div className="flex items-center gap-1.5">
          {stale && <span className="chip border-amber/30 bg-amber-2 text-amber">Outdated</span>}
          <MethodBadge method={result.method} />
        </div>
      </div>
      {conditions && <p className="mt-0.5 text-[11.5px] text-ink-3">Tested: {conditions}</p>}
      <p className="mt-1 text-[14px] font-semibold leading-snug">{result.headline}</p>
      <div className="mt-1.5">
        <RiskChip risk={result.risk} />
      </div>

      <ol className="mt-2 grid gap-1 rounded-lg bg-black/[0.03] p-2 text-[12px]" aria-label="Input, modelled response and recommendation">
        {conditions && (
          <li>
            <span className="eyebrow mr-1">Input</span>
            {conditions}
          </li>
        )}
        <li>
          <span className="eyebrow mr-1">Modelled response</span>
          {pr.label}: <strong className="tabular-nums">{pr.value}</strong> <span className="text-ink-3">({pr.reference})</span>
        </li>
        <li className="flex items-center gap-1">
          <span className="eyebrow mr-1">Recommendation</span>
          {top[0] ? (
            <>
              <ArrowRight size={12} aria-hidden /> {top[0].title}
            </>
          ) : (
            <span className="text-ink-3">No change suggested by the model rules.</span>
          )}
        </li>
      </ol>

      {result.concerns.length > 0 && (
        <div className="mt-2">
          <h4 className="eyebrow mb-0.5">Main concern</h4>
          <p className="text-[12.5px] text-ink-2">{result.concerns[0]}</p>
        </div>
      )}

      {!compact && onApply && top.length > 0 && (
        <div className="mt-2.5">
          <h4 className="eyebrow mb-1">What to try</h4>
          <ul className="space-y-1.5">
            {top.map((s) => (
              <li key={s.id} className="rounded-lg bg-black/[0.03] p-2">
                <div className="text-[12.5px] font-semibold">{s.title}</div>
                <div className="text-[12px] text-ink-3">Why it may help: {s.reason}</div>
                <button type="button" className="btn btn-sm mt-1" onClick={() => onApply(s)} disabled={stale}>
                  <Wand2 size={13} aria-hidden /> Apply as new version &amp; re-run
                </button>
              </li>
            ))}
          </ul>
          {rest.length > 0 && (
            <Disclosure label={`${rest.length} more suggestion${rest.length > 1 ? 's' : ''}`}>
              <ul className="mt-1 space-y-1.5">
                {rest.map((s) => (
                  <li key={s.id} className="rounded-lg bg-black/[0.03] p-2">
                    <div className="text-[12.5px] font-semibold">{s.title}</div>
                    <div className="text-[12px] text-ink-3">{s.reason}</div>
                    <button type="button" className="btn btn-sm mt-1" onClick={() => onApply(s)} disabled={stale}>
                      <Wand2 size={13} aria-hidden /> Apply &amp; re-run
                    </button>
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
          {stale && <p className="mt-1 text-[11.5px] text-amber">Re-run first: suggestions belong to the outdated inputs.</p>}
        </div>
      )}

      {!compact && (
        <Disclosure label="All metrics & rule flags">
          <dl className="divide-y divide-line">
            {result.metrics.map((x) => (
              <div key={x.key} className="py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <dt>{x.label}</dt>
                  <dd className="flex items-center gap-1.5 tabular-nums">
                    <strong>
                      {fmt(x.value, x.digits ?? 1)} {x.unit}
                    </strong>
                    <span title={x.method === 'calculated' ? 'Calculated' : x.method === 'simplified_estimate' ? 'Estimate from assumed data' : 'Model output'} className={`inline-block h-2 w-2 rounded-[2px] ${x.method === 'calculated' ? 'bg-frost' : x.method === 'simplified_estimate' ? 'bg-amber' : 'bg-clay'}`} aria-hidden />
                  </dd>
                </div>
                {x.basis && <p className="mt-0.5 text-[11px] leading-snug text-ink-3">How: {x.basis}</p>}
              </div>
            ))}
          </dl>
          {result.concerns.length > 1 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {result.concerns.slice(1).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          {result.failureModes.length > 0 && (
            <>
              <p className="mt-2 text-ink-3">Possible failure modes flagged by fixed rules (not predicted outcomes):</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {result.failureModes.map((f) => (
                  <span key={f} className="chip border-rose/20 bg-rose-2 text-rose">
                    {f}
                  </span>
                ))}
              </div>
            </>
          )}
        </Disclosure>
      )}

      <Disclosure label="Assumptions & limitations">
        <h5 className="eyebrow mt-1">Assumptions</h5>
        <ul className="list-disc space-y-1 pl-4">
          {result.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <h5 className="eyebrow mt-2">Limitations</h5>
        <ul className="list-disc space-y-1 pl-4 text-ink-3">
          {result.limitations.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </Disclosure>
    </article>
  )
}

export interface Snapshot {
  versionN: number
  results: SlimResult[]
  risk: Risk
}

/** Before/after under the same conditions, after a recommendation was applied. */
export function BeforeAfter({ before, after, conditions }: { before: Snapshot; after: Snapshot; conditions: string }) {
  return (
    <section className="rounded-xl border-2 border-moss/30 bg-white p-3" aria-label="Before and after">
      <h3 className="text-[13px] font-bold">
        Before v{before.versionN} → after v{after.versionN}
      </h3>
      <p className="text-[11.5px] text-ink-3">Same conditions: {conditions}</p>
      <table className="mt-1.5 w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-ink-3">
            <th className="font-semibold">Test</th>
            <th className="font-semibold">v{before.versionN}</th>
            <th className="font-semibold">v{after.versionN}</th>
          </tr>
        </thead>
        <tbody>
          {after.results.map((a) => {
            const b = before.results.find((x) => x.test === a.test)
            return (
              <tr key={a.test} className="border-t border-line align-top">
                <td className="py-1.5 pr-2">
                  <div className="font-semibold">{TEST_LABEL[a.test]}</div>
                  <div className="text-[11px] text-ink-3">{primaryResponse(a).label}</div>
                </td>
                <td className="py-1.5 pr-2">
                  {b ? (
                    <>
                      <div className="tabular-nums">{primaryResponse(b).value}</div>
                      <RiskChip risk={b.risk} />
                    </>
                  ) : (
                    '–'
                  )}
                </td>
                <td className="py-1.5">
                  <div className="tabular-nums font-semibold">{primaryResponse(a).value}</div>
                  <RiskChip risk={a.risk} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11.5px] text-ink-3">The earlier version stays in the history. A lower model risk is not proof of better real-world protection.</p>
    </section>
  )
}

import { ChevronDown, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { LOCAL_CAVEAT } from '../../domain/circularity'
import { diff } from '../domain/assistant'
import { analyse, designNotes, type Analysis } from '../domain/analysis'
import { assumptionFor, MATERIALS } from '../domain/materials'
import { applyPatch, validateParams } from '../domain/params'
import type { DesignParams, Project, Suggestion } from '../domain/types'
import { useStudio } from '../store'
import { Callout, fmt, GroupTitle, MethodBadge } from '../ui'

function Delta({ a, b, unit, digits = 1 }: { a: number; b: number; unit: string; digits?: number }) {
  const d = b - a
  if (Math.abs(d) < Math.pow(10, -digits) / 2) return <span className="text-[11px] text-ink-3">same as v1</span>
  const pct = a ? (d / a) * 100 : 0
  return (
    <span className={`text-[11px] font-semibold ${d < 0 ? 'text-moss' : 'text-amber'}`}>
      {d > 0 ? '+' : '−'}
      {fmt(Math.abs(d), digits)} {unit} ({d > 0 ? '+' : '−'}
      {Math.abs(pct).toFixed(0)}%) vs v1
    </span>
  )
}

export function useApplySuggestion(project: Project, params: DesignParams) {
  const commit = useStudio.getState().commitVersion
  return (s: Suggestion, source: 'recommendation' | 'assistant' = 'recommendation') => {
    const next = applyPatch(params, s.patch)
    if (validateParams(next).length) return null
    return commit(project.id, next, `Recommendation: ${s.title}`, source, diff(params, next, {}, s.reason))
  }
}

export function AnalysisPanel({ project, params, analysis }: { project: Project; params: DesignParams; analysis: Analysis }) {
  const { setAssumption } = useStudio.getState()
  const [showAssumptions, setShowAssumptions] = useState(false)
  const c = analysis.cost
  const v1 = project.versions[0]
  const base = useMemo(() => (v1 ? analyse(v1.params, project.brief, project.assumptions) : null), [v1, project.brief, project.assumptions])
  const notes = useMemo(() => designNotes(params, project.brief, analysis), [params, project.brief, analysis])
  const apply = useApplySuggestion(project, params)
  const a = assumptionFor(params.material, project.assumptions)
  const mat = MATERIALS[params.material]
  const batch = project.brief.identification.batchPackages

  const rows: { label: string; value: string; delta?: [number, number, string, number]; method: Parameters<typeof MethodBadge>[0]['method'] }[] = [
    { label: 'Packaging mass per pack', value: `${fmt(c.massG)} g`, delta: base ? [base.cost.massG, c.massG, 'g', 1] : undefined, method: 'calculated' },
    { label: 'Material incl. trim (blank)', value: `${fmt(c.blankMassG)} g`, method: 'calculated' },
    { label: 'Material utilisation', value: `${fmt(c.utilisationPct, 0)}%`, method: params.template === 'folding_carton' ? 'calculated' : 'simplified_estimate' },
    { label: 'Estimated cost per pack', value: `€${c.perPack.toFixed(3)}`, delta: base ? [base.cost.perPack, c.perPack, '€', 3] : undefined, method: 'simplified_estimate' },
    { label: `Cost per batch (${batch.toLocaleString()} packs)`, value: `€${fmt(c.perBatch, 0)}`, method: 'simplified_estimate' },
    { label: 'Production trim waste per batch', value: `${fmt(c.wastePerBatchKg)} kg`, method: 'simplified_estimate' },
    { label: 'Fibre share by mass', value: `${fmt(c.fibreSharePct, 0)}%`, method: 'calculated' },
    { label: 'Void space (bounding boxes)', value: `${fmt(analysis.pkg.arrangement.voidPct, 0)}%`, delta: base ? [base.pkg.arrangement.voidPct, analysis.pkg.arrangement.voidPct, '%', 0] : undefined, method: 'calculated' },
  ]

  return (
    <div className="px-3 pb-6 pt-3">
      {!analysis.pkg.arrangement.fits && (
        <div className="mb-3">
          <Callout tone="error">{analysis.pkg.arrangement.message}</Callout>
        </div>
      )}
      <GroupTitle aside={<span className="text-[11px] text-ink-3">updates live</span>}>Material &amp; cost</GroupTitle>
      <dl className="divide-y divide-line rounded-xl border border-line bg-white px-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-2 py-2">
            <dt className="min-w-0 text-[12.5px] text-ink-2">
              {r.label}
              <span className="ml-1 align-middle">
                <MethodBadge method={r.method} />
              </span>
            </dt>
            <dd className="shrink-0 text-right">
              <div className="text-[13.5px] font-bold tabular-nums">{r.value}</div>
              {r.delta && <Delta a={r.delta[0]} b={r.delta[1]} unit={r.delta[2]} digits={r.delta[3]} />}
            </dd>
          </div>
        ))}
      </dl>

      <GroupTitle>Components &amp; recovery</GroupTitle>
      <ul className="space-y-1.5">
        {c.components.map((x) => (
          <li key={x.name} className="flex justify-between rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12.5px]">
            <span>
              <span className="font-semibold">{x.name}</span> · {x.material}
            </span>
            <span className="tabular-nums text-ink-2">{fmt(x.massG)} g</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[12px] text-ink-2">
        {c.monoMaterial ? 'Single material stream.' : 'Mixed materials: consumers need to separate the parts.'} Producer-stated routes for {mat.short}: {mat.routes.join(', ')}. {LOCAL_CAVEAT}
      </p>

      <button type="button" className="btn btn-sm btn-ghost mt-3 w-full justify-between" aria-expanded={showAssumptions} onClick={() => setShowAssumptions((v) => !v)}>
        Assumptions behind these estimates <ChevronDown size={15} className={showAssumptions ? 'rotate-180' : ''} aria-hidden />
      </button>
      {showAssumptions && (
        <div className="mt-1 rounded-xl border border-line bg-white p-3 text-[12px]">
          <ul className="list-disc space-y-1 pl-4 text-ink-2">
            {c.assumptions.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-[12px] font-semibold text-ink-2">
              {mat.short} price €/kg
              <input
                type="number"
                step="0.05"
                min="0"
                className="field mt-1 h-8 min-h-0 py-0 text-[13px]"
                value={a.pricePerKg}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isFinite(n) && n >= 0) setAssumption(project.id, params.material, 'pricePerKg', n)
                }}
              />
            </label>
            <label className="text-[12px] font-semibold text-ink-2">
              Converting €/pack
              <input
                type="number"
                step="0.005"
                min="0"
                className="field mt-1 h-8 min-h-0 py-0 text-[13px]"
                value={a.convertingPerPack}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isFinite(n) && n >= 0) setAssumption(project.id, params.material, 'convertingPerPack', n)
                }}
              />
            </label>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost mt-2"
            onClick={() => {
              setAssumption(project.id, params.material, 'pricePerKg', undefined)
              setAssumption(project.id, params.material, 'convertingPerPack', undefined)
            }}
          >
            Reset to defaults ({`€${mat.defaults.pricePerKg}/kg`})
          </button>
          <p className="mt-2 text-ink-3">Defaults are indicative values for comparing options, not supplier quotes or measured production costs.</p>
        </div>
      )}

      <GroupTitle>Design checks</GroupTitle>
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id}>
            <Callout tone={n.level === 'error' ? 'error' : n.level === 'warning' ? 'warning' : 'info'}>
              <p>{n.text}</p>
              {n.suggestion && (
                <button type="button" className="btn btn-sm mt-1.5" onClick={() => apply(n.suggestion!)}>
                  <Wand2 size={13} aria-hidden /> Apply: {n.suggestion.title}
                </button>
              )}
            </Callout>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px] text-ink-3">Applying a check creates a new design version. The previous version is kept for comparison.</p>
    </div>
  )
}

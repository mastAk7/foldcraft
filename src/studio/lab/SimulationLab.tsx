import { Bomb, Loader2, Play, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { analyse } from '../domain/analysis'
import { applyPatch, validateParams } from '../domain/params'
import { breakConditions, breakMyDesign, PROFILE_LABEL, runDrop, runStack, runVibration, type BreakReport, type DropOutput, type StackOutput, type VibrationOutput } from '../domain/sims'
import { diff } from '../domain/assistant'
import type { DropOrientation, Project, Risk, Suggestion, VibrationProfile } from '../domain/types'
import { useStudio } from '../store'
import { S } from '../three/PackageModel'
import { StudioCanvas } from '../three/StudioCanvas'
import { Callout, GroupTitle, NumberField, RiskChip, Segmented } from '../ui'
import { useNarrow } from '../useNarrow'
import { ResultCard } from './ResultCard'
import { DropScene, StackScene, utilColor, VibrationScene } from './scenes'

type Test = 'drop' | 'stack' | 'vibration' | 'break'

interface Before {
  versionN: number
  report: BreakReport
}

export default function SimulationLab({ project }: { project: Project }) {
  const { markTested, commitVersion } = useStudio.getState()
  const narrow = useNarrow()
  const versionId = project.currentVersionId ?? project.versions[project.versions.length - 1]?.id
  const version = project.versions.find((v) => v.id === versionId)!
  const analysis = useMemo(() => analyse(version.params, project.brief, project.assumptions), [version.params, project.brief, project.assumptions])
  const [test, setTest] = useState<Test>('drop')
  const [height, setHeight] = useState(project.brief.requirements.transport === 'local' ? 50 : 80)
  const [orientation, setOrientation] = useState<DropOrientation>('bottom')
  const [layers, setLayers] = useState(project.brief.requirements.stackLayers)
  const [offset, setOffset] = useState(0)
  const [profile, setProfile] = useState<VibrationProfile>('normal')
  const [drop, setDrop] = useState<DropOutput | null>(null)
  const [stack, setStack] = useState<StackOutput | null>(null)
  const [vib, setVib] = useState<VibrationOutput | null>(null)
  const [vibCompare, setVibCompare] = useState<{ label: string; risk: Risk; travel: number }[] | null>(null)
  const [report, setReport] = useState<BreakReport | null>(null)
  const [reportView, setReportView] = useState<'drop' | 'stack' | 'vibration'>('drop')
  const [before, setBefore] = useState<Before | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [runId, setRunId] = useState(0)
  const [ranFor, setRanFor] = useState<string>('')

  const stale = ranFor !== '' && ranFor !== version.id
  const ctx = analysis.ctx

  const run = (t: Test) => {
    setRanFor(version.id)
    markTested(project.id, version.id)
    setRunId((r) => r + 1)
    if (t === 'drop') setDrop(runDrop(ctx, { heightCm: height, orientation }))
    if (t === 'stack') setStack(runStack(ctx, { layers, offsetMm: offset }))
    if (t === 'vibration') {
      setVib(runVibration(ctx, { profile, durationS: 3 }))
      setVibCompare(null)
    }
  }

  const runBreak = (c = ctx, vId = version.id) => {
    setBusy('Dropping from 80 cm onto a corner…')
    setReport(null)
    // Staged so the producer sees each test run in turn; the computation itself is synchronous.
    setTimeout(() => setBusy('Stacking the pallet…'), 350)
    setTimeout(() => setBusy('Shaking on a rough road…'), 700)
    setTimeout(() => {
      const r = breakMyDesign(c)
      setReport(r)
      setBusy(null)
      setRanFor(vId)
      setRunId((x) => x + 1)
      markTested(project.id, vId)
    }, 1050)
  }

  const applyAndRerun = (s: Suggestion) => {
    const next = applyPatch(version.params, s.patch)
    if (validateParams(next).length) return
    const prevReport = report ?? breakMyDesign(ctx)
    setBefore({ versionN: version.n, report: prevReport })
    const vid = commitVersion(project.id, next, `Recommendation: ${s.title}`, 'recommendation', diff(version.params, next, {}, s.reason))
    if (!vid) return
    const a = analyse(next, project.brief, project.assumptions)
    setTest('break')
    runBreak(a.ctx, vid)
  }

  const compareArrangements = () => {
    const p = version.params
    const variants: { label: string; patch: Record<string, unknown> }[] = [{ label: 'Current design', patch: {} }]
    if (p.template === 'folding_carton') variants.push({ label: 'No insert', patch: { insert: 'none' } }, { label: 'Fibre pad', patch: { insert: 'pad' } }, { label: 'Cell insert', patch: { insert: 'cells' } })
    else if (p.template === 'compartment_tray') variants.push({ label: 'Open tray (no cells)', patch: { template: 'produce_tray' } })
    else variants.push({ label: 'No cushioning', patch: { insert: 'none' } }, { label: 'Fibre pad', patch: { insert: 'pad' } }, { label: 'Compartment cells', patch: { template: 'compartment_tray' } })
    const seen = new Set<string>()
    setVibCompare(
      variants
        .map((v) => {
          const params = applyPatch(p, v.patch)
          const key = JSON.stringify(params)
          if (seen.has(key) || validateParams(params).length) return null
          seen.add(key)
          const r = runVibration(analyse(params, project.brief, project.assumptions).ctx, { profile, durationS: 3 })
          return { label: v.label, risk: r.result.risk, travel: r.result.metrics.find((m) => m.key === 'travel')!.value }
        })
        .filter((x): x is { label: string; risk: Risk; travel: number } => !!x),
    )
  }

  const scene = () => {
    const kind = project.brief.identification.produce
    const unit = project.brief.identification.unitDims
    const view = test === 'break' ? reportView : test
    const d = test === 'break' ? report?.drop : drop
    const st = test === 'break' ? report?.stack : stack
    const vb = test === 'break' ? report?.vibration : vib
    const orient = test === 'break' ? report?.conditions.drop.orientation ?? 'corner' : orientation
    const stackOffset = test === 'break' ? report?.conditions.stack.offsetMm ?? 0 : offset
    if (view === 'drop' && d) return <DropScene pkg={analysis.pkg} params={version.params} kind={kind} unit={unit} trace={d.trace} orientation={orient} runId={runId} />
    if (view === 'stack' && st) return <StackScene pkg={analysis.pkg} params={version.params} utilisation={st.utilisation} offsetMm={stackOffset} />
    if (view === 'vibration' && vb) return <VibrationScene pkg={analysis.pkg} params={version.params} kind={kind} unit={unit} trace={vb.trace} runId={runId} />
    return null
  }
  const shown = scene()
  const stackShown = (test === 'stack' && stack) || (test === 'break' && reportView === 'stack' && report)
  const stackN = test === 'break' ? report?.stack.utilisation.length ?? 1 : stack?.utilisation.length ?? 1
  const sceneSize = stackShown ? Math.max(analysis.pkg.outer.l, analysis.pkg.outer.h * stackN) : Math.max(analysis.pkg.outer.l, analysis.pkg.outer.w) * 1.6

  const config = (
    <div className="px-3 pb-6 pt-3">
      <Callout tone="info">Simplified models for comparing options. No result here is a validated or certified test.</Callout>
      <GroupTitle>Design under test</GroupTitle>
      <p className="text-[13px]">
        <strong>v{version.n}</strong> · {version.label}
      </p>
      <GroupTitle>Test</GroupTitle>
      <Segmented<Test> label="Test" size="sm" value={test} onChange={setTest} options={[{ id: 'drop', label: 'Drop' }, { id: 'stack', label: 'Stack' }, { id: 'vibration', label: 'Vibration' }, { id: 'break', label: 'Break it' }]} />
      {test === 'drop' && (
        <>
          <NumberField label="Drop height" bound={{ min: 15, max: 120, step: 5, unit: 'cm', label: 'Drop height' }} value={height} onCommit={setHeight} />
          <div className="mb-1 mt-1 text-[13px] font-semibold text-ink-2">Impact orientation</div>
          <Segmented<DropOrientation> label="Impact orientation" size="sm" value={orientation} onChange={setOrientation} options={[{ id: 'bottom', label: 'Bottom' }, { id: 'side', label: 'Side' }, { id: 'corner', label: 'Corner' }]} />
        </>
      )}
      {test === 'stack' && (
        <>
          <NumberField label="Packs in stack" bound={{ min: 1, max: 12, step: 1, unit: 'packs', label: 'Packs in stack' }} value={layers} onCommit={setLayers} hint={`Brief: ${project.brief.requirements.stackLayers} high`} />
          <NumberField label="Misalignment" bound={{ min: 0, max: 60, step: 1, unit: 'mm', label: 'Misalignment' }} value={offset} onCommit={setOffset} hint="Alternate packs are shifted by this much." />
        </>
      )}
      {test === 'vibration' && (
        <>
          <div className="mb-1 mt-2 text-[13px] font-semibold text-ink-2">Transport profile</div>
          <Segmented<VibrationProfile> label="Transport profile" size="sm" value={profile} onChange={setProfile} options={[{ id: 'smooth', label: 'Smooth' }, { id: 'normal', label: 'Normal' }, { id: 'rough', label: 'Rough' }]} />
          <p className="mt-1 text-[11.5px] text-ink-3">{PROFILE_LABEL[profile]}</p>
        </>
      )}
      {test === 'break' ? (
        <>
          <p className="mt-2 text-[12.5px] text-ink-2">Runs all three tests in sequence under harsher, fixed conditions and gives one summary:</p>
          <ul className="mt-1 list-disc pl-4 text-[12px] text-ink-2">
            <li>Drop: {breakConditions(ctx).drop.heightCm} cm onto a corner</li>
            <li>Stack: {breakConditions(ctx).stack.layers} high, {breakConditions(ctx).stack.offsetMm} mm misaligned</li>
            <li>Vibration: rough road, 3 s</li>
          </ul>
          <button type="button" className="btn btn-clay mt-3 w-full" onClick={() => runBreak()} disabled={!!busy}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Bomb size={16} aria-hidden />} Break my design
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-primary mt-3 w-full" onClick={() => run(test)}>
          <Play size={16} aria-hidden /> Run {test} test
        </button>
      )}
      {test === 'vibration' && vib && (
        <button type="button" className="btn btn-sm mt-2 w-full" onClick={compareArrangements}>
          Compare cushioning / divider arrangements
        </button>
      )}
    </div>
  )

  const results = (
    <div className="space-y-3 px-3 pb-6 pt-3">
      {stale && <Callout tone="warning">These results are for an earlier version. Run again to test v{version.n}.</Callout>}
      {test === 'drop' && (drop ? <ResultCard result={drop.result} onApply={applyAndRerun} /> : <Empty text="Choose a height and orientation, then run the drop test." />)}
      {test === 'stack' &&
        (stack ? (
          <>
            <ResultCard result={stack.result} onApply={applyAndRerun} />
            <StackList utilisation={stack.utilisation} />
          </>
        ) : (
          <Empty text="Set the stack height and misalignment, then run." />
        ))}
      {test === 'vibration' &&
        (vib ? (
          <>
            <ResultCard result={vib.result} onApply={applyAndRerun} />
            {vibCompare && (
              <section className="rounded-xl border border-line bg-white p-3">
                <h3 className="text-[13px] font-bold">Arrangements, same {profile} profile</h3>
                <table className="mt-1.5 w-full text-[12.5px]">
                  <tbody>
                    {vibCompare.map((r) => (
                      <tr key={r.label} className="border-t border-line">
                        <td className="py-1.5 pr-2">{r.label}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{r.travel.toFixed(1)} mm/s</td>
                        <td className="py-1.5 text-right">
                          <RiskChip risk={r.risk} prefix="Risk" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        ) : (
          <Empty text="Pick a transport profile, then run." />
        ))}
      {test === 'break' &&
        (busy ? (
          <div className="grid place-items-center py-12 text-[13px] text-ink-2" role="status">
            <Loader2 className="mb-2 animate-spin" aria-hidden /> {busy}
          </div>
        ) : report ? (
          <BreakSummary report={report} before={before} versionN={version.n} onApply={applyAndRerun} />
        ) : (
          <Empty text="Break my design runs drop, stack and vibration tests in one go and lists what could fail within these models." />
        ))}
    </div>
  )

  const canvas = (
    <div className="relative h-full min-h-[280px]">
      {shown ? (
        <StudioCanvas key={`${test}-${reportView}`} sizeMm={sceneSize} label="Simulation scene" centerY={stackShown ? (analysis.pkg.outer.h * stackN * S) / 2 : 0.3}>
          {shown}
        </StudioCanvas>
      ) : (
        <div className="studio-blueprint grid h-full place-items-center p-6 text-center text-[13px] text-ink-2">Run a test to see it here.</div>
      )}
      <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap gap-1.5">
        {shown && <span className="chip border-clay/25 bg-white/90 text-clay">Animation of the simplified model</span>}
        {shown && (test === 'drop' || (test === 'break' && reportView === 'drop')) && <span className="chip border-black/10 bg-white/85 text-ink-2">Slow motion at impact · unit movement ×4</span>}
        {shown && (test === 'vibration' || (test === 'break' && reportView === 'vibration')) && <span className="chip border-black/10 bg-white/85 text-ink-2">Motion exaggerated ×4 · highlighted unit</span>}
        {shown && stackShown && <span className="chip border-black/10 bg-white/85 text-ink-2">Colour = share of derated capacity used (see list)</span>}
      </div>
      {test === 'break' && report && (
        <div className="absolute bottom-2 left-2 w-[280px] max-w-[calc(100%-1rem)]">
          <Segmented label="Scene" size="sm" value={reportView} onChange={setReportView} options={[{ id: 'drop', label: 'Drop' }, { id: 'stack', label: 'Stack' }, { id: 'vibration', label: 'Vibration' }]} />
        </div>
      )}
      {shown && !stackShown && (
        <button type="button" className="btn btn-sm absolute bottom-2 right-2" onClick={() => setRunId((r) => r + 1)}>
          <RotateCcw size={14} aria-hidden /> Replay
        </button>
      )}
    </div>
  )

  if (narrow)
    return (
      <div className="studio-scroll h-full">
        <div className="h-[42vh] border-b border-line">{canvas}</div>
        <div className="studio-side">{config}</div>
        <div className="studio-side border-t border-line">{results}</div>
      </div>
    )

  return (
    <div className="flex h-full">
      <aside className="studio-scroll studio-side w-[280px] shrink-0 border-r border-line" aria-label="Test settings">
        {config}
      </aside>
      <section className="relative min-w-0 flex-1" aria-label="Simulation scene">
        {canvas}
      </section>
      <aside className="studio-scroll studio-side w-[360px] shrink-0 border-l border-line xl:w-[400px]" aria-label="Results">
        {results}
      </aside>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-line bg-white/50 p-4 text-center text-[13px] text-ink-3">{text}</p>
}

function StackList({ utilisation }: { utilisation: number[] }) {
  return (
    <section className="rounded-xl border border-line bg-white p-3">
      <h3 className="text-[13px] font-bold">Load by position</h3>
      <ol className="mt-1.5 space-y-1 text-[12.5px]">
        {utilisation.map((u, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: utilColor(u) }} aria-hidden />
            <span className="w-24">{i === 0 ? 'Bottom pack' : i === utilisation.length - 1 ? 'Top pack' : `Pack ${i + 1}`}</span>
            <span className="tabular-nums">{Math.round(u * 100)}% of derated capacity (with safety factor)</span>
            {u >= 1 && <span className="font-bold text-rose">over</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

function BreakSummary({ report, before, versionN, onApply }: { report: BreakReport; before: Before | null; versionN: number; onApply: (s: Suggestion) => void }) {
  const rows = [
    ['Drop', report.drop.result, before?.report.drop.result],
    ['Stack', report.stack.result, before?.report.stack.result],
    ['Vibration', report.vibration.result, before?.report.vibration.result],
  ] as const
  const allFailures = [...new Set([...report.drop.result.failureModes, ...report.stack.result.failureModes, ...report.vibration.result.failureModes])]
  return (
    <>
      <section className="rounded-xl border-2 border-clay/30 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg">Break my design · v{versionN}</h3>
          <RiskChip risk={report.risk} prefix="Overall" />
        </div>
        <p className="mt-1 text-[12px] text-ink-3">
          Conditions: {report.conditions.drop.heightCm} cm {report.conditions.drop.orientation} drop · stack of {report.conditions.stack.layers}, {report.conditions.stack.offsetMm} mm offset · rough road 3 s.
        </p>
        <table className="mt-2 w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-ink-3">
              <th className="font-semibold">Test</th>
              {before && <th className="font-semibold">v{before.versionN}</th>}
              <th className="font-semibold">v{versionN}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, r, b]) => (
              <tr key={label} className="border-t border-line">
                <td className="py-1.5 pr-2 font-semibold">{label}</td>
                {before && <td className="py-1.5 pr-2">{b && <RiskChip risk={b.risk} prefix="Risk" />}</td>}
                <td className="py-1.5">
                  <RiskChip risk={r.risk} prefix="Risk" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {before && <p className="mt-2 text-[11.5px] text-ink-3">Same conditions for both versions. A lower model risk is not proof of better real-world protection.</p>}
        <h4 className="eyebrow mb-1 mt-3">Potential failure modes (within these models)</h4>
        {allFailures.length ? (
          <div className="flex flex-wrap gap-1">
            {allFailures.map((f) => (
              <span key={f} className="chip border-rose/20 bg-rose-2 text-rose">
                {f}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-ink-2">None flagged under these conditions.</p>
        )}
        {report.suggestions.length > 0 && (
          <>
            <h4 className="eyebrow mb-1 mt-3">Suggested modifications</h4>
            <ul className="space-y-1.5">
              {report.suggestions.map((s) => (
                <li key={s.id} className="rounded-lg bg-black/[0.03] p-2">
                  <div className="text-[12.5px] font-semibold">{s.title}</div>
                  <div className="text-[12px] text-ink-3">{s.reason}</div>
                  <button type="button" className="btn btn-sm mt-1" onClick={() => onApply(s)}>
                    Apply as new version &amp; re-run
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <ResultCard result={report.drop.result} compact />
      <ResultCard result={report.stack.result} compact />
      <ResultCard result={report.vibration.result} compact />
    </>
  )
}

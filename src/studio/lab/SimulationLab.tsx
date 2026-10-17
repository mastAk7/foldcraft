import { Bomb, Check, Maximize2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Play, RotateCcw, SkipForward, StepForward } from 'lucide-react'
import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { analyse } from '../domain/analysis'
import { diff } from '../domain/assistant'
import { breakReducer, initialBreak, STAGE_LABEL, STAGES, stageMessage, type BreakState } from '../domain/breakFlow'
import { applyPatch, validateParams } from '../domain/params'
import { uid } from '../domain/project'
import { describeSettings, makeMeta, slim, staleReasons, toRecord, type RunMeta, type RunSettings, type RunTest } from '../domain/runs'
import { breakConditions, PROFILE_LABEL, profileSpec, runDrop, runStack, runVibration, SIM_MODEL_VERSION, type BreakConditions, type BreakReport, type DropOutput, type SimContext, type StackOutput, type VibrationOutput } from '../domain/sims'
import type { DesignVersion, DropOrientation, DropSettings, Project, Risk, SimResult, SimTest, StackSettings, Suggestion, VibrationProfile, VibrationSettings } from '../domain/types'
import { useStudio } from '../store'
import { S } from '../three/PackageModel'
import { StudioCanvas } from '../three/StudioCanvas'
import { Callout, GroupTitle, NumberField, RiskChip, Segmented } from '../ui'
import { useMediaQuery, useNarrow } from '../useNarrow'
import { BeforeAfter, ResultCard, type Snapshot } from './ResultCard'
import { DROP_SPEED, DropScene, MAG, prefersReducedMotion, StackScene, utilColor, VIB_SPEED, VibrationScene } from './scenes'
import { makeClock, TraceTimeline } from './TraceTimeline'

type Test = SimTest | 'break'

interface Run<T> {
  out: T
  meta: RunMeta
}

interface Before {
  test: RunTest
  snap: Snapshot
  conditions: string
  afterVersionId: string
}

/** What each test leaves out, shown before running so unsupported analysis is visible up front. */
const NOT_MODELLED: Record<Test, string[]> = {
  drop: ['Tumbling or rotation during the fall', 'Second impacts on other faces', 'Unit-to-unit contact', 'Wall bending, latch release or bruising (rules only flag them)'],
  stack: ['How a pack collapses or buckles', 'Creep over days of storage', 'Pallets and mixed packs', 'Validated capacity: McKee is a corrugated-box formula, used here only to compare'],
  vibration: ['Package rotation', 'Vehicle or pallet resonance', 'More than one representative unit', 'Product damage (sensitivity levels are assumed)'],
  break: ['Everything listed for the three single tests', 'Interaction between tests (e.g. a drop weakening the stack)'],
}

export default function SimulationLab({ project }: { project: Project }) {
  const { recordRun, commitVersion } = useStudio.getState()
  const narrow = useNarrow()
  const mid = useMediaQuery('(max-width: 1279px)')
  const versionId = project.currentVersionId ?? project.versions[project.versions.length - 1]?.id
  const version = project.versions.find((v) => v.id === versionId)!
  const analysis = useMemo(() => analyse(version.params, project.brief, project.assumptions), [version.params, project.brief, project.assumptions])
  const ctx = analysis.ctx
  const [test, setTest] = useState<Test>('drop')
  const [height, setHeight] = useState(project.brief.requirements.transport === 'local' ? 50 : 80)
  const [orientation, setOrientation] = useState<DropOrientation>('bottom')
  const [layers, setLayers] = useState(project.brief.requirements.stackLayers)
  const [offset, setOffset] = useState(0)
  const [profile, setProfile] = useState<VibrationProfile>('normal')
  const [drop, setDrop] = useState<Run<DropOutput> | null>(null)
  const [stack, setStack] = useState<Run<StackOutput> | null>(null)
  const [vib, setVib] = useState<Run<VibrationOutput> | null>(null)
  const [vibCompare, setVibCompare] = useState<{ key: string; rows: { label: string; risk: Risk; travel: number }[] } | null>(null)
  const [brk, dispatch] = useReducer(breakReducer, initialBreak)
  const [before, setBefore] = useState<Before | null>(null)
  const [runId, setRunId] = useState(0)
  const [cfgOpen, setCfgOpen] = useState<boolean | null>(null)
  const [resOpen, setResOpen] = useState<boolean | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const clock = useMemo(makeClock, [])
  const reduced = prefersReducedMotion()

  const conditions = useMemo(() => breakConditions(ctx), [ctx])
  const live = useMemo(() => {
    const d: DropSettings = { heightCm: height, orientation }
    const s: StackSettings = { layers: Math.max(1, Math.round(layers)), offsetMm: offset }
    const v: VibrationSettings = { profile, durationS: 3 }
    return {
      settings: { drop: d, stack: s, vibration: v, break: conditions } as Record<Test, RunSettings>,
      meta: { drop: makeMeta('drop', version, ctx, d, ''), stack: makeMeta('stack', version, ctx, s, ''), vibration: makeMeta('vibration', version, ctx, v, ''), break: makeMeta('break', version, ctx, conditions, '') } as Record<Test, RunMeta>,
    }
  }, [height, orientation, layers, offset, profile, conditions, version, ctx])

  // A running sequence whose inputs no longer match is shown as interrupted (derived, not timed).
  const shown: BreakState = brk.meta && brk.meta.key !== live.meta.break.key ? breakReducer(brk, { type: 'inputsChanged', key: live.meta.break.key }) : brk
  const breakStale = !!brk.meta && brk.meta.key !== live.meta.break.key

  // Store the completed sequence once it reaches the summary.
  const recorded = useRef(new Set<string>())
  useEffect(() => {
    const r = brk.report
    if (brk.stage !== 'summary' || !r || !brk.meta) return
    const id = `${brk.meta.key}@${brk.meta.at}`
    if (recorded.current.has(id)) return
    recorded.current.add(id)
    recordRun(project.id, toRecord(brk.meta, [r.drop.result, r.stack.result, r.vibration.result], r.risk, uid()))
  }, [brk.stage, brk.report, brk.meta, project.id, recordRun])

  const runSingle = (t: SimTest, c: SimContext = ctx, v: Pick<DesignVersion, 'id' | 'n'> = version, s: RunSettings = live.settings[t]): SimResult => {
    const meta = makeMeta(t, v, c, s)
    let result: SimResult
    if (t === 'drop') {
      const out = runDrop(c, s as DropSettings)
      setDrop({ out, meta })
      result = out.result
    } else if (t === 'stack') {
      const out = runStack(c, s as StackSettings)
      setStack({ out, meta })
      result = out.result
    } else {
      const out = runVibration(c, s as VibrationSettings)
      setVib({ out, meta })
      setVibCompare(null)
      result = out.result
    }
    recordRun(project.id, toRecord(meta, [result], result.risk, uid()))
    setRunId((r) => r + 1)
    return result
  }

  const startBreak = (c: SimContext = ctx, v: Pick<DesignVersion, 'id' | 'n'> = version, cond: BreakConditions = conditions) => dispatch({ type: 'start', ctx: c, meta: makeMeta('break', v, c, cond), conditions: cond })

  const syncSettings = (t: RunTest, s: RunSettings) => {
    if (t === 'drop') {
      setHeight((s as DropSettings).heightCm)
      setOrientation((s as DropSettings).orientation)
    } else if (t === 'stack') {
      setLayers((s as StackSettings).layers)
      setOffset((s as StackSettings).offsetMm)
    } else if (t === 'vibration') setProfile((s as VibrationSettings).profile)
  }

  /** New version from the suggestion, then the same test under the same settings, with before/after. */
  const applyAndRerun = (s: Suggestion, from: { meta: RunMeta; results: SimResult[]; risk: Risk }) => {
    const next = applyPatch(version.params, s.patch)
    if (validateParams(next).length) return
    const vid = commitVersion(project.id, next, `Recommendation: ${s.title}`, 'recommendation', diff(version.params, next, {}, s.reason))
    if (!vid) return
    const nv = { id: vid, n: project.versions.length + 1 }
    const a = analyse(next, project.brief, project.assumptions)
    setBefore({ test: from.meta.test, snap: { versionN: from.meta.versionN, results: from.results.map(slim), risk: from.risk }, conditions: describeSettings(from.meta.test, from.meta.settings), afterVersionId: vid })
    if (from.meta.test === 'break') {
      startBreak(a.ctx, nv, from.meta.settings as BreakConditions)
      dispatch({ type: 'skipToSummary' })
    } else {
      syncSettings(from.meta.test, from.meta.settings)
      runSingle(from.meta.test, a.ctx, nv, from.meta.settings)
    }
  }

  const compareArrangements = () => {
    const p = version.params
    const variants: { label: string; patch: Record<string, unknown> }[] = [{ label: 'Current design', patch: {} }]
    if (p.template === 'folding_carton') variants.push({ label: 'No insert', patch: { insert: 'none' } }, { label: 'Fibre pad', patch: { insert: 'pad' } }, { label: 'Cell insert', patch: { insert: 'cells' } })
    else if (p.template === 'compartment_tray') variants.push({ label: 'Open tray (no cells)', patch: { template: 'produce_tray' } })
    else variants.push({ label: 'No cushioning', patch: { insert: 'none' } }, { label: 'Fibre pad', patch: { insert: 'pad' } }, { label: 'Compartment cells', patch: { template: 'compartment_tray' } })
    const seen = new Set<string>()
    const vs = live.settings.vibration as VibrationSettings
    const rows = variants
      .map((v) => {
        const params = applyPatch(p, v.patch)
        const key = JSON.stringify(params)
        if (seen.has(key) || validateParams(params).length) return null
        seen.add(key)
        const r = runVibration(analyse(params, project.brief, project.assumptions).ctx, vs)
        return { label: v.label, risk: r.result.risk, travel: r.result.metrics.find((m) => m.key === 'travel')!.value }
      })
      .filter((x): x is { label: string; risk: Risk; travel: number } => !!x)
    setVibCompare({ key: live.meta.vibration.key, rows })
  }

  /* ------------------------------------------------------------ what the scene shows */

  const running = shown.stage === 'drop' || shown.stage === 'stack' || shown.stage === 'vibration'
  const view: SimTest | null = test === 'break' ? (shown.stage === 'idle' ? null : shown.view) : test
  const dropRun = test === 'break' ? (shown.drop && shown.conditions ? { out: shown.drop, settings: shown.conditions.drop } : null) : drop && { out: drop.out, settings: drop.meta.settings as DropSettings }
  const stackRun = test === 'break' ? (shown.stack && shown.conditions ? { out: shown.stack, settings: shown.conditions.stack } : null) : stack && { out: stack.out, settings: stack.meta.settings as StackSettings }
  const vibRun = test === 'break' ? (shown.vibration && shown.conditions ? { out: shown.vibration, settings: shown.conditions.vibration } : null) : vib && { out: vib.out, settings: vib.meta.settings as VibrationSettings }
  const sceneRun = test === 'break' ? shown.replay : runId
  const complete = (st: SimTest) => () => {
    if (test === 'break' && shown.stage === st && !reduced) dispatch({ type: 'stageComplete', stage: st })
  }
  const kind = project.brief.identification.produce
  const unit = project.brief.identification.unitDims
  const o = analysis.pkg.outer
  const ext = Math.max(o.l, o.w)

  let scene: ReactNode = null
  let sceneKey = 'none'
  let sizeMm = ext * 1.6
  let centerY = 0.3
  let timeline: ReactNode = null
  let legend: ReactNode = null
  const chips: { text: string; tone?: 'warn' }[] = []
  if (view === 'drop' && dropRun) {
    const { out, settings } = dropRun
    scene = <DropScene pkg={analysis.pkg} params={version.params} kind={kind} unit={unit} trace={out.trace} orientation={settings.orientation} heightCm={settings.heightCm} runId={sceneRun} clock={clock} onComplete={complete('drop')} />
    sceneKey = `drop-${settings.heightCm}-${settings.orientation}`
    sizeMm = Math.max(ext * 1.6, settings.heightCm * 10 + o.h)
    centerY = (settings.heightCm * 10 + o.h) * S * 0.5
    const tr = out.trace
    timeline = (
      <TraceTimeline
        t={tr.t}
        clock={clock}
        series={[
          { label: 'Pack height', unit: 'mm', color: '#2f78b7', values: tr.y, digits: 0 },
          { label: 'Unit vs pack', unit: 'mm', color: '#c4613b', values: tr.rel, digits: 1 },
          { label: 'Pack decel.', unit: 'g', color: '#c23b55', values: tr.acc, digits: 0 },
        ]}
        markers={[{ t: tr.t[tr.impactIndex] ?? 0, label: 'Floor contact' }]}
        note={`Slow motion ×${DROP_SPEED.impact} around contact`}
      />
    )
    chips.push({ text: `Grey post = release height ${settings.heightCm} cm` }, { text: `Fall at ${DROP_SPEED.fall * 100}% speed · ×${DROP_SPEED.impact} slow motion at contact` }, { text: `Unit movement inside the pack magnified ×${MAG}` }, { text: 'Deformation is a few mm and drawn at true scale' }, { text: 'Held in test orientation; rotation during the fall is not modelled' })
    if (settings.orientation !== 'bottom') chips.push({ text: 'Tip onto the base after the trace: illustrative, not modelled', tone: 'warn' })
  } else if (view === 'stack' && stackRun) {
    const { out, settings } = stackRun
    const n = out.layers.length
    scene = <StackScene pkg={analysis.pkg} params={version.params} layers={out.layers} supportHalfMm={out.supportHalfMm} tipMargin={out.tipMargin} runId={sceneRun} onComplete={complete('stack')} />
    sceneKey = `stack-${n}`
    sizeMm = Math.max(o.l, o.h * n) * 1.15
    centerY = (o.h * n * S) / 2
    chips.push({ text: 'Placement animation only: no collapse or deformation is simulated' }, { text: 'Colour = share of derated capacity used · arrows = static load on the pack below' })
    if (settings.offsetMm > 0) chips.push({ text: 'Red strip = overhang · dashed line = centre of mass of the packs above' })
    if (out.overhangPct > 15) chips.push({ text: `Significant misalignment: offset is ${out.overhangPct.toFixed(0)}% of the footprint`, tone: 'warn' })
    if (out.tipMargin < 0) chips.push({ text: 'Centre of mass outside the support: cannot stand (static check)', tone: 'warn' })
    legend = (
      <div className="pointer-events-none absolute bottom-2 left-2 w-[220px] rounded-lg bg-white/92 p-2 text-[11px] shadow-sm" aria-hidden>
        <div className="mb-1 font-semibold">Each pack, top → bottom</div>
        {[...out.layers].reverse().map((l, k) => {
          const i = n - 1 - k
          return (
            <div key={i} className="flex items-center gap-1.5 leading-tight">
              <span className="w-11 shrink-0 text-ink-2">{i === 0 ? 'Bottom' : i === n - 1 ? 'Top' : `Pack ${i + 1}`}</span>
              <span className="h-2 flex-1 rounded-sm bg-black/5">
                <span className="block h-2 rounded-sm" style={{ width: `${Math.min(100, l.utilisation * 100)}%`, background: utilColor(l.utilisation) }} />
              </span>
              <span className="w-[72px] shrink-0 text-right tabular-nums">
                {Math.round(l.utilisation * 100)}% · {l.loadN.toFixed(0)} N
              </span>
            </div>
          )
        })}
        <div className="mt-1 text-ink-3">% of derated capacity incl. ×safety factor</div>
      </div>
    )
  } else if (view === 'vibration' && vibRun) {
    const { out, settings } = vibRun
    const tr = out.trace
    const play = out.result.metrics.find((m) => m.key === 'play')?.value ?? 2
    const loop = !(test === 'break' && shown.stage === 'vibration')
    scene = <VibrationScene pkg={analysis.pkg} params={version.params} kind={kind} unit={unit} trace={tr} runId={sceneRun} playMm={play} loop={loop} clock={clock} onComplete={complete('vibration')} />
    sceneKey = `vib-${settings.profile}`
    sizeMm = ext * 1.8
    centerY = 0.25
    timeline = (
      <TraceTimeline
        t={tr.t}
        clock={clock}
        series={[
          { label: 'Deck vertical', unit: 'mm', color: '#8c6c47', values: tr.base, digits: 1 },
          { label: 'Deck lateral', unit: 'mm', color: '#b8946a', values: tr.baseLat, digits: 1 },
          { label: 'Unit lift', unit: 'mm', color: '#2f78b7', values: tr.py, digits: 1 },
          { label: 'Unit slide', unit: 'mm', color: '#c4613b', values: tr.px, digits: 1 },
        ]}
        ticks={tr.contact.map((b) => (b & 7 ? 1 : 0))}
        tickLabel="Wall/lid contact"
        note={`${PROFILE_LABEL[settings.profile]}: ${profileSpec(settings.profile)}`}
      />
    )
    chips.push({ text: `Deck and unit motion magnified ×${MAG} · ${VIB_SPEED * 100}% speed` }, { text: 'Flashes = wall/lid contact recorded by the model · blue outline = unit airborne' }, { text: 'Package rotation is not modelled' })
  }

  /* ------------------------------------------------------------ panels */

  const singleMeta = test === 'drop' ? drop?.meta : test === 'stack' ? stack?.meta : test === 'vibration' ? vib?.meta : undefined
  const singleReasons = singleMeta ? staleReasons(singleMeta, live.meta[test]) : []
  const cfgEff = cfgOpen ?? !mid
  const resEff = resOpen ?? true

  const config = (
    <div className="px-3 pb-6 pt-3">
      <Callout tone="info">Simplified models for comparing options. No result here is a validated or certified test.</Callout>
      <GroupTitle>Design under test</GroupTitle>
      <p className="text-[13px]">
        <strong>v{version.n}</strong> · {version.label}
      </p>
      <p className="text-[11.5px] text-ink-3">Results are tied to this version, these settings and the brief. Change any of them and earlier results are marked outdated.</p>
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
          <NumberField label="Misalignment" bound={{ min: 0, max: 60, step: 1, unit: 'mm', label: 'Misalignment' }} value={offset} onCommit={setOffset} hint="Alternate packs are shifted by this much along the narrower side." />
        </>
      )}
      {test === 'vibration' && (
        <>
          <div className="mb-1 mt-2 text-[13px] font-semibold text-ink-2">Transport profile</div>
          <Segmented<VibrationProfile> label="Transport profile" size="sm" value={profile} onChange={setProfile} options={[{ id: 'smooth', label: 'Smooth' }, { id: 'normal', label: 'Normal' }, { id: 'rough', label: 'Rough' }]} />
          <p className="mt-1 text-[11.5px] text-ink-3">
            {PROFILE_LABEL[profile]}: {profileSpec(profile)}. Fixed random seed, so comparisons repeat exactly.
          </p>
        </>
      )}
      {test === 'break' ? (
        <>
          <p className="mt-2 text-[12.5px] text-ink-2">Runs the three tests one after another under harsher, fixed conditions. Each stage is computed when it starts and shown before the next begins:</p>
          <ol className="mt-1 list-decimal pl-4 text-[12px] text-ink-2">
            <li>Drop: {conditions.drop.heightCm} cm onto a corner</li>
            <li>Stack: {conditions.stack.layers} high, {conditions.stack.offsetMm} mm misaligned</li>
            <li>Vibration: rough road, {conditions.vibration.durationS} s</li>
            <li>Combined results</li>
          </ol>
          <button type="button" className="btn btn-clay mt-3 w-full" onClick={() => startBreak()} disabled={running && !breakStale}>
            <Bomb size={16} aria-hidden /> {shown.stage === 'idle' ? 'Break my design' : 'Start again'}
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-primary mt-3 w-full" onClick={() => runSingle(test)}>
          <Play size={16} aria-hidden /> {singleMeta && singleReasons.length ? 'Re-run with current settings' : `Run ${test} test`}
        </button>
      )}
      {test === 'vibration' && vib && !singleReasons.length && (
        <button type="button" className="btn btn-sm mt-2 h-auto w-full whitespace-normal py-1.5" onClick={compareArrangements}>
          Compare cushioning / divider arrangements
        </button>
      )}
      <GroupTitle>Not modelled in this test</GroupTitle>
      <ul className="list-disc space-y-0.5 pl-4 text-[12px] text-ink-3">
        {NOT_MODELLED[test].map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  )

  const beforeFor = (meta: RunMeta | null | undefined, results: SimResult[], risk: Risk) =>
    before && meta && meta.versionId === before.afterVersionId && meta.test === before.test && !staleReasons(meta, live.meta[before.test]).length ? <BeforeAfter before={before.snap} after={{ versionN: meta.versionN, results: results.map(slim), risk }} conditions={before.conditions} /> : null

  const single = (t: SimTest) => {
    const run = t === 'drop' ? drop : t === 'stack' ? stack : vib
    if (!run) return <Empty text={t === 'drop' ? 'Choose a height and orientation, then run the drop test.' : t === 'stack' ? 'Set the stack height and misalignment, then run.' : 'Pick a transport profile, then run.'} />
    const stale = singleReasons.length > 0
    const r = run.out.result
    return (
      <>
        {stale && <StaleBanner reasons={singleReasons} onRerun={() => runSingle(t)} />}
        {beforeFor(run.meta, [r], r.risk)}
        <ResultCard result={r} stale={stale} conditions={`v${run.meta.versionN} · ${describeSettings(t, run.meta.settings)}`} onApply={(s) => applyAndRerun(s, { meta: run.meta, results: [r], risk: r.risk })} />
        {t === 'stack' && stack && <StackTable out={stack.out} />}
        {t === 'vibration' && vibCompare && vibCompare.key === live.meta.vibration.key && (
          <section className="rounded-xl border border-line bg-white p-3">
            <h3 className="text-[13px] font-bold">Arrangements, same {(vib!.meta.settings as VibrationSettings).profile} profile</h3>
            <table className="mt-1.5 w-full text-[12.5px]">
              <tbody>
                {vibCompare.rows.map((x) => (
                  <tr key={x.label} className="border-t border-line">
                    <td className="py-1.5 pr-2">{x.label}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{x.travel.toFixed(1)} mm/s</td>
                    <td className="py-1.5 text-right">
                      <RiskChip risk={x.risk} prefix="Risk" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </>
    )
  }

  const breakResults = () => {
    if (shown.stage === 'idle') return <Empty text="Break my design runs drop, stack and vibration tests in turn and lists what could fail within these models." />
    const cond = shown.conditions!
    const parts = STAGES.filter((st) => shown[st]).map((st) => shown[st]!.result)
    if (shown.stage === 'summary' && shown.report && shown.meta)
      return (
        <>
          {breakStale && <StaleBanner reasons={staleReasons(shown.meta, live.meta.break)} onRerun={() => startBreak()} />}
          {beforeFor(shown.meta, parts, shown.report.risk)}
          <BreakSummary report={shown.report} meta={shown.meta} played={shown.played} stale={breakStale} onApply={(s) => applyAndRerun(s, { meta: shown.meta!, results: parts, risk: shown.report!.risk })} />
        </>
      )
    return (
      <>
        {shown.stage === 'interrupted' ? (
          <Callout tone="warning">
            {stageMessage(shown)} Partial results below are outdated.{' '}
            <button type="button" className="btn btn-sm mt-1" onClick={() => startBreak()}>
              Restart with current inputs
            </button>
          </Callout>
        ) : (
          <p className="rounded-xl border border-clay/25 bg-white p-3 text-[13px]" role="status">
            {stageMessage(shown)}
          </p>
        )}
        {STAGES.filter((st) => shown[st]).map((st) => (
          <ResultCard key={st} result={shown[st]!.result} compact stale={shown.stage === 'interrupted'} conditions={describeSettings(st, cond[st])} />
        ))}
      </>
    )
  }

  const results = <div className="space-y-3 px-3 pb-6 pt-3">{test === 'break' ? breakResults() : single(test)}</div>

  const stepper = test === 'break' && shown.stage !== 'idle' && (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-white/80 px-2 py-1.5">
      <ol className="flex flex-wrap items-center gap-1 text-[12px]" aria-label="Break my design stages">
        {[...STAGES, 'summary' as const].map((st, i) => {
          const done = st === 'summary' ? shown.stage === 'summary' : shown.played.includes(st)
          const skipped = st !== 'summary' && !done && !!shown[st] && shown.stage === 'summary'
          const cur = shown.stage === st
          return (
            <li key={st} className={`chip ${cur ? 'border-clay/40 bg-clay text-white' : done ? 'border-moss/30 bg-moss-2 text-moss' : 'border-line bg-white text-ink-3'}`} aria-current={cur ? 'step' : undefined}>
              {done && <Check size={12} aria-hidden />} {i + 1} {st === 'summary' ? 'Summary' : STAGE_LABEL[st]}
              {skipped && <span className="font-normal"> · computed, not played</span>}
            </li>
          )
        })}
      </ol>
      <div className="ml-auto flex flex-wrap gap-1">
        {running && !breakStale && (
          <>
            <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'next' })}>
              <StepForward size={14} aria-hidden /> Next stage
            </button>
            <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'skipToSummary' })}>
              <SkipForward size={14} aria-hidden /> Skip to summary
            </button>
          </>
        )}
        {(shown.stage === 'summary' || shown.stage === 'interrupted') && (
          <Segmented<SimTest> label="Scene" size="sm" value={shown.view ?? 'drop'} onChange={(st) => dispatch({ type: 'view', stage: st })} options={STAGES.map((st) => ({ id: st, label: STAGE_LABEL[st], disabled: !shown[st] }))} />
        )}
      </div>
    </div>
  )

  const canvas = (
    <div className="flex h-full min-h-[280px] flex-col">
      {stepper}
      <div className="relative min-h-0 flex-1">
        {scene ? (
          <StudioCanvas key={`${sceneKey}-${version.id}`} sizeMm={sizeMm} label="Simulation scene" centerY={centerY}>
            {scene}
          </StudioCanvas>
        ) : (
          <div className="studio-blueprint grid h-full place-items-center p-6 text-center text-[13px] text-ink-2">Run a test to see it here.</div>
        )}
        {scene && (
          <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap gap-1.5 pr-24">
            <span className="chip border-clay/25 bg-white/90 text-clay">Animation of the simplified model</span>
            {narrow && chips.length > 0 && (
              <button type="button" className="chip pointer-events-auto border-black/10 bg-white/90 text-ink-2" aria-expanded={notesOpen} onClick={() => setNotesOpen((v) => !v)}>
                {notesOpen ? 'Hide display notes' : `Display notes (${chips.length})`}
              </button>
            )}
            {(!narrow || notesOpen ? chips : chips.filter((c) => c.tone === 'warn')).map((c) => (
              <span key={c.text} className={`chip ${c.tone === 'warn' ? 'border-amber/30 bg-amber-2 text-amber' : 'border-black/10 bg-white/85 text-ink-2'}`}>
                {c.text}
              </span>
            ))}
          </div>
        )}
        {scene && legend}
        <div className="absolute right-2 top-2 flex gap-1">
          {!narrow && (
            <button
              type="button"
              className="btn btn-sm bg-white/90"
              onClick={() => {
                const focus = cfgEff || resEff
                setCfgOpen(!focus)
                setResOpen(!focus)
              }}
              aria-label={cfgEff || resEff ? 'Focus the scene (hide side panels)' : 'Show side panels'}
            >
              <Maximize2 size={14} aria-hidden />
            </button>
          )}
        </div>
        {scene && (
          <button type="button" className="btn btn-sm absolute bottom-2 right-2" onClick={() => (test === 'break' ? dispatch({ type: 'view', stage: view! }) : setRunId((r) => r + 1))} disabled={test === 'break' && running}>
            <RotateCcw size={14} aria-hidden /> Replay
          </button>
        )}
      </div>
      {scene && timeline}
    </div>
  )

  if (narrow)
    return (
      <div className="studio-scroll h-full">
        <div className="h-[56vh] border-b border-line">{canvas}</div>
        <div className="studio-side border-b border-line">{results}</div>
        <div className="studio-side">{config}</div>
      </div>
    )

  return (
    <div className="flex h-full">
      {cfgEff ? (
        <aside className="studio-scroll studio-side relative w-[280px] shrink-0 border-r border-line" aria-label="Test settings">
          <button type="button" className="btn btn-ghost btn-sm absolute right-1 top-1 z-10 w-8 px-0" onClick={() => setCfgOpen(false)} aria-label="Hide test settings">
            <PanelLeftClose size={15} aria-hidden />
          </button>
          {config}
        </aside>
      ) : (
        <Rail side="left" label="Settings" onOpen={() => setCfgOpen(true)} />
      )}
      <section className="relative min-w-0 flex-1" aria-label="Simulation scene">
        {canvas}
      </section>
      {resEff ? (
        <aside className="studio-scroll studio-side relative w-[320px] shrink-0 border-l border-line xl:w-[380px]" aria-label="Results">
          <button type="button" className="btn btn-ghost btn-sm absolute right-1 top-1 z-10 w-8 px-0" onClick={() => setResOpen(false)} aria-label="Hide results">
            <PanelRightClose size={15} aria-hidden />
          </button>
          {results}
        </aside>
      ) : (
        <Rail side="right" label="Results" onOpen={() => setResOpen(true)} />
      )}
    </div>
  )
}

function Rail({ side, label, onOpen }: { side: 'left' | 'right'; label: string; onOpen: () => void }) {
  const I = side === 'left' ? PanelLeftOpen : PanelRightOpen
  return (
    <button type="button" onClick={onOpen} className={`studio-side flex w-11 shrink-0 flex-col items-center gap-2 py-3 text-ink-2 hover:text-ink ${side === 'left' ? 'border-r' : 'border-l'} border-line`} aria-label={`Show ${label.toLowerCase()}`}>
      <I size={16} aria-hidden />
      <span className="text-[12px] font-semibold [writing-mode:vertical-rl]">{label}</span>
    </button>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-line bg-white/50 p-4 text-center text-[13px] text-ink-3">{text}</p>
}

function StaleBanner({ reasons, onRerun }: { reasons: string[]; onRerun: () => void }) {
  return (
    <div className="rounded-xl border border-amber/40 bg-amber-2 p-3 text-[12.5px]" role="status">
      <p className="font-semibold text-amber">Outdated: these results were computed for different inputs.</p>
      <ul className="mt-1 list-disc pl-4 text-ink-2">
        {reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <button type="button" className="btn btn-sm mt-2" onClick={onRerun}>
        <Play size={13} aria-hidden /> Re-run with current settings
      </button>
    </div>
  )
}

function StackTable({ out }: { out: StackOutput }) {
  return (
    <section className="rounded-xl border border-line bg-white p-3">
      <h3 className="text-[13px] font-bold">Load by position</h3>
      <p className="mt-0.5 text-[11.5px] text-ink-3">Each pack carries the packs above it. % used = load × safety factor ÷ derated capacity. The same capacity estimate applies to every pack of this design.</p>
      <table className="mt-1.5 w-full text-[12px]">
        <thead>
          <tr className="text-left text-ink-3">
            <th className="font-semibold">Pack</th>
            <th className="text-right font-semibold">Load</th>
            <th className="text-right font-semibold">Capacity</th>
            <th className="text-right font-semibold">Used</th>
            <th className="text-right font-semibold">CoM</th>
          </tr>
        </thead>
        <tbody>
          {out.layers.map((l, i) => (
            <tr key={i} className="border-t border-line">
              <td className="py-1 pr-1">
                <span className="mr-1 inline-block h-2.5 w-2.5 rounded-[3px] align-middle" style={{ background: utilColor(l.utilisation) }} aria-hidden />
                {i === 0 ? 'Bottom' : i === out.layers.length - 1 ? 'Top' : `Pack ${i + 1}`}
              </td>
              <td className="py-1 text-right tabular-nums">{l.loadN.toFixed(0)} N</td>
              <td className="py-1 text-right tabular-nums">{l.capacityN.toFixed(0)} N</td>
              <td className={`py-1 text-right tabular-nums ${l.utilisation >= 1 ? 'font-bold text-rose' : ''}`}>{Math.round(l.utilisation * 100)}%</td>
              <td className={`py-1 text-right tabular-nums ${Math.abs(l.comOffsetMm) > out.supportHalfMm ? 'font-bold text-rose' : ''}`}>{l.comOffsetMm ? `${l.comOffsetMm.toFixed(0)} mm` : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11.5px] text-ink-3">CoM = centre of mass of the packs above, relative to this pack’s centre; it must stay within {out.supportHalfMm.toFixed(0)} mm for the stack to stand (static geometry).</p>
      <p className="mt-1 rounded-md bg-amber-2 p-1.5 text-[11.5px] text-ink-2">Capacity uses the McKee formula, which was derived for corrugated boxes. For board cartons, pulp and PET it is a comparative approximation, not a validated structural capacity.</p>
    </section>
  )
}

function BreakSummary({ report, meta, played, stale, onApply }: { report: BreakReport; meta: RunMeta; played: SimTest[]; stale: boolean; onApply: (s: Suggestion) => void }) {
  const rows = [report.drop.result, report.stack.result, report.vibration.result]
  const allFailures = [...new Set(rows.flatMap((r) => r.failureModes))]
  const worst = rows.find((r) => r.risk === report.risk && r.concerns.length) ?? rows.find((r) => r.concerns.length)
  return (
    <>
      <section className={`rounded-xl border-2 bg-white p-3 ${stale ? 'border-amber/40 opacity-75' : 'border-clay/30'}`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg">Break my design · v{meta.versionN}</h3>
          <RiskChip risk={report.risk} prefix="Overall" />
        </div>
        <p className="mt-1 text-[12px] text-ink-3">
          Conditions: {describeSettings('break', report.conditions)} · model {SIM_MODEL_VERSION} · {new Date(meta.at).toLocaleTimeString()}
        </p>
        <table className="mt-2 w-full text-[12.5px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.test} className="border-t border-line">
                <td className="py-1.5 pr-2 font-semibold">{STAGE_LABEL[r.test]}</td>
                <td className="py-1.5 pr-2">
                  <RiskChip risk={r.risk} prefix="Risk" />
                </td>
                <td className="py-1.5 text-[11px] text-ink-3">{played.includes(r.test) ? 'played' : 'computed, not played'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {worst && (
          <>
            <h4 className="eyebrow mb-0.5 mt-3">Most relevant concern</h4>
            <p className="text-[12.5px] text-ink-2">
              {STAGE_LABEL[worst.test]}: {worst.concerns[0]}
            </p>
          </>
        )}
        <h4 className="eyebrow mb-1 mt-3">Possible failure modes (fixed rules within these models)</h4>
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
            <h4 className="eyebrow mb-1 mt-3">What to try</h4>
            <ul className="space-y-1.5">
              {report.suggestions.slice(0, 3).map((s) => (
                <li key={s.id} className="rounded-lg bg-black/[0.03] p-2">
                  <div className="text-[12.5px] font-semibold">{s.title}</div>
                  <div className="text-[12px] text-ink-3">Why it may help: {s.reason}</div>
                  <button type="button" className="btn btn-sm mt-1" onClick={() => onApply(s)} disabled={stale}>
                    Apply as new version &amp; re-run
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      {rows.map((r) => (
        <ResultCard key={r.test} result={r} compact stale={stale} conditions={describeSettings(r.test, report.conditions[r.test])} />
      ))}
    </>
  )
}


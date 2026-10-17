import { describe, expect, it } from 'vitest'
import { analyse } from './analysis'
import { interpret } from './assistant'
import { breakReducer, initialBreak, type BreakState } from './breakFlow'
import { briefFor, generateParams } from './project'
import { addRun, makeMeta, runKey, runsForVersion, staleReasons, toRecord, type RunRecord } from './runs'
import { breakConditions, breakMyDesign, runDrop, runStack, runVibration, SIM_MODEL_VERSION } from './sims'
import type { DesignVersion } from './types'

const brief = briefFor('strawberry', '2026-10-17')
const p = generateParams({ ...brief, requirements: { ...brief.requirements, template: 'clamshell', cushioning: 'none' } }).params
const a = analyse(p, brief)
const v1: Pick<DesignVersion, 'id' | 'n'> = { id: 'v1', n: 1 }
const v2: Pick<DesignVersion, 'id' | 'n'> = { id: 'v2', n: 2 }
const metric = (r: { metrics: { key: string; value: number }[] }, k: string) => r.metrics.find((m) => m.key === k)!.value

describe('run identity', () => {
  it('is stable for identical inputs', () => {
    expect(runKey('drop', 'v1', a.ctx, { heightCm: 80, orientation: 'corner' })).toBe(runKey('drop', 'v1', analyse(p, brief).ctx, { orientation: 'corner', heightCm: 80 }))
  })

  it('changes with every test setting, the version, the brief and the model version', () => {
    const base = runKey('drop', 'v1', a.ctx, { heightCm: 80, orientation: 'corner' })
    const keys = [
      runKey('drop', 'v1', a.ctx, { heightCm: 60, orientation: 'corner' }),
      runKey('drop', 'v1', a.ctx, { heightCm: 80, orientation: 'side' }),
      runKey('drop', 'v2', a.ctx, { heightCm: 80, orientation: 'corner' }),
      runKey('drop', 'v1', analyse(p, { ...brief, identification: { ...brief.identification, unitWeightG: brief.identification.unitWeightG + 5 } }).ctx, { heightCm: 80, orientation: 'corner' }),
      runKey('drop', 'v1', a.ctx, { heightCm: 80, orientation: 'corner' }, 'sims-old'),
    ]
    for (const k of keys) expect(k).not.toBe(base)
    expect(runKey('stack', 'v1', a.ctx, { layers: 5, offsetMm: 0 })).not.toBe(runKey('stack', 'v1', a.ctx, { layers: 5, offsetMm: 10 }))
    expect(runKey('stack', 'v1', a.ctx, { layers: 5, offsetMm: 0 })).not.toBe(runKey('stack', 'v1', a.ctx, { layers: 6, offsetMm: 0 }))
    expect(runKey('vibration', 'v1', a.ctx, { profile: 'smooth', durationS: 3 })).not.toBe(runKey('vibration', 'v1', a.ctx, { profile: 'rough', durationS: 3 }))
  })

  it('invalidates a run only when an input its model reads changes', () => {
    const longHaul = analyse(p, { ...brief, requirements: { ...brief.requirements, transport: 'long_haul' } }).ctx
    const frozen = analyse(p, { ...brief, metadata: { ...brief.metadata, coldChain: 'frozen' } }).ctx
    const drop = { heightCm: 80, orientation: 'corner' } as const
    const vibr = { profile: 'rough', durationS: 3 } as const
    // Transport and cold chain feed only the stack model (safety factor, climate derating).
    for (const c of [longHaul, frozen]) {
      expect(runKey('drop', 'v1', c, drop)).toBe(runKey('drop', 'v1', a.ctx, drop))
      expect(runKey('vibration', 'v1', c, vibr)).toBe(runKey('vibration', 'v1', a.ctx, vibr))
      expect(runKey('stack', 'v1', c, { layers: 5, offsetMm: 0 })).not.toBe(runKey('stack', 'v1', a.ctx, { layers: 5, offsetMm: 0 }))
      expect(runKey('break', 'v1', c, breakConditions(c))).not.toBe(runKey('break', 'v1', a.ctx, breakConditions(a.ctx)))
    }
    // A storage text change reaches no model at all.
    const text = analyse(p, { ...brief, metadata: { ...brief.metadata, storageText: 'Keep cool.' } }).ctx
    for (const t of ['drop', 'stack', 'vibration'] as const) expect(runKey(t, 'v1', text, t === 'drop' ? drop : t === 'stack' ? { layers: 5, offsetMm: 0 } : vibr)).toBe(runKey(t, 'v1', a.ctx, t === 'drop' ? drop : t === 'stack' ? { layers: 5, offsetMm: 0 } : vibr))
    // Unit weight feeds all three.
    const heavier = analyse(p, { ...brief, identification: { ...brief.identification, unitWeightG: brief.identification.unitWeightG * 2 } }).ctx
    expect(runKey('drop', 'v1', heavier, drop)).not.toBe(runKey('drop', 'v1', a.ctx, drop))
    expect(runKey('stack', 'v1', heavier, { layers: 5, offsetMm: 0 })).not.toBe(runKey('stack', 'v1', a.ctx, { layers: 5, offsetMm: 0 }))
  })

  it('stored runs keep their input snapshot and name what changed since', () => {
    const meta = makeMeta('drop', v1, a.ctx, { heightCm: 80, orientation: 'bottom' })
    const rec = toRecord(meta, [runDrop(a.ctx, { heightCm: 80, orientation: 'bottom' }).result], 'low', 'r1')
    expect(rec.inputs).toEqual(meta.inputs)
    expect((rec.inputs as { unitWeightG: number }).unitWeightG).toBe(brief.identification.unitWeightG)
    const heavier = analyse(p, { ...brief, identification: { ...brief.identification, unitWeightG: brief.identification.unitWeightG * 2 } }).ctx
    const [st] = runsForVersion([rec], { id: 'v1' }, heavier)
    expect(st.status).toBe('superseded')
    expect(st.status === 'superseded' && st.reason).toMatch(/unit weight changed/)
    expect(runsForVersion([rec], { id: 'v1' }, a.ctx)[0].status).toBe('matches')
  })

  it('ignores price assumptions, which no simulation reads', () => {
    const priced = analyse(p, brief, { [p.material]: { pricePerKg: 99 } })
    expect(runKey('stack', 'v1', priced.ctx, { layers: 5, offsetMm: 0 })).toBe(runKey('stack', 'v1', a.ctx, { layers: 5, offsetMm: 0 }))
  })

  it('names what changed since a result was computed', () => {
    const prev = makeMeta('drop', v1, a.ctx, { heightCm: 80, orientation: 'corner' })
    expect(staleReasons(prev, makeMeta('drop', v1, a.ctx, { heightCm: 80, orientation: 'corner' }))).toEqual([])
    expect(staleReasons(prev, makeMeta('drop', v1, a.ctx, { heightCm: 60, orientation: 'corner' }))).toEqual(['Drop height 80 cm → 60 cm'])
    expect(staleReasons(prev, makeMeta('drop', v2, a.ctx, { heightCm: 80, orientation: 'corner' }))).toContain('Design v1 → v2')
    const transport = analyse(p, { ...brief, requirements: { ...brief.requirements, transport: 'long_haul' } })
    const st = makeMeta('stack', v1, a.ctx, { layers: 5, offsetMm: 0 })
    expect(staleReasons(st, makeMeta('stack', v1, transport.ctx, { layers: 5, offsetMm: 0 }))).toContain('Brief: transport changed')
  })
})

describe('simulation inputs', () => {
  it('unchanged inputs give identical outputs, traces included', () => {
    expect(runDrop(a.ctx, { heightCm: 80, orientation: 'corner' })).toEqual(runDrop(a.ctx, { heightCm: 80, orientation: 'corner' }))
    expect(runStack(a.ctx, { layers: 5, offsetMm: 12 })).toEqual(runStack(a.ctx, { layers: 5, offsetMm: 12 }))
    expect(runVibration(a.ctx, { profile: 'normal', durationS: 3 })).toEqual(runVibration(a.ctx, { profile: 'normal', durationS: 3 }))
  })

  it('each setting changes the calculation it belongs to', () => {
    const g = (h: number, o: 'bottom' | 'side' | 'corner') => metric(runDrop(a.ctx, { heightCm: h, orientation: o }).result, 'pkgG')
    expect(g(100, 'bottom')).toBeGreaterThan(g(40, 'bottom'))
    expect(g(80, 'corner')).not.toBeCloseTo(g(80, 'bottom'), 0)
    expect(metric(runStack(a.ctx, { layers: 8, offsetMm: 0 }).result, 'load')).toBeGreaterThan(metric(runStack(a.ctx, { layers: 4, offsetMm: 0 }).result, 'load'))
    expect(metric(runStack(a.ctx, { layers: 5, offsetMm: 30 }).result, 'derated')).toBeLessThan(metric(runStack(a.ctx, { layers: 5, offsetMm: 0 }).result, 'derated'))
    const travel = (pr: 'smooth' | 'rough') => metric(runVibration(a.ctx, { profile: pr, durationS: 3 }).result, 'travel')
    expect(travel('rough')).toBeGreaterThan(travel('smooth'))
  })

  it('traces carry what the scenes display', () => {
    const d = runDrop(a.ctx, { heightCm: 80, orientation: 'bottom' }).trace
    expect(d.acc).toHaveLength(d.t.length)
    expect(d.contact).toHaveLength(d.t.length)
    expect(Math.max(...d.acc)).toBeGreaterThan(0)
    expect(d.acc.slice(0, d.impactIndex).every((x) => x === 0)).toBe(true)
    const vt = runVibration(a.ctx, { profile: 'rough', durationS: 3 }).trace
    expect(vt.baseLat).toHaveLength(vt.t.length)
    expect(vt.contact).toHaveLength(vt.t.length)
    const amp = (pr: 'smooth' | 'rough') => Math.max(...runVibration(a.ctx, { profile: pr, durationS: 3 }).trace.base.map(Math.abs))
    expect(amp('rough')).toBeGreaterThan(amp('smooth') * 2)
  })

  it('stack layers: loads add up and the static tipping check follows the geometry', () => {
    const s = runStack(a.ctx, { layers: 4, offsetMm: 0 })
    const gross = metric(s.result, 'gross') / 1000
    s.layers.forEach((l, i) => expect(l.loadN).toBeCloseTo((3 - i) * gross * 9.81, 6))
    expect(s.tipMargin).toBe(1)
    const half = s.supportHalfMm
    // Two packs: the top pack's centre of mass sits at the offset, so beyond half the footprint it cannot stand.
    const leaning = runStack(a.ctx, { layers: 2, offsetMm: Math.ceil(half + 2) })
    expect(leaning.tipMargin).toBeLessThan(0)
    expect(leaning.result.failureModes).toContain('Stack tips over (static geometry)')
    expect(runStack(a.ctx, { layers: 2, offsetMm: Math.floor(half - 2) }).tipMargin).toBeGreaterThan(0)
    const slight = runStack(a.ctx, { layers: 3, offsetMm: 5 })
    expect(slight.tipMargin).toBeGreaterThan(0)
    expect(slight.layers[0].comOffsetMm).toBeCloseTo(2.5, 6)
  })
})

describe('break my design sequence', () => {
  const cond = breakConditions(a.ctx)
  const meta = makeMeta('break', v1, a.ctx, cond)
  const start = (): BreakState => breakReducer(initialBreak, { type: 'start', ctx: a.ctx, meta, conditions: cond })

  it('computes each stage only when the sequence reaches it', () => {
    let s = start()
    expect(s.stage).toBe('drop')
    expect(s.drop).toBeDefined()
    expect(s.stack).toBeUndefined()
    s = breakReducer(s, { type: 'stageComplete', stage: 'drop' })
    expect(s.stage).toBe('stack')
    expect(s.stack).toBeDefined()
    expect(s.vibration).toBeUndefined()
    s = breakReducer(s, { type: 'stageComplete', stage: 'stack' })
    expect(s.stage).toBe('vibration')
    s = breakReducer(s, { type: 'stageComplete', stage: 'vibration' })
    expect(s.stage).toBe('summary')
    expect(s.played).toEqual(['drop', 'stack', 'vibration'])
    expect(s.report!.risk).toBe(breakMyDesign(a.ctx, cond).risk)
  })

  it('ignores late completion callbacks from scenes that are not running', () => {
    const s = start()
    expect(breakReducer(s, { type: 'stageComplete', stage: 'stack' })).toBe(s)
  })

  it('skip computes the rest without claiming it was played', () => {
    const s = breakReducer(start(), { type: 'skipToSummary' })
    expect(s.stage).toBe('summary')
    expect(s.played).toEqual([])
    expect(s.report).toEqual(breakMyDesign(a.ctx, cond))
    const nx = breakReducer(start(), { type: 'next' })
    expect(nx.stage).toBe('stack')
    expect(nx.played).toEqual([])
  })

  it('replays a stored stage in the summary and is interrupted by changed inputs', () => {
    const sum = breakReducer(start(), { type: 'skipToSummary' })
    const r = breakReducer(sum, { type: 'view', stage: 'vibration' })
    expect(r.view).toBe('vibration')
    expect(r.replay).toBe(sum.replay + 1)
    expect(r.stage).toBe('summary')
    const running = start()
    expect(breakReducer(running, { type: 'inputsChanged', key: meta.key })).toBe(running)
    const stopped = breakReducer(running, { type: 'inputsChanged', key: 'other' })
    expect(stopped.stage).toBe('interrupted')
    expect(stopped.interruptedAt).toBe('drop')
    expect(breakReducer(stopped, { type: 'stageComplete', stage: 'drop' }).stage).toBe('interrupted')
    // Replay keeps the configuration the sequence was computed with, not the changed inputs.
    expect(stopped.ctx).toBe(running.ctx)
    expect(breakReducer(sum, { type: 'inputsChanged', key: 'other' }).ctx).toBe(sum.ctx)
  })
})

describe('report provenance', () => {
  const cond = breakConditions(a.ctx)
  const rec = (version: Pick<DesignVersion, 'id' | 'n'>, at: string, settings = cond, modelVersion = SIM_MODEL_VERSION): RunRecord => {
    const r = breakMyDesign(a.ctx, settings)
    return { ...toRecord(makeMeta('break', version, a.ctx, settings, at), [r.drop.result, r.stack.result, r.vibration.result], r.risk, `id-${at}`), modelVersion }
  }

  it('matches only runs of the same version, inputs and model', () => {
    const runs = [rec(v1, '2026-10-01T00:00:00Z'), rec(v2, '2026-10-02T00:00:00Z'), rec(v1, '2026-10-03T00:00:00Z', cond, 'sims-1')]
    const st = runsForVersion(runs, v1, a.ctx)
    expect(st).toHaveLength(2)
    expect(st[0].status).toBe('matches')
    expect(st[1].status).toBe('superseded')
    const changed = analyse(p, { ...brief, requirements: { ...brief.requirements, transport: 'long_haul' } })
    expect(runsForVersion(runs, v1, changed.ctx)[0].status).toBe('superseded')
  })

  it('keeps provenance on each record and replaces identical re-runs', () => {
    const a1 = rec(v1, '2026-10-01T00:00:00Z')
    const a2 = rec(v1, '2026-10-05T00:00:00Z')
    expect(a1.key).toBe(a2.key)
    const runs = addRun(addRun([], a1), a2)
    expect(runs).toHaveLength(1)
    expect(runs[0].at).toBe('2026-10-05T00:00:00Z')
    expect(runs[0]).toMatchObject({ versionId: 'v1', versionN: 1, modelVersion: SIM_MODEL_VERSION, test: 'break' })
    expect(runs[0].results).toHaveLength(3)
  })
})

describe('assistant previews and limits', () => {
  const ctx = { params: p, brief, assumptions: {} }
  it('change proposals carry a before/after preview', () => {
    const r = interpret('Make it 20 mm taller', ctx)
    if (r.kind !== 'change') throw new Error('expected change')
    expect(r.impact.map((x) => x.label)).toContain('Material per pack')
    expect(r.impact.find((x) => x.label === 'Material per pack')!.after).not.toBe(r.impact.find((x) => x.label === 'Material per pack')!.before)
  })
  it('unsupported and out-of-scope requests point to supported ones', () => {
    const shelf = interpret('Will this extend shelf life?', ctx)
    expect(shelf.kind).toBe('unsupported')
    if (shelf.kind === 'unsupported') expect(shelf.summary).toMatch(/Outside what this studio models/)
    const r = interpret('make the walls more stackable please', ctx)
    expect(r.kind).toBe('change')
    const u = interpret('paint it purple with stripes', ctx)
    if (u.kind !== 'unsupported') throw new Error('expected unsupported')
    expect(u.related?.length).toBeGreaterThan(0)
    expect(interpret('Compare recyclable paperboard with food-grade PET', ctx).kind).toBe('info')
    // Word boundaries: "resistant" must not read as the ISTA standard.
    const res = interpret('Make the tray more resistant', ctx)
    expect(res.kind === 'unsupported' ? res.summary : '').not.toMatch(/Outside/)
  })
})


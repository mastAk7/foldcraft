import { SIM_MODEL_VERSION, type BreakConditions, type SimContext } from './sims'
import type { DesignVersion, DropSettings, Risk, SimResult, StackSettings, VibrationSettings } from './types'

/**
 * Run identity. A result is "current" only when it was computed for exactly the inputs the lab would
 * use now: same design version, same test settings, same brief-derived context and same model version.
 */

export type RunTest = 'drop' | 'stack' | 'vibration' | 'break'
export type RunSettings = DropSettings | StackSettings | VibrationSettings | BreakConditions

/** Every context field any model reads. Price assumptions are left out: no simulation reads them. */
function allInputs(ctx: SimContext) {
  const a = ctx.pkg.arrangement
  return {
    params: ctx.params,
    packMassG: +ctx.packMassG.toFixed(4),
    outer: ctx.pkg.outer,
    innerH: ctx.pkg.inner.h,
    clearance: a.clearance,
    layers: a.layers,
    cells: ctx.pkg.cells.length,
    produce: ctx.produce,
    fragility: ctx.fragility,
    unitWeightG: ctx.unitWeightG,
    unit: ctx.unit,
    units: ctx.units,
    coldChain: ctx.coldChain,
    humidityMaxPct: ctx.humidityMaxPct ?? null,
    transport: ctx.transport,
    stackLayers: ctx.stackLayers,
  }
}
type AllInputs = ReturnType<typeof allInputs>

/**
 * The fields each test's model reads. A run goes out of date only when one of these changes, so e.g. a
 * cold-chain or transport change leaves drop and vibration results current (they don't use either).
 */
export const RELEVANT: Record<RunTest, (keyof AllInputs)[]> = {
  drop: ['params', 'packMassG', 'innerH', 'clearance', 'layers', 'cells', 'produce', 'fragility', 'unitWeightG', 'unit', 'units'],
  stack: ['params', 'packMassG', 'outer', 'unitWeightG', 'units', 'coldChain', 'humidityMaxPct', 'transport'],
  vibration: ['params', 'innerH', 'clearance', 'layers', 'cells', 'produce', 'fragility', 'unitWeightG', 'unit', 'units'],
  break: ['params', 'packMassG', 'outer', 'innerH', 'clearance', 'layers', 'cells', 'produce', 'fragility', 'unitWeightG', 'unit', 'units', 'coldChain', 'humidityMaxPct', 'transport', 'stackLayers'],
}

export function ctxInputs(ctx: SimContext, test: RunTest): Partial<AllInputs> {
  const all = allInputs(ctx)
  return Object.fromEntries(RELEVANT[test].map((k) => [k, all[k]])) as Partial<AllInputs>
}
export type RunInputs = ReturnType<typeof ctxInputs>

export function stableStringify(v: unknown): string {
  if (v === undefined) return 'null'
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`
}

/** Two FNV-1a passes with different offsets: a short, stable fingerprint (not cryptographic). */
function hash(s: string) {
  let a = 0x811c9dc5
  let b = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 13)
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36)
}

export function runKey(test: RunTest, versionId: string, ctx: SimContext, settings: RunSettings, modelVersion = SIM_MODEL_VERSION) {
  return `${modelVersion}:${test}:${hash(stableStringify({ test, versionId, settings, inputs: ctxInputs(ctx, test) }))}`
}

export interface RunMeta {
  key: string
  test: RunTest
  versionId: string
  versionN: number
  settings: RunSettings
  inputs: RunInputs
  modelVersion: string
  at: string
}

export function makeMeta(test: RunTest, version: Pick<DesignVersion, 'id' | 'n'>, ctx: SimContext, settings: RunSettings, at = new Date().toISOString()): RunMeta {
  return { key: runKey(test, version.id, ctx, settings), test, versionId: version.id, versionN: version.n, settings, inputs: ctxInputs(ctx, test), modelVersion: SIM_MODEL_VERSION, at }
}

const SETTING_LABEL: Record<string, [string, string]> = {
  heightCm: ['Drop height', ' cm'],
  orientation: ['Impact orientation', ''],
  layers: ['Packs in stack', ''],
  offsetMm: ['Misalignment', ' mm'],
  profile: ['Transport profile', ''],
  durationS: ['Duration', ' s'],
}
const INPUT_LABEL: Record<string, string> = {
  params: 'Design parameters',
  packMassG: 'Pack mass',
  outer: 'Outer size',
  innerH: 'Inner height',
  clearance: 'Fit of the contents',
  layers: 'Layers of contents',
  cells: 'Cell layout',
  produce: 'Brief: produce',
  fragility: 'Brief: fragility',
  unitWeightG: 'Brief: unit weight',
  unit: 'Brief: unit size',
  units: 'Brief: units per pack',
  coldChain: 'Brief: cold chain',
  humidityMaxPct: 'Brief: humidity',
  transport: 'Brief: transport',
  stackLayers: 'Brief: stack height',
}

function flatten(s: RunSettings, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s)) {
    if (v && typeof v === 'object') Object.assign(out, flatten(v as RunSettings, `${k}.`))
    else out[prefix + k] = v
  }
  return out
}

/** Why a stored result no longer matches the current inputs, in plain words. Empty when it matches. */
export function staleReasons(prev: RunMeta, cur: RunMeta): string[] {
  if (prev.key === cur.key) return []
  const out: string[] = []
  if (prev.test !== cur.test) return ['Different test']
  if (prev.versionId !== cur.versionId) out.push(`Design v${prev.versionN} → v${cur.versionN}`)
  if (prev.modelVersion !== cur.modelVersion) out.push('Simulation model updated')
  const a = flatten(prev.settings)
  const b = flatten(cur.settings)
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[k] === b[k]) continue
    const base = k.split('.').pop()!
    const [label, unit] = SETTING_LABEL[base] ?? [base, '']
    const stage = k.includes('.') ? `${k.split('.')[0]}: ` : ''
    out.push(`${stage.charAt(0).toUpperCase()}${stage.slice(1)}${stage ? label.toLowerCase() : label} ${String(a[k])}${unit} → ${String(b[k])}${unit}`)
  }
  if (prev.versionId === cur.versionId) out.push(...inputChanges(prev.inputs, cur.inputs))
  return out.length ? out : ['Inputs changed']
}

/** Relevant inputs that differ between two snapshots, in plain words. */
export function inputChanges(prev: RunInputs | undefined, cur: RunInputs): string[] {
  if (!prev) return []
  const p = prev as Record<string, unknown>
  const c = cur as Record<string, unknown>
  return Object.keys(INPUT_LABEL)
    .filter((k) => k in c && stableStringify(p[k]) !== stableStringify(c[k]))
    .map((k) => `${INPUT_LABEL[k]} changed`)
}

/* ------------------------------------------------------------------ persisted run records */

export type SlimResult = Pick<SimResult, 'test' | 'method' | 'headline' | 'risk' | 'metrics' | 'concerns' | 'failureModes' | 'assumptions'>

export interface RunRecord {
  id: string
  key: string
  test: RunTest
  versionId: string
  versionN: number
  settings: RunSettings
  /** Snapshot of the inputs the model read (absent on records from before sims-4). */
  inputs?: RunInputs
  modelVersion: string
  at: string
  risk: Risk
  results: SlimResult[]
}

export const MAX_RUNS = 40

export const slim = (r: SimResult): SlimResult => ({ test: r.test, method: r.method, headline: r.headline, risk: r.risk, metrics: r.metrics, concerns: r.concerns, failureModes: r.failureModes, assumptions: r.assumptions })

export function toRecord(meta: RunMeta, results: SimResult[], risk: Risk, id: string): RunRecord {
  return { id, key: meta.key, test: meta.test, versionId: meta.versionId, versionN: meta.versionN, settings: meta.settings, inputs: meta.inputs, modelVersion: meta.modelVersion, at: meta.at, risk, results: results.map(slim) }
}

/** Newest first, de-duplicated by key (re-running identical inputs replaces the older record), capped. */
export function addRun(runs: RunRecord[] | undefined, rec: RunRecord): RunRecord[] {
  return [rec, ...(runs ?? []).filter((r) => r.key !== rec.key)].slice(0, MAX_RUNS)
}

export function isRunRecord(v: unknown): v is RunRecord {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return typeof r.id === 'string' && typeof r.key === 'string' && typeof r.versionId === 'string' && typeof r.at === 'string' && typeof r.modelVersion === 'string' && ['drop', 'stack', 'vibration', 'break'].includes(r.test as string) && Array.isArray(r.results) && !!r.settings && typeof r.settings === 'object'
}

export type RunStatus = { run: RunRecord; status: 'matches' } | { run: RunRecord; status: 'superseded'; reason: string }

/** Classify stored runs of one version against the inputs that version would be tested with now. */
export function runsForVersion(runs: RunRecord[] | undefined, version: Pick<DesignVersion, 'id'>, ctx: SimContext): RunStatus[] {
  return (runs ?? [])
    .filter((r) => r.versionId === version.id)
    .map((run): RunStatus => {
      if (run.modelVersion !== SIM_MODEL_VERSION) return { run, status: 'superseded', reason: `Computed with model ${run.modelVersion}; current model is ${SIM_MODEL_VERSION}.` }
      if (runKey(run.test, version.id, ctx, run.settings) !== run.key) {
        const changed = inputChanges(run.inputs, ctxInputs(ctx, run.test))
        return { run, status: 'superseded', reason: changed.length ? `${changed.join('; ')} after this run.` : 'The brief or derived inputs changed after this run.' }
      }
      return { run, status: 'matches' }
    })
}

export function describeSettings(test: RunTest, s: RunSettings): string {
  if (test === 'break') {
    const c = s as BreakConditions
    return `${c.drop.heightCm} cm ${c.drop.orientation} drop · stack of ${c.stack.layers}, ${c.stack.offsetMm} mm offset · ${c.vibration.profile} road ${c.vibration.durationS} s`
  }
  if (test === 'drop') {
    const d = s as DropSettings
    return `${d.heightCm} cm ${d.orientation} drop`
  }
  if (test === 'stack') {
    const st = s as StackSettings
    return `Stack of ${st.layers}, ${st.offsetMm} mm misalignment`
  }
  const v = s as VibrationSettings
  return `${v.profile} road, ${v.durationS} s`
}

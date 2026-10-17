import { MATERIALS } from './materials'
import { sensitivity } from './produce'
import type { BuiltPackage } from './templates'
import type {
  ColdChain,
  DesignParams,
  DropSettings,
  DropTrace,
  Fragility,
  ProduceKind,
  Risk,
  SimResult,
  StackSettings,
  Suggestion,
  Transport,
  VibrationSettings,
  VibrationTrace,
} from './types'

/**
 * Simplified, deterministic package models.
 *
 *  - drop:      two-mass, one-axis spring–damper model integrated in time (semi-implicit Euler).
 *  - stack:     McKee-form compression estimate with stated derating and safety factors.
 *  - vibration: one representative unit as a mass on spring–damper contacts inside its cell,
 *               driven by a fixed, seeded road-like base motion.
 *
 * None of these is a validated test, a finite-element analysis or a material-failure prediction.
 * They exist to compare design options under identical, disclosed assumptions.
 */

const G = 9.81
/** Assumed stiffness of a 4 mm fibre cushioning pad under one unit, N/m. */
const PAD_K = 4e3

export interface SimContext {
  params: DesignParams
  pkg: BuiltPackage
  packMassG: number
  produce: ProduceKind
  fragility: Fragility
  unitWeightG: number
  units: number
  coldChain: ColdChain
  humidityMaxPct?: number
  transport: Transport
  stackLayers: number
}

export const LIMITATIONS = [
  'Simplified model for comparing options. Not a validated or certified test.',
  'Does not predict real material failure, product damage or shelf life.',
]

const riskOrder: Risk[] = ['low', 'moderate', 'high']
export const maxRisk = (...r: Risk[]): Risk => riskOrder[Math.max(...r.map((x) => riskOrder.indexOf(x)))]

/* ================================================================= integrator */

export interface Body {
  x: number
  v: number
  m: number
}

/** One semi-implicit Euler step: v += a·dt; x += v·dt. Deterministic and stable for dt ≪ 2/ω. */
export function step(b: Body, force: number, dt: number) {
  b.v += (force / b.m) * dt
  b.x += b.v * dt
}

/** Compressive-only spring–damper contact. Returns the (≥ 0) contact force for penetration d. */
export function contact(d: number, dv: number, k: number, c: number) {
  if (d <= 0) return 0
  return Math.max(0, k * d + c * dv)
}

const damping = (k: number, m: number, zeta: number) => 2 * zeta * Math.sqrt(k * m)

/* ================================================================= drop */

export interface DropOutput {
  result: SimResult
  trace: DropTrace
}

function hasLid(p: DesignParams) {
  return p.template === 'folding_carton' || p.template === 'clamshell' || ((p.template === 'produce_tray' || p.template === 'compartment_tray') && p.filmLid)
}

function cellsSeparateUnits(ctx: SimContext) {
  return ctx.pkg.cells.length > 1 && ctx.pkg.cells.length >= ctx.units * 0.6
}

export function runDrop(ctx: SimContext, s: DropSettings): DropOutput {
  const p = ctx.params
  const mat = MATERIALS[p.material]
  const sens = sensitivity(ctx.produce, ctx.fragility)
  const m = ctx.unitWeightG / 1000
  const M = (ctx.packMassG + ctx.unitWeightG * Math.max(0, ctx.units - 1)) / 1000
  const ribs = 'cornerRibs' in p && p.cornerRibs ? 1.2 : 1
  const orientK = s.orientation === 'bottom' ? 1 : s.orientation === 'side' ? 0.8 : 0.5
  const wallK = Math.min(1.6, Math.max(0.6, p.wallMm / mat.wall.default))
  const kg = mat.contactStiffness * orientK * ribs * wallK
  const pad = 'insert' in p && p.insert === 'pad'
  const cells = cellsSeparateUnits(ctx)
  // Product-side compliance: the produce itself in series with a pad (bottom drops) or cell walls (side/corner).
  let kc = sens.stiffness
  if (pad && s.orientation !== 'side') kc = 1 / (1 / kc + 1 / PAD_K)
  if (cells && s.orientation !== 'bottom') kc = 1 / (1 / kc + 1 / 2.5e4)
  const cg = damping(kg, M + m, 0.35)
  const cc = damping(kc, m, 0.5)
  // Units can rebound only as far as the lid (if any); open trays let them leave.
  const lid = hasLid(p)
  const headroom = Math.max(1, ctx.pkg.arrangement.clearance.y) / 1000

  const h = s.heightCm / 100
  const pkgB: Body = { x: -h, v: 0, m: M }
  const prod: Body = { x: -h, v: 0, m }
  const dt = 1e-5
  const tFall = Math.sqrt((2 * h) / G)
  const tEnd = tFall + 0.35
  const trace: DropTrace = { t: [], y: [], rel: [], impactIndex: 0 }
  let peakProdF = 0
  let peakPkgF = 0
  let maxCrush = 0
  let maxLift = 0
  let maxCompress = 0
  let impacted = false
  // Peaks are taken over the first impact only (until the package leaves the floor + 20 ms);
  // later bounces in this simple model exaggerate re-contact and are shown only in the animation.
  let firstImpactEnd = Infinity
  let nextSample = 0
  for (let t = 0; t <= tEnd; t += dt) {
    const fg = contact(pkgB.x, pkgB.v, kg, cg)
    const d = prod.x - pkgB.x
    const fc = contact(d, prod.v - pkgB.v, kc, cc) - (lid ? contact(-d - headroom, pkgB.v - prod.v, kc, cc) : 0)
    if (fg > 0 && !impacted) {
      impacted = true
      trace.impactIndex = trace.t.length
    }
    if (impacted && fg === 0 && firstImpactEnd === Infinity) firstImpactEnd = t + 0.02
    if (t <= firstImpactEnd) {
      peakPkgF = Math.max(peakPkgF, fg)
      peakProdF = Math.max(peakProdF, Math.abs(fc))
      maxCrush = Math.max(maxCrush, pkgB.x)
      maxCompress = Math.max(maxCompress, d)
    }
    if (impacted) maxLift = Math.max(maxLift, -d)
    step(pkgB, M * G - fg + fc, dt)
    step(prod, m * G - fc, dt)
    if (t >= nextSample) {
      trace.t.push(t)
      trace.y.push(-pkgB.x * 1000)
      trace.rel.push(d * 1000)
      nextSample += t < tFall - 0.02 ? 0.01 : 0.001
    }
  }

  const peakProdG = peakProdF / m / G
  const peakPkgG = peakPkgF / M / G
  const crushMm = maxCrush * 1000
  const liftMm = maxLift * 1000
  const v0 = Math.sqrt(2 * G * h)
  const ratio = peakProdG / sens.g
  let risk: Risk = ratio < 0.8 ? 'low' : ratio < 1.2 ? 'moderate' : 'high'
  const concerns: string[] = []
  const failureModes: string[] = []
  const limit = mat.elasticLimitMm * (s.orientation === 'corner' ? 0.6 : 1)
  if (crushMm > limit) {
    concerns.push(`Estimated ${s.orientation} deformation of ${crushMm.toFixed(1)} mm exceeds the ${limit.toFixed(1)} mm the model treats as recoverable for ${mat.short}.`)
    failureModes.push(s.orientation === 'corner' ? 'Corner crush' : 'Wall/base deformation')
    risk = maxRisk(risk, 'moderate')
  }
  if (liftMm > headroom * 1000 + 1) {
    if (hasLid(p)) {
      concerns.push(`Units rebound into the lid (${(headroom * 1000).toFixed(0)} mm headspace).`)
      failureModes.push('Contents strike lid')
    } else {
      concerns.push(`Units rebound more than ${Math.min(liftMm, 99).toFixed(0)} mm above their rest position in an open tray. Loose units may leave the tray.`)
      failureModes.push('Contents thrown from open tray')
      risk = maxRisk(risk, 'moderate')
    }
  }
  if (p.template === 'folding_carton' && s.orientation !== 'side' && peakPkgG > 180) failureModes.push('Tuck flap may pop open (rule: carton, >180 g package deceleration)')
  if (p.template === 'clamshell' && peakPkgG > 150 && ctx.unitWeightG * ctx.units > 300) failureModes.push('Latch may release (rule: >150 g with >300 g contents)')
  if (ratio >= 0.8) failureModes.push('Bruising/impact damage to produce')

  const suggestions: Suggestion[] = []
  if (ratio >= 0.8) {
    if ('insert' in p && p.insert === 'none' && s.orientation !== 'side')
      suggestions.push({ id: 'drop-pad', title: 'Add a cushioning pad', reason: 'A pad under the produce adds compliance and lowers the peak deceleration in bottom and corner drops.', patch: { insert: 'pad' } })
    if (s.orientation !== 'bottom' && !cells && p.template === 'produce_tray')
      suggestions.push({ id: 'drop-cells', title: 'Switch to a compartment tray', reason: 'Cell walls keep units apart and cushion side and corner impacts.', patch: { template: 'compartment_tray' } })
    if (p.material !== 'moulded_pulp' && (p.template === 'produce_tray' || p.template === 'compartment_tray' || p.template === 'clamshell'))
      suggestions.push({ id: 'drop-pulp', title: 'Try moulded pulp', reason: 'Moulded fibre is more compliant than PET in this model, so impacts are softer (trade-off: lower stacking strength when chilled).', patch: { material: 'moulded_pulp' } })
  }
  if (crushMm > limit && 'cornerRibs' in p && !p.cornerRibs)
    suggestions.push({ id: 'drop-ribs', title: 'Add corner ribs', reason: 'Ribs stiffen the corners where the model sees the largest deformation.', patch: { cornerRibs: true } })
  if (crushMm > limit && p.wallMm < mat.wall.max)
    suggestions.push({ id: 'drop-wall', title: 'Thicker wall', reason: `Raise the wall from ${p.wallMm} mm towards ${Math.min(mat.wall.max, +(p.wallMm * 1.25).toFixed(2))} mm to reduce deformation.`, patch: { wallMm: Math.min(mat.wall.max, +(p.wallMm * 1.25).toFixed(2)) } })

  return {
    trace,
    result: {
      test: 'drop',
      method: 'simplified_motion_model',
      headline:
        risk === 'low'
          ? `Low estimated risk from a ${s.heightCm} cm ${s.orientation} drop`
          : risk === 'moderate'
            ? `Moderate estimated risk from a ${s.heightCm} cm ${s.orientation} drop`
            : `High estimated risk from a ${s.heightCm} cm ${s.orientation} drop`,
      risk,
      metrics: [
        { key: 'v0', label: 'Impact speed', value: v0, unit: 'm/s', digits: 2, method: 'calculated' },
        { key: 'pkgG', label: 'Peak package deceleration', value: peakPkgG, unit: 'g', digits: 0, method: 'simplified_motion_model' },
        { key: 'prodG', label: 'Peak deceleration on a unit', value: peakProdG, unit: 'g', digits: 0, method: 'simplified_motion_model' },
        { key: 'threshold', label: 'Assumed sensitivity level', value: sens.g, unit: 'g', digits: 0, method: 'simplified_estimate' },
        { key: 'crush', label: 'Max package deformation', value: crushMm, unit: 'mm', digits: 1, method: 'simplified_motion_model' },
        { key: 'compress', label: 'Unit compression at contact', value: maxCompress * 1000, unit: 'mm', digits: 1, method: 'simplified_motion_model' },
        { key: 'lift', label: 'Unit rebound inside pack', value: Math.min(liftMm, 99), unit: 'mm', digits: 1, method: 'simplified_motion_model' },
      ],
      concerns,
      failureModes,
      suggestions,
      assumptions: [
        `Impact speed √(2gh) from ${s.heightCm} cm onto a rigid floor.`,
        `Package-to-floor contact stiffness ${Math.round(kg / 1000)} kN/m (${mat.short}, ${s.orientation} face${ribs > 1 ? ', ribbed' : ''}); damping ratio 0.35.`,
        `One ${ctx.unitWeightG} g unit against its support, stiffness ${Math.round(kc / 1000)} kN/m${pad ? ' incl. pad' : ''}${cells && s.orientation !== 'bottom' ? ' incl. cell wall' : ''}; damping ratio 0.5 (produce absorbs energy).`,
        lid ? `Rebound limited by the lid at ${(headroom * 1000).toFixed(0)} mm headspace.` : 'Open top: rebound is not limited (shown up to 99 mm).',
        `Risk bands: below 80% of the assumed ${Math.round(sens.g)} g sensitivity = low, up to 120% = moderate, above = high.`,
      ],
      limitations: [...LIMITATIONS, 'Rotation, multiple impacts on different faces and unit-to-unit contact are not modelled.'],
    },
  }
}

/* ================================================================= stack */

export interface StackOutput {
  result: SimResult
  /** Load utilisation for each pack, bottom first (load × safety ÷ derated capacity). */
  utilisation: number[]
  overhangPct: number
}

export const SAFETY: Record<Transport, number> = { local: 2.5, regional: 3, long_haul: 4 }

export function stackCapacityN(p: DesignParams): { capacity: number; ect: number; perimeter: number; form: number } {
  const mat = MATERIALS[p.material]
  const ect = mat.ectPerMm * p.wallMm // N/mm
  let perimeter = 2 * (p.length + p.width)
  let form = p.template === 'folding_carton' ? 1 : p.template === 'produce_tray' ? 0.75 : p.template === 'clamshell' ? 0.7 : 0.85
  if (p.template === 'compartment_tray') perimeter += 0.5 * ((p.cellsX - 1) * p.width + (p.cellsY - 1) * p.length)
  if ('cornerRibs' in p && p.cornerRibs) form *= 1.25
  const capacity = 5.87 * ect * Math.sqrt(p.wallMm * perimeter) * form
  return { capacity, ect, perimeter, form }
}

export function runStack(ctx: SimContext, s: StackSettings): StackOutput {
  const p = ctx.params
  const mat = MATERIALS[p.material]
  const { capacity, ect, perimeter, form } = stackCapacityN(p)
  const climate = ctx.coldChain === 'frozen' ? mat.frozenFactor : ctx.coldChain === 'chilled' ? mat.chilledFactor : 1
  const humid = mat.kind === 'fibre' && (ctx.humidityMaxPct ?? 0) >= 85 ? 0.85 : 1
  const overhang = s.offsetMm / Math.min(p.length, p.width)
  const misalign = Math.max(0.4, 1 - 1.5 * overhang)
  const derated = capacity * climate * humid * misalign
  const grossKg = (ctx.packMassG + ctx.unitWeightG * ctx.units) / 1000
  const sf = SAFETY[ctx.transport]
  const layers = Math.max(1, Math.round(s.layers))
  const utilisation = Array.from({ length: layers }, (_, i) => ((layers - 1 - i) * grossKg * G * sf) / derated)
  const bottomLoadN = (layers - 1) * grossKg * G
  const margin = bottomLoadN > 0 ? derated / (bottomLoadN * sf) : Infinity
  let risk: Risk = margin >= 1.2 ? 'low' : margin >= 0.9 ? 'moderate' : 'high'
  const concerns: string[] = []
  const failureModes: string[] = []
  if (margin < 1.2 && layers > 1) {
    concerns.push(`Bottom pack carries ${bottomLoadN.toFixed(0)} N; estimated derated capacity ${derated.toFixed(0)} N with a ×${sf} safety factor.`)
    failureModes.push(p.template === 'folding_carton' ? 'Panel bulge / box compression' : 'Wall buckling of lower packs')
  }
  if (overhang > 0.15) {
    concerns.push(`Offset of ${s.offsetMm} mm is ${(overhang * 100).toFixed(0)}% of the footprint: the stack may lean or topple.`)
    failureModes.push('Stack instability (misalignment)')
    risk = maxRisk(risk, 'moderate')
  }
  if (climate < 1) concerns.push(`${ctx.coldChain === 'frozen' ? 'Frozen' : 'Chilled'} storage reduces ${mat.short} strength to ${Math.round(climate * 100)}% in this model.`)

  const suggestions: Suggestion[] = []
  if (margin < 1.2 && layers > 1) {
    const need = p.wallMm * Math.pow(1.25 / margin, 2 / 3)
    const step = mat.wall.step
    const target = Math.min(mat.wall.max, Math.ceil(need / step) * step)
    if (target > p.wallMm) suggestions.push({ id: 'stack-wall', title: `Increase wall to ${+target.toFixed(2)} mm`, reason: 'Capacity grows roughly with wall^1.5 in the McKee form.', patch: { wallMm: +target.toFixed(2) } })
    if ('cornerRibs' in p && !p.cornerRibs) suggestions.push({ id: 'stack-ribs', title: 'Add corner ribs', reason: 'Ribs add about 25% capacity in this model.', patch: { cornerRibs: true } })
    if (p.template === 'folding_carton' && p.material !== 'corrugated_e') suggestions.push({ id: 'stack-corr', title: 'Use corrugated board', reason: 'Fluted board carries far more compression for its mass.', patch: { material: 'corrugated_e' } })
    if (mat.kind === 'fibre' && climate < 1 && p.template !== 'folding_carton') suggestions.push({ id: 'stack-pet', title: 'Consider rPET for chilled storage', reason: 'Plastics lose little strength in humid cold rooms (trade-off: lower fibre share, different end-of-life).', patch: { material: 'rpet' } })
  }
  if (margin > 4 && layers > 1 && p.wallMm > mat.wall.min) {
    const target = Math.max(mat.wall.min, +(p.wallMm * 0.8).toFixed(2))
    suggestions.push({ id: 'stack-lighter', title: `Possible over-design: try ${target} mm wall`, reason: `Margin ×${margin.toFixed(1)} is well above need; a thinner wall saves material. Re-check drop risk afterwards.`, patch: { wallMm: target } })
  }

  return {
    utilisation,
    overhangPct: overhang * 100,
    result: {
      test: 'stack',
      method: 'simplified_estimate',
      headline: layers <= 1 ? 'Single pack: no stacking load' : risk === 'low' ? `Stack of ${layers}: margin ×${margin.toFixed(2)}` : risk === 'moderate' ? `Stack of ${layers}: tight margin ×${margin.toFixed(2)}` : `Stack of ${layers}: insufficient margin ×${margin.toFixed(2)}`,
      risk,
      metrics: [
        { key: 'gross', label: 'Gross mass per pack', value: grossKg * 1000, unit: 'g', digits: 0, method: 'calculated' },
        { key: 'load', label: 'Load on bottom pack', value: bottomLoadN, unit: 'N', digits: 0, method: 'calculated' },
        { key: 'cap', label: 'Estimated capacity (dry)', value: capacity, unit: 'N', digits: 0, method: 'simplified_estimate' },
        { key: 'derated', label: 'Derated capacity', value: derated, unit: 'N', digits: 0, method: 'simplified_estimate' },
        { key: 'margin', label: `Margin after ×${sf} safety`, value: Number.isFinite(margin) ? margin : 99, unit: '×', digits: 2, method: 'simplified_estimate' },
        { key: 'overhang', label: 'Overhang', value: overhang * 100, unit: '%', digits: 0, method: 'calculated' },
      ],
      concerns,
      failureModes,
      suggestions,
      assumptions: [
        `McKee form: capacity = 5.87 × ECT × √(wall × perimeter) × form factor. ECT ${ect.toFixed(2)} N/mm (assumed ${mat.ectPerMm} N/mm per mm of ${mat.short}), perimeter ${perimeter.toFixed(0)} mm, form factor ${form.toFixed(2)}.`,
        'McKee is an empirical formula for corrugated boxes; for board cartons, pulp and PET trays it is used here only as a comparative approximation.',
        `Climate factor ${climate.toFixed(2)}${humid < 1 ? ', humidity ≥85% ×0.85' : ''}, misalignment factor ${misalign.toFixed(2)} (1 − 1.5 × offset/footprint, min 0.4).`,
        `Safety factor ×${sf} for ${ctx.transport.replace('_', ' ')} transport (time under load, handling).`,
        'Risk bands: margin ≥1.2 low, ≥0.9 moderate, below high.',
      ],
      limitations: [...LIMITATIONS, 'Creep over time, pallet overhang and load from non-identical packs are not modelled.'],
    },
  }
}

/* ================================================================= vibration */

export interface VibrationOutput {
  result: SimResult
  trace: VibrationTrace
}

const PROFILES: Record<VibrationSettings['profile'], { label: string; tones: [number, number][]; bumpG: number }> = {
  smooth: { label: 'Smooth (motorway)', tones: [[0.4, 4], [0.15, 12]], bumpG: 0 },
  normal: { label: 'Normal (mixed roads)', tones: [[1.2, 4], [0.4, 12], [0.1, 25]], bumpG: 0.8 },
  rough: { label: 'Rough (poor roads, last mile)', tones: [[2.5, 3.5], [0.8, 11], [0.25, 24]], bumpG: 1.8 },
}

export const PROFILE_LABEL = Object.fromEntries(Object.entries(PROFILES).map(([k, v]) => [k, v.label])) as Record<VibrationSettings['profile'], string>

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function runVibration(ctx: SimContext, s: VibrationSettings): VibrationOutput {
  const p = ctx.params
  const prof = PROFILES[s.profile]
  const sens = sensitivity(ctx.produce, ctx.fragility)
  const rnd = mulberry32(1234)
  const phases = prof.tones.map(() => rnd() * Math.PI * 2)
  const latPhases = prof.tones.map(() => rnd() * Math.PI * 2)
  const bumps: number[] = []
  if (prof.bumpG > 0) for (let t = 0.4; t < s.durationS; t += 0.9 + rnd() * 0.6) bumps.push(t)
  const baseAcc = (t: number, lateral: boolean) => {
    let a = 0
    prof.tones.forEach(([ampMm, f], i) => {
      const w = 2 * Math.PI * f
      a += (ampMm / 1000) * w * w * Math.sin(w * t + (lateral ? latPhases[i] : phases[i]))
    })
    for (const b of bumps) if (t >= b && t < b + 0.02) a += prof.bumpG * G * Math.sin((Math.PI * (t - b)) / 0.02)
    return lateral ? a * 0.5 : a
  }
  const baseDisp = (t: number) => prof.tones.reduce((s2, [ampMm, f], i) => s2 - ampMm * Math.sin(2 * Math.PI * f * t + phases[i]), 0)

  const m = ctx.unitWeightG / 1000
  const cells = cellsSeparateUnits(ctx)
  const pad = 'insert' in p && p.insert === 'pad'
  const play = Math.max(0.5, (cells ? 1 : 1.6) * Math.max(ctx.pkg.arrangement.clearance.x, ctx.pkg.arrangement.clearance.z) * 2) / 1000
  const headspace = Math.max(1, ctx.pkg.arrangement.clearance.y) / 1000
  const lid = hasLid(p)
  const kf = pad ? 1 / (1 / sens.stiffness + 1 / PAD_K) : sens.stiffness
  const kw = cells ? 1 / (1 / sens.stiffness + 1 / 2.5e4) : sens.stiffness
  const cf = damping(kf, m, 0.3)
  const cw = damping(kw, m, 0.3)
  const mu = 0.4

  const x = { x: 0, v: 0, m }
  const y = { x: m * G / kf * -1, v: 0, m }
  const dt = 1e-4
  const trace: VibrationTrace = { t: [], base: [], px: [], py: [] }
  let airborne = 0
  let travel = 0
  let wallImpacts = 0
  let lidImpacts = 0
  let inWall = false
  let inLid = false
  let peakF = 0
  let maxLift = 0
  let nextSample = 0
  const steps = Math.round(s.durationS / dt)
  for (let i = 0; i < steps; i++) {
    const t = i * dt
    // Vertical: floor contact below 0, lid contact above headspace (if there is a lid).
    const fFloor = contact(-y.x, -y.v, kf, cf)
    const fLid = lid ? contact(y.x - headspace, y.v, kf, cf) : 0
    if (fFloor <= 0) airborne += dt
    const lidNow = fLid > 0
    if (lidNow && !inLid) lidImpacts++
    inLid = lidNow
    // Lateral: walls at ±play/2; Coulomb friction (regularised) only while pressed on the floor.
    const half = play / 2
    const fWall = -contact(x.x - half, x.v, kw, cw) + contact(-half - x.x, -x.v, kw, cw)
    const wallNow = fWall !== 0
    if (wallNow && !inWall) wallImpacts++
    inWall = wallNow
    const friction = -mu * fFloor * Math.tanh(x.v / 0.005)
    peakF = Math.max(peakF, fFloor, Math.abs(fWall), fLid)
    step(y, fFloor - fLid - m * G - m * baseAcc(t, false), dt)
    step(x, fWall + friction - m * baseAcc(t, true), dt)
    travel += Math.abs(x.v) * dt
    maxLift = Math.max(maxLift, y.x)
    if (t >= nextSample) {
      trace.t.push(t)
      trace.base.push(baseDisp(t))
      trace.px.push(x.x * 1000)
      trace.py.push(Math.max(0, y.x) * 1000)
      nextSample += 1 / 120
    }
  }
  // Loose units also rub against their neighbours, not just the walls (assumed ×2.5).
  const rub = cells ? 1 : 2.5
  const travelMmS = (travel * 1000 * rub) / s.durationS
  const impactsPerS = (wallImpacts + lidImpacts) / s.durationS
  const peakG = peakF / m / G
  const airPct = (airborne / s.durationS) * 100
  const abr = travelMmS / sens.abrasion
  const imp = peakG / (sens.g * 0.5)
  const score = Math.max(abr, imp)
  let risk: Risk = score < 0.8 ? 'low' : score < 1.3 ? 'moderate' : 'high'
  const concerns: string[] = []
  const failureModes: string[] = []
  if (abr >= 0.8) {
    concerns.push(`Units slide about ${travelMmS.toFixed(0)} mm per second against neighbours and walls.`)
    failureModes.push('Abrasion / scuffing from sliding')
  }
  if (imp >= 0.8) {
    concerns.push(`Repeated contacts reach about ${peakG.toFixed(0)} g on a unit.`)
    failureModes.push('Impact bruising from repeated contacts')
  }
  if (!lid && maxLift * 1000 > ctx.pkg.arrangement.clearance.y + 2) {
    concerns.push('Units lift above the rim of the open tray.')
    failureModes.push('Units displaced from open tray')
    risk = maxRisk(risk, 'moderate')
  }
  const suggestions: Suggestion[] = []
  if (score >= 0.8) {
    if (!cells) {
      if (p.template === 'folding_carton' && p.insert !== 'cells') suggestions.push({ id: 'vib-cells', title: 'Add a cell insert', reason: 'Separating units removes most of their free sliding distance.', patch: { insert: 'cells' } })
      if (p.template === 'produce_tray' || p.template === 'clamshell') suggestions.push({ id: 'vib-compartments', title: 'Switch to a compartment tray', reason: 'Formed cells hold each unit; sliding and unit-to-unit contact drop sharply.', patch: { template: 'compartment_tray' } })
    }
    if (ctx.pkg.arrangement.clearance.y > 12) {
      const h = Math.max(20, Math.round(p.height - (ctx.pkg.arrangement.clearance.y - 6)))
      suggestions.push({ id: 'vib-height', title: `Reduce height to ${h} mm`, reason: 'Less headspace means less room for units to bounce.', patch: { height: h } })
    }
    if ('insert' in p && p.insert === 'none') suggestions.push({ id: 'vib-pad', title: 'Add a cushioning pad', reason: 'A softer floor lowers contact peaks.', patch: { insert: 'pad' } })
    if (!lid && (p.template === 'produce_tray' || p.template === 'compartment_tray')) suggestions.push({ id: 'vib-film', title: 'Add lidding film', reason: 'Keeps units in the tray when they lift.', patch: { filmLid: true } })
  }

  return {
    trace,
    result: {
      test: 'vibration',
      method: 'simplified_motion_model',
      headline: `${prof.label}: ${risk} estimated risk`,
      risk,
      metrics: [
        { key: 'travel', label: 'Sliding per second', value: travelMmS, unit: 'mm/s', digits: 1, method: 'simplified_motion_model' },
        { key: 'impacts', label: 'Wall/lid contacts per second', value: impactsPerS, unit: '/s', digits: 1, method: 'simplified_motion_model' },
        { key: 'peak', label: 'Peak contact on a unit', value: peakG, unit: 'g', digits: 1, method: 'simplified_motion_model' },
        { key: 'air', label: 'Time airborne', value: airPct, unit: '%', digits: 0, method: 'simplified_motion_model' },
        { key: 'play', label: 'Free play per unit', value: play * 1000, unit: 'mm', digits: 1, method: 'calculated' },
      ],
      concerns,
      failureModes,
      suggestions,
      assumptions: [
        `Base motion: sum of fixed sine components ${prof.tones.map(([a, f]) => `${a} mm @ ${f} Hz`).join(', ')}${prof.bumpG ? `, plus ${prof.bumpG} g bumps` : ''}; lateral motion 50% of vertical; fixed random seed.`,
        `One ${ctx.unitWeightG} g unit, friction coefficient ${mu}, free play ${(play * 1000).toFixed(1)} mm${cells ? ' (separated by cells)' : ' (loose fill: sliding counted ×2.5 for rubbing against neighbouring units)'}.`,
        `Risk uses the larger of: sliding ÷ ${sens.abrasion.toFixed(0)} mm/s and peak contact ÷ ${(sens.g * 0.5).toFixed(0)} g (assumed levels).`,
      ],
      limitations: [...LIMITATIONS, 'Resonance of the pallet or vehicle, unit-to-unit stacking and temperature effects are not modelled.'],
    },
  }
}

/* ================================================================= break my design */

export interface BreakReport {
  drop: DropOutput
  stack: StackOutput
  vibration: VibrationOutput
  conditions: { drop: DropSettings; stack: StackSettings; vibration: VibrationSettings }
  risk: Risk
  suggestions: Suggestion[]
}

export function breakConditions(ctx: SimContext) {
  return {
    drop: { heightCm: 80, orientation: 'corner' as const },
    stack: { layers: Math.max(2, ctx.stackLayers + 2), offsetMm: 10 },
    vibration: { profile: 'rough' as const, durationS: 3 },
  }
}

export function breakMyDesign(ctx: SimContext): BreakReport {
  const conditions = breakConditions(ctx)
  const drop = runDrop(ctx, conditions.drop)
  const stack = runStack(ctx, conditions.stack)
  const vibration = runVibration(ctx, conditions.vibration)
  const seen = new Set<string>()
  const suggestions = [...drop.result.suggestions, ...stack.result.suggestions, ...vibration.result.suggestions].filter((s) => {
    const k = JSON.stringify(s.patch)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return { drop, stack, vibration, conditions, risk: maxRisk(drop.result.risk, stack.result.risk, vibration.result.risk), suggestions }
}

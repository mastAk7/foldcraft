import { MATERIALS } from './materials'
import { sensitivity } from './produce'
import type { BuiltPackage } from './templates'
import { G, gToKg, mmToM, mToMm, toG } from './units'
import type {
  ColdChain,
  DesignParams,
  Dims,
  DropOrientation,
  DropSettings,
  DropTrace,
  Fragility,
  Metric,
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
 *  - drop:      two-mass, one-axis spring–damper model integrated in time until rest (semi-implicit Euler).
 *  - stack:     static, force-controlled load; McKee-form capacity with stated derating and safety factors,
 *               wall stress σ = F/A and a static centre-of-mass check.
 *  - vibration: one representative unit on spring–damper contacts with Coulomb friction inside its cell,
 *               driven by a defined, seeded road-like base motion.
 *
 * All model maths is SI (see units.ts); conversion to mm, g and kPa happens only when results are built.
 * Equations, data sources and the metric → calculation map: docs/simulation-models.md.
 *
 * None of these is a validated test, a finite-element analysis or a material-failure prediction.
 * They exist to compare design options under identical, disclosed assumptions.
 */

/** Bump whenever model maths, settings or trace shape change: older stored runs then read as superseded. */
export const SIM_MODEL_VERSION = 'sims-4'
/** Assumed stiffness of a 4 mm fibre cushioning pad under one unit, N/m. */
const PAD_K = 4e3

export interface SimContext {
  params: DesignParams
  pkg: BuiltPackage
  packMassG: number
  produce: ProduceKind
  fragility: Fragility
  unitWeightG: number
  /** Bounding box of one unit, mm (from the brief). */
  unit: Dims
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

/** Test orientations as XYZ Euler angles (rad). The lab scene uses the same values. */
export const ORIENT: Record<DropOrientation, [number, number, number]> = {
  bottom: [0, 0, 0],
  side: [Math.PI / 2, 0, 0],
  corner: [0.62, 0.79, 0.32],
}

/** World-down (the impact direction) expressed in the package frame, for an XYZ Euler rotation R: Rᵀ·(0, −1, 0). */
export function impactAxis(o: DropOrientation): [number, number, number] {
  const [a, b, c] = ORIENT[o]
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)]
  // Second row of R = Rx(a)·Ry(b)·Rz(c).
  const r1 = [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb]
  return [-r1[0], -r1[1], -r1[2]]
}

export interface ImpactGap {
  /** Free travel of a unit away from the impact face until it meets the opposite boundary, mm (Infinity if unbounded). */
  gapMm: number
  /** What stops the rebound: the lid, a wall, or nothing (open top, bottom drop). */
  by: 'lid' | 'wall' | 'none'
  /** Lift above its rest position at which a unit clears the rim of an open tray, mm (Infinity if it cannot leave). */
  escapeMm: number
}

/**
 * Where a rebounding unit is stopped, along the one impact axis of the drop model. The unit moves away
 * from the impact face (direction −axis); per package axis it can travel 2 × the side clearance to the
 * opposite wall, or the headspace to the lid. Along a slanted axis the first boundary reached wins.
 */
export function impactGap(ctx: SimContext, o: DropOrientation): ImpactGap {
  const c = ctx.pkg.arrangement.clearance
  const lid = hasLid(ctx.params)
  const u = impactAxis(o).map((x) => -x)
  const gaps: { d: number; by: 'lid' | 'wall' }[] = []
  const eps = 1e-6
  if (Math.abs(u[0]) > eps) gaps.push({ d: Math.max(1, 2 * c.x) / Math.abs(u[0]), by: 'wall' })
  if (Math.abs(u[2]) > eps) gaps.push({ d: Math.max(1, 2 * c.z) / Math.abs(u[2]), by: 'wall' })
  if (u[1] > eps && lid) gaps.push({ d: Math.max(1, c.y) / u[1], by: 'lid' })
  const first = gaps.reduce<{ d: number; by: 'lid' | 'wall' | 'none' }>((m, g) => (g.d < m.d ? g : m), { d: Infinity, by: 'none' })
  // Open top: the top layer's base sits (layers − 1) unit heights above the floor; it leaves once it rises past the rim.
  const layers = Math.max(1, ctx.pkg.arrangement.layers)
  const escapeMm = first.by === 'none' && !lid ? Math.max(0, ctx.pkg.inner.h - (layers - 1) * ctx.unit.h) : Infinity
  return { gapMm: first.d, by: first.by, escapeMm }
}

/** Rebound restitution of a linear spring–dashpot contact that cannot pull (separation when the force reaches 0). */
export function restitution(zeta: number): number {
  if (zeta <= 0) return 1
  // Overdamped contacts (ζ ≥ 1) are not used by the models; the formula below needs ω real.
  if (zeta >= 1) return 0
  // x'' + 2βx' + ω0²x = 0 from x = 0, x' = v0; with ω0 = 1, β = ζ, ω = √(1 − ζ²). The force kx + cx' first
  // returns to zero at ωt = π − atan2(2βω, ω² − β²) (valid for any ζ < 1); e = −x'(t)/v0 there (Schwager & Pöschel 2007).
  const b = zeta
  const w = Math.sqrt(1 - b * b)
  const ts = (Math.PI - Math.atan2(2 * b * w, w * w - b * b)) / w
  return -Math.exp(-b * ts) * (Math.cos(w * ts) - (b / w) * Math.sin(w * ts))
}

/** Inputs of the two-mass drop model, all SI. */
export interface DropSpec {
  /** Release height of the lowest point, m. */
  h: number
  /** Package plus the units lumped with it, kg. */
  M: number
  /** The tracked unit, kg (0 = package alone). */
  m: number
  /** Package-to-floor contact stiffness (N/m) and damping ratio. */
  kg: number
  zg: number
  /** Unit-to-support contact stiffness (N/m) and damping ratio (also used for the opposite boundary). */
  kc: number
  zc: number
  /** Free travel of the unit to the opposite boundary (lid/wall), m; Infinity when unbounded. */
  gap: number
}

export interface DropSolution {
  trace: DropTrace
  /** Total mechanical energy (kinetic + gravitational + elastic) at each trace sample, J. */
  energy: number[]
  /** Energy at release, (M + m)·g·h, J. */
  e0: number
  dt: number
  tImpact: number
  /** Time when both bodies came to rest in contact, s; null if the 2 s cap was reached first. */
  tRest: number | null
  /** Package rebound speed ÷ impact speed at the first separation from the floor (0 if it never separated). */
  restitution: number
  peakPkgF: number
  peakUnitF: number
  /** Largest floor-contact compression of the package (its modelled deformation), m. */
  crush: number
  /** Largest compression between unit and support, m. */
  compress: number
  /** Largest unit movement away from the impact face, m. */
  lift: number
  /** The unit reached the opposite boundary. */
  struck: boolean
}

/**
 * Two-mass, one-axis drop: free fall → contact (compressive-only spring–dashpots) → rebound → rest.
 * x is measured downwards from the floor (x < 0 above it). Fixed step, semi-implicit Euler with
 * dt ≤ 0.02/ω_max, so ω·dt stays far inside the stability limit of 2. Deterministic.
 */
export function integrateDrop(spec: DropSpec): DropSolution {
  const { h, M, m, kg, kc, gap } = spec
  const cg = damping(kg, M + m, spec.zg)
  const mu = m > 0 ? (m * M) / (m + M) : M
  const cc = m > 0 ? damping(kc, mu, spec.zc) : 0
  const wMax = Math.max(Math.sqrt(kg / M), m > 0 ? Math.sqrt(kc / mu) : 0)
  const dt = Math.min(1e-5, Math.max(1e-6, 0.02 / wMax))
  const pkgB: Body = { x: -h, v: 0, m: M }
  const prod: Body = { x: -h, v: 0, m: Math.max(m, 1e-12) }
  const tFall = Math.sqrt((2 * h) / G)
  const tCap = tFall + 2
  const bounded = m > 0 && Number.isFinite(gap)
  const trace: DropTrace = { t: [], y: [], rel: [], acc: [], unitAcc: [], contact: [], impactIndex: 0 }
  const energy: number[] = []
  const e0 = (M + m) * G * h
  const elastic = (d: number, k: number) => (d > 0 ? 0.5 * k * d * d : 0)
  let peakPkgF = 0
  let peakUnitF = 0
  let crush = 0
  let compress = 0
  let lift = 0
  let struck = false
  let tImpact = Infinity
  let firstImpactEnd = Infinity
  let separated = false
  let vIn = 0
  let res = 0
  let rest = 0
  let tRest: number | null = null
  let nextSample = 0
  for (let i = 0; ; i++) {
    const t = i * dt
    const fg = contact(pkgB.x, pkgB.v, kg, cg)
    const d = prod.x - pkgB.x
    const fBound = bounded ? contact(-d - gap, pkgB.v - prod.v, kc, cc) : 0
    const fc = m > 0 ? contact(d, prod.v - pkgB.v, kc, cc) - fBound : 0
    if (fBound > 0) struck = true
    if (fg > 0 && tImpact === Infinity) {
      tImpact = t
      vIn = pkgB.v
      trace.impactIndex = trace.t.length
    }
    const impacted = t >= tImpact
    if (impacted && fg === 0 && !separated) {
      separated = true
      res = Math.max(0, -pkgB.v) / vIn
      firstImpactEnd = t + 0.02
    }
    // Peaks over the first impact (until the package leaves the floor + 20 ms); later re-contacts are smaller.
    if (impacted && t <= firstImpactEnd) {
      peakPkgF = Math.max(peakPkgF, fg)
      peakUnitF = Math.max(peakUnitF, Math.abs(fc))
      crush = Math.max(crush, pkgB.x)
      compress = Math.max(compress, d)
    }
    if (impacted) lift = Math.max(lift, -d)
    // Rest: both bodies slower than 2 mm/s while the package has been on the floor for 30 ms.
    if (impacted && fg > 0 && Math.abs(pkgB.v) < 2e-3 && Math.abs(prod.v) < 2e-3) rest += dt
    else rest = 0
    const done = rest >= 0.03 || t >= tCap
    // Always sample the first-contact step itself, so the trace marks contact at its true time.
    if (t >= nextSample || done || t === tImpact) {
      trace.t.push(t)
      trace.y.push(-pkgB.x)
      trace.rel.push(d)
      trace.acc.push(fg / M)
      trace.unitAcc.push(m > 0 ? fc / m : 0)
      trace.contact.push(fc > 0 ? 1 : fc < 0 ? 2 : 0)
      energy.push(0.5 * M * pkgB.v ** 2 + 0.5 * m * prod.v ** 2 - G * (M * pkgB.x + m * prod.x) + elastic(pkgB.x, kg) + (m > 0 ? elastic(d, kc) : 0) + (bounded ? elastic(-d - gap, kc) : 0))
      // 10 ms in free fall, 0.2 ms through the first 30 ms of contact (the pulse lasts a few ms), 1 ms after.
      nextSample = t + (t < tFall - 0.02 ? 0.01 : t >= tImpact && t < tImpact + 0.03 ? 2e-4 : 0.001)
    }
    if (done) {
      if (rest >= 0.03) tRest = t
      break
    }
    step(pkgB, M * G - fg + fc, dt)
    if (m > 0) step(prod, m * G - fc, dt)
  }
  return { trace, energy, e0, dt, tImpact, tRest, restitution: res, peakPkgF, peakUnitF, crush, compress, lift, struck }
}

/** Damping ratios of the drop contacts (assumed: package board/plastic; produce absorbs more energy). */
const ZETA_PACK = 0.35
const ZETA_UNIT = 0.5

/** Reject inputs the models cannot use, with a plain message, instead of propagating NaN. */
export function validateSimInputs(ctx: SimContext) {
  const bad = (x: number) => !Number.isFinite(x) || x <= 0
  if (bad(ctx.unitWeightG)) throw new RangeError('Unit weight must be a positive number of grams.')
  if (!Number.isInteger(ctx.units) || ctx.units < 1) throw new RangeError('Units per package must be a whole number of at least 1.')
  if (bad(ctx.packMassG)) throw new RangeError('The package has no mass: check its dimensions and wall.')
  const o = ctx.pkg.outer
  if ([o.l, o.w, o.h, ctx.unit.l, ctx.unit.w, ctx.unit.h].some(bad)) throw new RangeError('Package and unit dimensions must be positive.')
}

export function runDrop(ctx: SimContext, s: DropSettings): DropOutput {
  validateSimInputs(ctx)
  if (!Number.isFinite(s.heightCm) || s.heightCm <= 0 || s.heightCm > 300) throw new RangeError('Drop height must be between 0 and 300 cm.')
  const p = ctx.params
  const mat = MATERIALS[p.material]
  const sens = sensitivity(ctx.produce, ctx.fragility)
  // Boundary: brief values (g, mm, cm) → SI.
  const m = gToKg(ctx.unitWeightG)
  const M = gToKg(ctx.packMassG + ctx.unitWeightG * Math.max(0, ctx.units - 1))
  const h = s.heightCm / 100
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
  // Units rebound until the opposite boundary along the impact axis (lid or wall); open trays let them leave upwards.
  const gap = impactGap(ctx, s.orientation)
  const bounded = gap.by !== 'none'
  const sol = integrateDrop({ h, M, m, kg, zg: ZETA_PACK, kc, zc: ZETA_UNIT, gap: bounded ? mmToM(gap.gapMm) : Infinity })

  // Boundary: SI → display units.
  const peakProdG = toG(sol.peakUnitF / m)
  const peakPkgG = toG(sol.peakPkgF / M)
  const crushMm = mToMm(sol.crush)
  const liftMm = mToMm(sol.lift)
  const v0 = Math.sqrt(2 * G * h)
  const eEnd = sol.energy[sol.energy.length - 1]
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
  const escaped = liftMm > gap.escapeMm
  if (sol.struck) {
    concerns.push(gap.by === 'lid' ? `Units rebound into the lid (${gap.gapMm.toFixed(0)} mm of free travel).` : `Units rebound into the opposite wall (${gap.gapMm.toFixed(0)} mm of free travel along the impact direction).`)
    failureModes.push(gap.by === 'lid' ? 'Contents strike lid' : 'Contents strike opposite wall')
  }
  if (escaped) {
    concerns.push(`Units rebound ${gap.escapeMm.toFixed(0)} mm or more, enough to clear the rim of the open tray. Loose units may leave the tray.`)
    failureModes.push('Contents thrown from open tray')
    risk = maxRisk(risk, 'moderate')
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

  const est = 'Estimate: scales with the assumed contact stiffness (no measured cushion curve).'
  const metrics: Metric[] = [
    { key: 'v0', label: 'Impact speed', value: v0, unit: 'm/s', digits: 2, method: 'calculated', basis: 'v = √(2·g·h): free fall from rest, no air drag.' },
    { key: 'e0', label: 'Energy at release', value: sol.e0, unit: 'J', digits: 2, method: 'calculated', basis: `E = m·g·h with m = ${(M + m).toFixed(3)} kg (pack + contents), h = ${h.toFixed(2)} m.` },
    { key: 'pkgG', label: 'Peak package deceleration', value: peakPkgG, unit: 'g', digits: 0, method: 'simplified_motion_model', basis: `Peak floor force ÷ package mass ÷ g, first impact. ${est}` },
    { key: 'prodG', label: 'Peak deceleration on a unit', value: peakProdG, unit: 'g', digits: 0, method: 'simplified_motion_model', basis: `Peak support force on the tracked unit ÷ its mass ÷ g, first impact. ${est}` },
    { key: 'threshold', label: 'Assumed sensitivity level', value: sens.g, unit: 'g', digits: 0, method: 'simplified_estimate', basis: 'Typical value for the produce and fragility in the brief: an assumption, not a measured bruise threshold.' },
    { key: 'crush', label: 'Max package deformation', value: crushMm, unit: 'mm', digits: 1, method: 'simplified_motion_model', basis: 'Largest compression of the package-to-floor contact spring during the first impact.' },
    { key: 'compress', label: 'Unit compression at contact', value: mToMm(sol.compress), unit: 'mm', digits: 1, method: 'simplified_motion_model', basis: 'Largest compression between the unit and its support (produce, pad or cell wall in series).' },
    { key: 'lift', label: escaped ? 'Unit rebound (clears the rim)' : 'Unit rebound inside pack', value: escaped ? gap.escapeMm : liftMm, unit: 'mm', digits: 1, method: 'simplified_motion_model', basis: 'Largest movement of the unit away from the impact face, limited by the lid or the opposite wall.' },
    { key: 'cor', label: 'Package rebound ratio', value: sol.restitution, unit: '×', digits: 2, method: 'simplified_motion_model', basis: `Rebound speed ÷ impact speed at the first separation (an isolated contact with damping ratio ${ZETA_PACK} gives ${restitution(ZETA_PACK).toFixed(2)}).` },
    { key: 'dissipated', label: 'Energy absorbed by rest', value: Math.max(0, sol.e0 - eEnd), unit: 'J', digits: 2, method: 'simplified_motion_model', basis: 'Release energy minus the mechanical energy left at rest, taken up by the contact dampers.' },
  ]
  if (sol.tRest !== null) metrics.push({ key: 'settle', label: 'Time to come to rest', value: sol.tRest - sol.tImpact, unit: 's', digits: 2, method: 'simplified_motion_model', basis: 'From first contact until both bodies stay below 2 mm/s on the floor for 30 ms.' })
  return {
    trace: sol.trace,
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
      metrics,
      concerns,
      failureModes,
      suggestions,
      assumptions: [
        `Free fall from ${s.heightCm} cm onto a rigid floor: impact speed √(2gh) = ${v0.toFixed(2)} m/s, no air drag, package held in the ${s.orientation} orientation.`,
        `Package-to-floor contact stiffness ${Math.round(kg / 1000)} kN/m (${mat.short}, ${s.orientation} face${ribs > 1 ? ', ribbed' : ''}), damping ratio ${ZETA_PACK}. Compressive only: the floor cannot pull.`,
        `One ${ctx.unitWeightG} g unit against its support, stiffness ${Math.round(kc / 1000)} kN/m${pad ? ' incl. pad' : ''}${cells && s.orientation !== 'bottom' ? ' incl. cell wall' : ''}, damping ratio ${ZETA_UNIT} (produce absorbs energy). The other units move with the package.`,
        bounded
          ? `Rebound along the impact direction is stopped by the ${gap.by} after ${gap.gapMm.toFixed(1)} mm (side clearances ×2 or headspace, projected onto the impact direction).`
          : `Open top: rebound is not limited; a unit leaves the tray if it rises more than ${gap.escapeMm.toFixed(0)} mm (its depth below the rim).`,
        `Integrated until rest with a fixed ${(sol.dt * 1e6).toFixed(1)} µs step (semi-implicit Euler); the dampers only remove energy.`,
        `Risk bands: below 80% of the assumed ${Math.round(sens.g)} g sensitivity = low, up to 120% = moderate, above = high.`,
      ],
      limitations: [...LIMITATIONS, 'One axis only: rotation during the fall, later impacts on other faces and unit-to-unit contact are not modelled. Contact stiffness and damping are assumed values, so peak g is an estimate.'],
    },
  }
}

/* ================================================================= stack */

export interface StackLayer {
  /** Static load from the packs above, N. */
  loadN: number
  /** Derated capacity (same for every pack of one design), N. */
  capacityN: number
  /** load × safety ÷ derated capacity */
  utilisation: number
  /** Horizontal offset of this pack's centre from the bottom pack, mm (alternating misalignment). */
  xMm: number
  /** Centre of mass of all packs above, relative to this pack's centre, mm (0 for the top pack). */
  comOffsetMm: number
}

export interface StackOutput {
  result: SimResult
  /** Load utilisation for each pack, bottom first (load × safety ÷ derated capacity). */
  utilisation: number[]
  layers: StackLayer[]
  overhangPct: number
  /** Half the footprint along the offset direction, mm: the static tipping limit for a centre of mass. */
  supportHalfMm: number
  /** 1 − largest centre-of-mass offset ÷ half footprint. Below 0 the stack cannot stand (static geometry). */
  tipMargin: number
  /** Mean wall stress in the bottom pack, F ÷ (perimeter × wall), Pa. */
  stressPa: number
  capacity: StackCapacity
}

export const SAFETY: Record<Transport, number> = { local: 2.5, regional: 3, long_haul: 4 }

export interface StackCapacity {
  /** McKee-form box compression estimate, N. */
  capacity: number
  /** Edge-crush resistance of the wall, N/mm. */
  ect: number
  /** Load-bearing wall length (outer perimeter + interior walls of compartment trays), mm. */
  perimeter: number
  form: number
  /** Load-bearing wall cross-section, perimeter × wall, m². */
  wallAreaM2: number
  /** Edge-crush stress of the wall material, ECT ÷ wall thickness, Pa. */
  crushStressPa: number
  /** capacity ÷ (perimeter × ECT): how far buckling of the walls brings the box below pure edge crush. */
  bucklingFactor: number
}

/**
 * McKee form, BCT = 5.87 · ECT · √(t · Z) · form, with ECT in N/mm, wall t and perimeter Z in mm, BCT in N.
 * The perimeter is the outer footprint's, the same footprint the overhang and tipping checks use.
 */
export function stackCapacityN(p: DesignParams, outer: Pick<Dims, 'l' | 'w'>): StackCapacity {
  const mat = MATERIALS[p.material]
  const ect = mat.ectPerMm * p.wallMm
  let perimeter = 2 * (outer.l + outer.w)
  let form = p.template === 'folding_carton' ? 1 : p.template === 'produce_tray' ? 0.75 : p.template === 'clamshell' ? 0.7 : 0.85
  if (p.template === 'compartment_tray') perimeter += 0.5 * ((p.cellsX - 1) * outer.w + (p.cellsY - 1) * outer.l)
  if ('cornerRibs' in p && p.cornerRibs) form *= 1.25
  const capacity = 5.87 * ect * Math.sqrt(p.wallMm * perimeter) * form
  return {
    capacity,
    ect,
    perimeter,
    form,
    wallAreaM2: mmToM(perimeter) * mmToM(p.wallMm),
    // ECT [N/mm] ÷ t [mm] = N/mm² = MPa → Pa.
    crushStressPa: (ect / p.wallMm) * 1e6,
    bucklingFactor: capacity / (perimeter * ect),
  }
}

export function runStack(ctx: SimContext, s: StackSettings): StackOutput {
  validateSimInputs(ctx)
  if (!Number.isFinite(s.layers) || s.layers < 1 || s.layers > 50) throw new RangeError('Packs in stack must be between 1 and 50.')
  if (!Number.isFinite(s.offsetMm) || s.offsetMm < 0) throw new RangeError('Misalignment must be zero or positive.')
  const p = ctx.params
  const mat = MATERIALS[p.material]
  const cap = stackCapacityN(p, ctx.pkg.outer)
  const { capacity, ect, perimeter, form } = cap
  const climate = ctx.coldChain === 'frozen' ? mat.frozenFactor : ctx.coldChain === 'chilled' ? mat.chilledFactor : 1
  const humid = mat.kind === 'fibre' && (ctx.humidityMaxPct ?? 0) >= 85 ? 0.85 : 1
  // Offset, support and overhang all use the outer footprint's narrower side.
  const supportHalfMm = Math.min(ctx.pkg.outer.l, ctx.pkg.outer.w) / 2
  const overhang = s.offsetMm / (2 * supportHalfMm)
  const misalign = Math.max(0.4, 1 - 1.5 * overhang)
  const derated = capacity * climate * humid * misalign
  // Static, force-controlled load: each pack carries the weight W = m·g of every identical pack above it.
  const grossKg = gToKg(ctx.packMassG + ctx.unitWeightG * ctx.units)
  const weightN = grossKg * G
  const sf = SAFETY[ctx.transport]
  const layers = Math.max(1, Math.round(s.layers))
  const utilisation = Array.from({ length: layers }, (_, i) => ((layers - 1 - i) * weightN * sf) / derated)
  const bottomLoadN = (layers - 1) * weightN
  const stressPa = bottomLoadN / cap.wallAreaM2
  // Static geometry: alternate packs are shifted by the offset along the narrower footprint side.
  // Identical packs, so the centre of mass of the packs above pack i is the mean of their offsets.
  const xs = Array.from({ length: layers }, (_, i) => (i % 2 ? s.offsetMm : 0))
  const layerInfo: StackLayer[] = xs.map((x, i) => {
    const above = xs.slice(i + 1)
    const com = above.length ? above.reduce((a, b) => a + b, 0) / above.length - x : 0
    return { loadN: (layers - 1 - i) * weightN, capacityN: derated, utilisation: utilisation[i], xMm: x, comOffsetMm: com }
  })
  const maxCom = Math.max(0, ...layerInfo.map((l) => Math.abs(l.comOffsetMm)))
  const tipMargin = 1 - maxCom / supportHalfMm
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
  if (tipMargin < 0) {
    concerns.push(`The centre of mass of the packs above sits ${maxCom.toFixed(0)} mm off-centre, beyond the ${supportHalfMm.toFixed(0)} mm half-footprint of the pack below: the stack cannot stand as arranged (static geometry check).`)
    failureModes.push('Stack tips over (static geometry)')
    risk = 'high'
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
    layers: layerInfo,
    overhangPct: overhang * 100,
    supportHalfMm,
    tipMargin,
    stressPa,
    capacity: cap,
    result: {
      test: 'stack',
      method: 'simplified_estimate',
      headline: layers <= 1 ? 'Single pack: no stacking load' : risk === 'low' ? `Stack of ${layers}: margin ×${margin.toFixed(2)}` : risk === 'moderate' ? `Stack of ${layers}: tight margin ×${margin.toFixed(2)}` : `Stack of ${layers}: insufficient margin ×${margin.toFixed(2)}`,
      risk,
      metrics: [
        { key: 'gross', label: 'Gross mass per pack', value: grossKg * 1000, unit: 'g', digits: 0, method: 'calculated', basis: 'Package mass + units × unit weight.' },
        { key: 'load', label: 'Load on bottom pack', value: bottomLoadN, unit: 'N', digits: 0, method: 'calculated', basis: `F = (packs above) × m·g = ${layers - 1} × ${grossKg.toFixed(3)} kg × ${G} m/s².` },
        { key: 'stress', label: 'Mean wall stress, bottom pack', value: stressPa / 1000, unit: 'kPa', digits: 0, method: 'calculated', basis: `σ = F / A, A = wall perimeter × thickness = ${perimeter.toFixed(0)} mm × ${p.wallMm} mm. Assumes the walls carry the load evenly.` },
        { key: 'crushRatio', label: 'Wall stress ÷ edge-crush stress', value: stressPa / cap.crushStressPa, unit: '×', digits: 3, method: 'simplified_estimate', basis: `σ ÷ (ECT ÷ t) with an assumed ECT of ${mat.ectPerMm} N/mm per mm of ${mat.short} (= ${(cap.crushStressPa / 1e6).toFixed(1)} MPa).` },
        { key: 'cap', label: 'Estimated capacity (dry)', value: capacity, unit: 'N', digits: 0, method: 'simplified_estimate', basis: `McKee: 5.87 × ECT × √(t × Z) × form = 5.87 × ${ect.toFixed(2)} × √(${p.wallMm} × ${perimeter.toFixed(0)}) × ${form.toFixed(2)}. Buckling keeps it at ${(cap.bucklingFactor * 100).toFixed(0)}% of pure edge crush (Z × ECT).` },
        { key: 'derated', label: 'Derated capacity', value: derated, unit: 'N', digits: 0, method: 'simplified_estimate', basis: `Capacity × climate ${climate.toFixed(2)} × humidity ${humid.toFixed(2)} × misalignment ${misalign.toFixed(2)}.` },
        { key: 'margin', label: `Margin after ×${sf} safety`, value: Number.isFinite(margin) ? margin : 99, unit: '×', digits: 2, method: 'simplified_estimate', basis: `Derated capacity ÷ (load × ${sf}).` },
        { key: 'overhang', label: 'Overhang', value: overhang * 100, unit: '%', digits: 0, method: 'calculated', basis: 'Offset ÷ narrower outer footprint side.' },
        { key: 'com', label: 'Largest centre-of-mass offset', value: maxCom, unit: 'mm', digits: 0, method: 'calculated', basis: 'Mean offset of the identical packs above each pack, relative to that pack.' },
      ],
      concerns,
      failureModes,
      suggestions,
      assumptions: [
        'Static, force-controlled load: identical packs stacked straight down; no dynamic loads, sway or pallet effects.',
        `McKee form: capacity = 5.87 × ECT × √(wall × perimeter) × form factor. ECT ${ect.toFixed(2)} N/mm (assumed ${mat.ectPerMm} N/mm per mm of ${mat.short}), outer perimeter ${perimeter.toFixed(0)} mm, form factor ${form.toFixed(2)}.`,
        'McKee is an empirical formula for corrugated boxes; for board cartons, pulp and PET trays it is used here only as a comparative approximation.',
        'No deformation or strain is computed: that needs a measured load–deflection (BCT) curve of the real pack, conditioned at the storage humidity.',
        `Climate factor ${climate.toFixed(2)}${humid < 1 ? ', humidity ≥85% ×0.85' : ''}, misalignment factor ${misalign.toFixed(2)} (1 − 1.5 × offset/footprint, min 0.4).`,
        `Safety factor ×${sf} for ${ctx.transport.replace('_', ' ')} transport (time under load, handling).`,
        `Static tipping check: the centre of mass of the packs above each pack must stay within ${supportHalfMm.toFixed(0)} mm (half the narrower outer footprint side). Rigid packs, no sway or dynamics.`,
        'Risk bands: margin ≥1.2 low, ≥0.9 moderate, below high.',
      ],
      limitations: [...LIMITATIONS, 'Creep over time, pallet overhang, load from non-identical packs and how a pack actually collapses are not modelled. The stack animation shows placement only.'],
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

/** Duration of one road bump, s. */
export const BUMP_S = 0.04

/** Peak deck acceleration of a profile's vertical motion, m/s²: Σ (2πf)²·A over its tones, plus the bump peak. */
export function profilePeakAcc(p: VibrationSettings['profile']) {
  const prof = PROFILES[p]
  return prof.tones.reduce((s, [aMm, f]) => s + (2 * Math.PI * f) ** 2 * mmToM(aMm), 0) + prof.bumpG * G
}

/** The defined base-motion inputs of a profile, in words (amplitude @ frequency → peak acceleration, bump level). */
export function profileSpec(p: VibrationSettings['profile']) {
  const prof = PROFILES[p]
  const tones = prof.tones.map(([a, f]) => `${a} mm @ ${f} Hz (${toG((2 * Math.PI * f) ** 2 * mmToM(a)).toFixed(2)} g)`).join(' + ')
  return `${tones}${prof.bumpG ? `, ±${prof.bumpG} g bumps` : ', no bumps'}`
}

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

export interface BaseMotion {
  /** Deck displacement, m (lateral = true for the horizontal axis, package x). */
  disp(t: number, lateral: boolean): number
  /** Deck acceleration, m/s², the exact second derivative of disp. */
  acc(t: number, lateral: boolean): number
  /** Start times of the bumps, s. */
  bumps: number[]
}

/**
 * Deck motion of a profile: x(t) = −Σ A·sin(2πf·t + φ), so a(t) = Σ (2πf)²·A·sin(2πf·t + φ), plus road
 * bumps. A bump is a haversine displacement pulse, d = A_b/2·(1 − cos 2πτ/T): the deck rises and returns,
 * so it adds no net velocity, and its peak acceleration A_b/2·(2π/T)² equals the profile's bump level.
 * Lateral motion is 50% of vertical with its own phases.
 */
export function baseMotion(profile: VibrationSettings['profile'], durationS: number): BaseMotion {
  const prof = PROFILES[profile]
  const rnd = mulberry32(1234)
  const n = prof.tones.length
  const amp = prof.tones.map(([a]) => mmToM(a))
  const w = prof.tones.map(([, f]) => 2 * Math.PI * f)
  const ph = prof.tones.map(() => rnd() * Math.PI * 2)
  const latPh = prof.tones.map(() => rnd() * Math.PI * 2)
  const bumps: number[] = []
  if (prof.bumpG > 0) for (let t = 0.4; t < durationS; t += 0.9 + rnd() * 0.6) bumps.push(t)
  const kb = (2 * Math.PI) / BUMP_S
  const bumpA = (2 * prof.bumpG * G) / (kb * kb)
  const bumpAt = (t: number) => {
    for (const b of bumps) if (t >= b && t < b + BUMP_S) return t - b
    return -1
  }
  return {
    bumps,
    disp(t, lateral) {
      const p = lateral ? latPh : ph
      let d = 0
      for (let i = 0; i < n; i++) d -= amp[i] * Math.sin(w[i] * t + p[i])
      const tau = bumpAt(t)
      if (tau >= 0) d += (bumpA / 2) * (1 - Math.cos(kb * tau))
      return lateral ? d * 0.5 : d
    },
    acc(t, lateral) {
      const p = lateral ? latPh : ph
      let a = 0
      for (let i = 0; i < n; i++) a += amp[i] * w[i] * w[i] * Math.sin(w[i] * t + p[i])
      const tau = bumpAt(t)
      if (tau >= 0) a += (bumpA / 2) * kb * kb * Math.cos(kb * tau)
      return lateral ? a * 0.5 : a
    },
  }
}

/** Inputs of the one-unit vibration model, all SI. */
export interface VibrationSpec {
  /** Unit mass, kg. */
  m: number
  /** Floor (support) and wall contact stiffness, N/m, and their damping ratio. */
  kf: number
  kw: number
  zeta: number
  /** Coulomb friction coefficient between unit and floor. */
  mu: number
  /** Total lateral free play between the walls, m. */
  play: number
  /** Headspace to the lid, m (used only with a lid). */
  headspace: number
  lid: boolean
  durationS: number
}

export interface VibrationSolution {
  trace: VibrationTrace
  dt: number
  /** Total sliding distance relative to the pack, m. */
  travel: number
  wallImpacts: number
  lidImpacts: number
  /** Largest contact force on the unit (floor, wall or lid), N. */
  peakF: number
  /** Largest wall or lid force, N (0 if none). */
  peakImpactF: number
  /** Time without floor contact, s. */
  airborne: number
  /** Largest lift above the resting contact, m. */
  maxLift: number
  /** Largest lateral displacement from the cell centre, m. */
  maxSlide: number
}

/**
 * One unit in its cell, in the deck's frame (pseudo-force −m·a_deck). Vertical: compressive spring–dashpot
 * floor (and lid). Lateral: walls at ±play/2 and Coulomb friction μ·N applied as an impulse each step,
 * so the unit sticks exactly while the lateral force stays below μ·N. Fixed step, semi-implicit Euler,
 * dt ≤ 0.05/ω_max. Starts at static equilibrium, so zero excitation gives zero motion.
 */
export function integrateVibration(spec: VibrationSpec, motion: Pick<BaseMotion, 'acc' | 'disp'>): VibrationSolution {
  const { m, kf, kw, mu, play, headspace, lid, durationS } = spec
  const cf = damping(kf, m, spec.zeta)
  const cw = damping(kw, m, spec.zeta)
  const dt = Math.min(1e-4, 0.05 / Math.sqrt(Math.max(kf, kw) / m))
  const x = { x: 0, v: 0, m }
  const y = { x: (-m * G) / kf, v: 0, m }
  const trace: VibrationTrace = { t: [], base: [], baseLat: [], px: [], py: [], contact: [] }
  const half = play / 2
  let flags = 0
  let airborne = 0
  let travel = 0
  let wallImpacts = 0
  let lidImpacts = 0
  let inWall = false
  let inLid = false
  let peakF = 0
  let peakImpactF = 0
  let maxLift = 0
  let maxSlide = 0
  let nextSample = 0
  const steps = Math.round(durationS / dt)
  for (let i = 0; i <= steps; i++) {
    const t = i * dt
    const fFloor = contact(-y.x, -y.v, kf, cf)
    const fLid = lid ? contact(y.x - headspace, y.v, kf, cf) : 0
    if (fFloor <= 0) {
      airborne += dt
      flags |= 8
    }
    const lidNow = fLid > 0
    if (lidNow) flags |= 4
    if (lidNow && !inLid) lidImpacts++
    inLid = lidNow
    const fWall = -contact(x.x - half, x.v, kw, cw) + contact(-half - x.x, -x.v, kw, cw)
    const wallNow = fWall !== 0
    if (fWall < 0) flags |= 1
    if (fWall > 0) flags |= 2
    if (wallNow && !inWall) wallImpacts++
    inWall = wallNow
    peakF = Math.max(peakF, fFloor, Math.abs(fWall), fLid)
    peakImpactF = Math.max(peakImpactF, Math.abs(fWall), fLid)
    if (t >= nextSample) {
      trace.t.push(t)
      trace.base.push(motion.disp(t, false))
      trace.baseLat.push(motion.disp(t, true))
      trace.px.push(x.x)
      trace.py.push(Math.max(0, y.x))
      trace.contact.push(flags)
      flags = 0
      nextSample += 1 / 120
    }
    if (i === steps) break
    step(y, fFloor - fLid - m * G - m * motion.acc(t, false), dt)
    // Lateral: trial velocity without friction, then a friction impulse of at most μ·N·dt (stick if it suffices).
    const vTrial = x.v + ((fWall - m * motion.acc(t, true)) / m) * dt
    const dvMax = (mu * fFloor * dt) / m
    x.v = Math.abs(vTrial) <= dvMax ? 0 : vTrial - Math.sign(vTrial) * dvMax
    x.x += x.v * dt
    travel += Math.abs(x.v) * dt
    maxLift = Math.max(maxLift, y.x)
    maxSlide = Math.max(maxSlide, Math.abs(x.x))
  }
  return { trace, dt, travel, wallImpacts, lidImpacts, peakF, peakImpactF, airborne, maxLift, maxSlide }
}

/** Friction coefficient between produce and tray (assumed typical value for fruit on board or PET). */
const MU = 0.4
const ZETA_VIB = 0.3
/** Loose fill: units also rub on their neighbours. Risk heuristic only, not part of the sliding metric. */
const LOOSE_RUB = 2.5

export function runVibration(ctx: SimContext, s: VibrationSettings): VibrationOutput {
  validateSimInputs(ctx)
  if (!Number.isFinite(s.durationS) || s.durationS <= 0 || s.durationS > 30) throw new RangeError('Vibration duration must be between 0 and 30 s.')
  const p = ctx.params
  const prof = PROFILES[s.profile]
  const sens = sensitivity(ctx.produce, ctx.fragility)
  const cells = cellsSeparateUnits(ctx)
  const pad = 'insert' in p && p.insert === 'pad'
  const lid = hasLid(p)
  // Boundary: brief and geometry (g, mm) → SI. Lateral axis = package x (the deck's direction of travel in the scene).
  const m = gToKg(ctx.unitWeightG)
  const play = mmToM(Math.max(0.5, 2 * ctx.pkg.arrangement.clearance.x))
  const headspace = mmToM(Math.max(1, ctx.pkg.arrangement.clearance.y))
  const kf = pad ? 1 / (1 / sens.stiffness + 1 / PAD_K) : sens.stiffness
  const kw = cells ? 1 / (1 / sens.stiffness + 1 / 2.5e4) : sens.stiffness
  const sol = integrateVibration({ m, kf, kw, zeta: ZETA_VIB, mu: MU, play, headspace, lid, durationS: s.durationS }, baseMotion(s.profile, s.durationS))

  // Boundary: SI → display units.
  const travelMmS = mToMm(sol.travel) / s.durationS
  const impactsPerS = (sol.wallImpacts + sol.lidImpacts) / s.durationS
  const peakRatio = sol.peakF / (m * G)
  const airPct = (sol.airborne / s.durationS) * 100
  const abr = (travelMmS * (cells ? 1 : LOOSE_RUB)) / sens.abrasion
  const imp = peakRatio / (sens.g * 0.5)
  const score = Math.max(abr, imp)
  let risk: Risk = score < 0.8 ? 'low' : score < 1.3 ? 'moderate' : 'high'
  const concerns: string[] = []
  const failureModes: string[] = []
  if (abr >= 0.8) {
    concerns.push(`A unit slides about ${travelMmS.toFixed(1)} mm per second inside the pack${cells ? '' : ', rubbing on its neighbours'}.`)
    failureModes.push('Abrasion / scuffing from sliding')
  }
  if (imp >= 0.8) {
    concerns.push(`Repeated contacts reach about ${peakRatio.toFixed(0)} × the unit's weight.`)
    failureModes.push('Impact bruising from repeated contacts')
  }
  // Same rim criterion as the drop model: the unit's base must rise past the rim to leave an open tray.
  const escape = impactGap(ctx, 'bottom').escapeMm
  if (!lid && mToMm(sol.maxLift) > escape) {
    concerns.push(`Units lift more than ${escape.toFixed(0)} mm, clearing the rim of the open tray.`)
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
    trace: sol.trace,
    result: {
      test: 'vibration',
      method: 'simplified_motion_model',
      headline: `${prof.label}: ${risk} estimated risk`,
      risk,
      metrics: [
        { key: 'deckG', label: 'Peak deck acceleration (vertical)', value: toG(profilePeakAcc(s.profile)), unit: 'g', digits: 2, method: 'calculated', basis: 'Σ (2πf)²·A over the profile tones + bump peak (upper bound; phases rarely align).' },
        { key: 'travel', label: 'Sliding per second', value: travelMmS, unit: 'mm/s', digits: 1, method: 'simplified_motion_model', basis: 'Total distance the unit slides relative to the pack ÷ duration (Coulomb friction, stick below μ·N).' },
        { key: 'impacts', label: 'Wall/lid contacts per second', value: impactsPerS, unit: '/s', digits: 1, method: 'simplified_motion_model', basis: 'Number of new wall or lid contacts ÷ duration.' },
        { key: 'peak', label: 'Peak contact force ÷ unit weight', value: peakRatio, unit: '×', digits: 1, method: 'simplified_motion_model', basis: 'Largest floor, wall or lid force ÷ m·g. Resting on the floor is 1.' },
        { key: 'air', label: 'Time airborne', value: airPct, unit: '%', digits: 0, method: 'simplified_motion_model', basis: 'Share of the run without floor contact (deck accelerating downwards faster than g).' },
        { key: 'play', label: 'Free play per unit', value: mToMm(play), unit: 'mm', digits: 1, method: 'calculated', basis: '2 × side clearance along the pack length, from the arrangement geometry.' },
      ],
      concerns,
      failureModes,
      suggestions,
      assumptions: [
        `Deck motion: ${profileSpec(s.profile)}${prof.bumpG ? `; bumps last ${(BUMP_S * 1000).toFixed(0)} ms and the deck rises and returns` : ''}; lateral 50% of vertical; fixed random seed. Peak acceleration of a tone = (2πf)²·A.`,
        `One ${ctx.unitWeightG} g unit, floor stiffness ${(kf / 1000).toFixed(1)} kN/m${pad ? ' (incl. pad)' : ''}, damping ratio ${ZETA_VIB}, friction coefficient ${MU}, free play ${mToMm(play).toFixed(1)} mm along the pack length${lid ? `, lid ${mToMm(headspace).toFixed(0)} mm above` : ', open top'}.`,
        `Risk uses the larger of: sliding${cells ? '' : ` × ${LOOSE_RUB} (heuristic for rubbing on neighbours in loose fill)`} ÷ ${sens.abrasion.toFixed(0)} mm/s, and peak contact ÷ ${(sens.g * 0.5).toFixed(0)} g (assumed levels). It is a comparison band, not a damage probability.`,
        `Fixed ${(sol.dt * 1e6).toFixed(0)} µs step, semi-implicit Euler, starting at rest on the floor.`,
      ],
      limitations: [...LIMITATIONS, 'Resonance of the pallet or vehicle, rotation of the package, sliding across the pack width, unit-to-unit stacking and temperature effects are not modelled.'],
    },
  }
}

/* ================================================================= break my design */

export interface BreakConditions {
  drop: DropSettings
  stack: StackSettings
  vibration: VibrationSettings
}

export interface BreakReport {
  drop: DropOutput
  stack: StackOutput
  vibration: VibrationOutput
  conditions: BreakConditions
  risk: Risk
  suggestions: Suggestion[]
}

/** Fixed, harsher conditions. Depends only on the brief's stack height. */
export function breakConditions(ctx: Pick<SimContext, 'stackLayers'>): BreakConditions {
  return {
    drop: { heightCm: 80, orientation: 'corner' },
    stack: { layers: Math.max(2, ctx.stackLayers + 2), offsetMm: 10 },
    vibration: { profile: 'rough', durationS: 3 },
  }
}

/** Combined summary of three already-computed stages. */
export function combineBreak(drop: DropOutput, stack: StackOutput, vibration: VibrationOutput, conditions: BreakConditions): BreakReport {
  const seen = new Set<string>()
  const suggestions = [...drop.result.suggestions, ...stack.result.suggestions, ...vibration.result.suggestions].filter((s) => {
    const k = JSON.stringify(s.patch)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return { drop, stack, vibration, conditions, risk: maxRisk(drop.result.risk, stack.result.risk, vibration.result.risk), suggestions }
}

export function breakMyDesign(ctx: SimContext, conditions: BreakConditions = breakConditions(ctx)): BreakReport {
  return combineBreak(runDrop(ctx, conditions.drop), runStack(ctx, conditions.stack), runVibration(ctx, conditions.vibration), conditions)
}

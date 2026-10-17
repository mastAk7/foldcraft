import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { analyse } from './analysis'
import { defaultParams } from './params'
import { briefFor } from './project'
import { sampleProjects } from './seed'
import {
  baseMotion,
  BUMP_S,
  impactAxis,
  impactGap,
  integrateDrop,
  integrateVibration,
  ORIENT,
  profilePeakAcc,
  restitution,
  runDrop,
  runStack,
  runVibration,
  type DropSpec,
  type SimContext,
  type VibrationSpec,
} from './sims'
import type { DropOrientation, Project, VibrationProfile } from './types'
import { G, gToKg, mmToM, mToMm, SCENE_PER_M, toG } from './units'

const ORIENTS: DropOrientation[] = ['bottom', 'side', 'corner']
const PROFILES: VibrationProfile[] = ['smooth', 'normal', 'rough']
const metric = (r: { metrics: { key: string; value: number }[] }, k: string) => r.metrics.find((m) => m.key === k)!.value
const { projects } = sampleProjects('2026-10-18')
const ctxOf = (name: RegExp) => {
  const p = projects.find((x) => name.test(x.name)) as Project
  const v = p.versions[p.versions.length - 1]
  return analyse(v.params, p.brief).ctx
}
const strawberries = ctxOf(/Strawberries/) // lidded clamshell
const tomatoes = ctxOf(/Tomatoes/) // open produce tray
const apples = ctxOf(/Apples/) // open compartment tray, fruit stands proud of the rim
const mangoes = ctxOf(/Mangoes/) // folding carton with cells
const SEEDS = [strawberries, tomatoes, apples, mangoes]
const thrown = (r: { failureModes: string[] }) => r.failureModes.includes('Contents thrown from open tray')

describe('units', () => {
  it('converts only through explicit factors', () => {
    expect(mmToM(1234)).toBeCloseTo(1.234, 12)
    expect(mToMm(mmToM(56.7))).toBeCloseTo(56.7, 12)
    expect(gToKg(250)).toBeCloseTo(0.25, 12)
    expect(toG(G)).toBe(1)
    // One scene transform for geometry (S = 0.01 per mm) and trajectories (per m).
    expect(SCENE_PER_M).toBeCloseTo(0.01 * 1000, 12)
  })
})

describe('drop: free fall and energy', () => {
  const pack: DropSpec = { h: 0.8, M: 0.3, m: 0, kg: 1e5, zg: 0.35, kc: 1, zc: 0.5, gap: Infinity }

  it('impact speed is √(2gh) and release energy is m·g·h (hand values)', () => {
    const r = runDrop(strawberries, { heightCm: 80, orientation: 'bottom' }).result
    expect(metric(r, 'v0')).toBeCloseTo(3.9618, 3) // √(2 × 9.81 × 0.8)
    const mass = gToKg(strawberries.packMassG + strawberries.unitWeightG * strawberries.units)
    expect(metric(r, 'e0')).toBeCloseTo(mass * G * 0.8, 9)
    const half = integrateDrop({ ...pack, M: 0.15 })
    const low = integrateDrop({ ...pack, h: 0.4 })
    expect(integrateDrop(pack).e0).toBeCloseTo(2 * half.e0, 9)
    expect(integrateDrop(pack).e0).toBeCloseTo(2 * low.e0, 9)
  })

  it('before contact the trajectory follows h − ½gt² and contact starts at √(2h/g)', () => {
    for (const h of [0.3, 0.8, 1.2]) {
      const tr = integrateDrop({ ...pack, h }).trace
      for (let i = 0; i < tr.impactIndex; i++) expect(tr.y[i]).toBeCloseTo(h - 0.5 * G * tr.t[i] ** 2, 4)
      expect(Math.abs(tr.t[tr.impactIndex] - Math.sqrt((2 * h) / G))).toBeLessThan(1e-4)
    }
  })

  it('rebound matches the analytic restitution of a compressive-only spring–dashpot', () => {
    for (const z of [0.1, 0.35, 0.5, 0.8]) {
      const sol = integrateDrop({ ...pack, kg: 1e6, zg: z })
      expect(sol.restitution).toBeGreaterThan(0)
      expect(Math.abs(sol.restitution - restitution(z)) / restitution(z)).toBeLessThan(0.02)
    }
    // More damping, less rebound; no damping, no loss.
    expect(restitution(0.5)).toBeLessThan(restitution(0.35))
    expect(restitution(0)).toBe(1)
  })

  it('never gains energy and comes to rest on the floor at the static compression', () => {
    for (const spec of [pack, { ...pack, m: 0.05, kc: 8e3, gap: 0.01 }, { ...pack, m: 0.2, kc: 6e4, gap: Infinity }]) {
      const sol = integrateDrop(spec)
      for (let i = 1; i < sol.energy.length; i++) expect(sol.energy[i]).toBeLessThanOrEqual(sol.energy[i - 1] + 1e-3 * sol.e0)
      expect(Math.max(...sol.energy)).toBeLessThanOrEqual(sol.e0 * 1.001)
      expect(sol.tRest).not.toBeNull()
      // Final pose: in contact, not hovering; height = −(M + m)·g/k (the static compression).
      const yEnd = sol.trace.y[sol.trace.y.length - 1]
      expect(yEnd).toBeLessThan(0)
      expect(yEnd).toBeCloseTo((-(spec.M + spec.m) * G) / spec.kg, 5)
    }
  })

  it('the unit never passes the bounding lid or wall by more than its contact compression', () => {
    const gap = 0.006
    const sol = integrateDrop({ h: 1.2, M: 0.3, m: 0.05, kg: 1e5, zg: 0.35, kc: 8e3, zc: 0.5, gap })
    expect(sol.struck).toBe(true)
    expect(sol.lift).toBeGreaterThan(gap)
    expect(sol.lift - gap).toBeLessThan(sol.compress + 1e-3)
  })

  it('higher drops hit the unit harder', () => {
    const g = (h: number) => metric(runDrop(strawberries, { heightCm: h, orientation: 'bottom' }).result, 'prodG')
    expect(g(100)).toBeGreaterThan(g(40))
    expect(g(40)).toBeGreaterThan(g(15))
  })
})

describe('drop: geometry of the rebound', () => {
  it('the impact axis matches the scene rotation', () => {
    for (const o of ORIENTS) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...ORIENT[o]))
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(q.clone().invert())
      const a = impactAxis(o)
      expect(a[0]).toBeCloseTo(down.x, 9)
      expect(a[1]).toBeCloseTo(down.y, 9)
      expect(a[2]).toBeCloseTo(down.z, 9)
    }
  })

  it('rebound is bounded by the lid (bottom), the opposite wall (side, corner) or nothing (open top)', () => {
    expect(impactGap(strawberries, 'bottom').by).toBe('lid')
    expect(impactGap(tomatoes, 'bottom').by).toBe('none')
    for (const ctx of SEEDS) {
      expect(impactGap(ctx, 'side').by).toBe('wall')
      expect(impactGap(ctx, 'side').gapMm).toBeCloseTo(Math.max(1, 2 * ctx.pkg.arrangement.clearance.z), 6)
      expect(impactGap(ctx, 'corner').by).toBe('wall')
    }
    expect(impactGap(apples, 'bottom').escapeMm).toBeGreaterThan(apples.pkg.arrangement.clearance.y + 30)
  })

  it('open trays are not reported as emptied by side drops or by fruit standing proud of the rim', () => {
    for (const ctx of [tomatoes, apples]) for (const h of [30, 80, 120]) for (const o of ['side', 'corner'] as const) expect(thrown(runDrop(ctx, { heightCm: h, orientation: o }).result)).toBe(false)
    expect(thrown(runDrop(apples, { heightCm: 30, orientation: 'bottom' }).result)).toBe(false)
    expect(thrown(runDrop(tomatoes, { heightCm: 30, orientation: 'bottom' }).result)).toBe(false)
  })

  it('escape is reported exactly when the rebound exceeds the depth below the rim', () => {
    const esc = impactGap(apples, 'bottom').escapeMm
    for (const h of [30, 60, 90, 120]) {
      const r = runDrop(apples, { heightCm: h, orientation: 'bottom' }).result
      expect(metric(r, 'lift')).toBeLessThanOrEqual(esc + 1e-9)
      if (thrown(r)) expect(metric(r, 'lift')).toBeCloseTo(esc, 6)
    }
  })

  it('a strike is reported exactly when the trace records boundary contact', () => {
    for (const ctx of [strawberries, tomatoes, apples])
      for (const o of ORIENTS)
        for (const h of [20, 80]) {
          const d = runDrop(ctx, { heightCm: h, orientation: o })
          const struck = d.result.failureModes.some((f) => f.startsWith('Contents strike'))
          if (d.trace.contact.includes(2)) expect(struck).toBe(true)
          if (impactGap(ctx, o).by === 'none') expect(struck).toBe(false)
        }
  })

  it('samples the contact pulse finely enough to draw it', () => {
    const tr = runDrop(strawberries, { heightCm: 80, orientation: 'bottom' }).trace
    const i = tr.impactIndex
    expect(tr.t[i + 1] - tr.t[i]).toBeLessThanOrEqual(2.1e-4)
    expect(tr.acc.slice(i, i + 40).filter((a) => a > 0).length).toBeGreaterThan(10)
  })
})

describe('vibration', () => {
  const unit: VibrationSpec = { m: 0.1, kf: 3e4, kw: 3e4, zeta: 0.3, mu: 0.4, play: 0.01, headspace: 0.01, lid: false, durationS: 2 }
  const sine = (aVert: number, fVert: number, aLat = 0, fLat = 6) => {
    const wv = 2 * Math.PI * fVert
    const wl = 2 * Math.PI * fLat
    return {
      disp: (t: number, lat: boolean) => (lat ? -aLat * Math.sin(wl * t) : -aVert * Math.sin(wv * t)),
      acc: (t: number, lat: boolean) => (lat ? aLat * wl * wl * Math.sin(wl * t) : aVert * wv * wv * Math.sin(wv * t)),
    }
  }
  /** Amplitude giving a peak acceleration of `g` multiples at frequency f: A = a / (2πf)². */
  const ampFor = (gs: number, f: number) => (gs * G) / (2 * Math.PI * f) ** 2

  it('peak acceleration of a sine base motion is (2πf)²·A', () => {
    const A = 0.002
    const f = 12
    const m = sine(A, f)
    let peak = 0
    for (let t = 0; t < 1; t += 1e-5) peak = Math.max(peak, Math.abs(m.acc(t, false)))
    expect(peak).toBeCloseTo((2 * Math.PI * f) ** 2 * A, 3)
    // Profile summaries use the same relation (upper bound over tones + bump).
    expect(profilePeakAcc('smooth')).toBeCloseTo((2 * Math.PI * 4) ** 2 * 0.0004 + (2 * Math.PI * 12) ** 2 * 0.00015, 9)
  })

  it('zero excitation leaves the unit at rest at its static equilibrium', () => {
    const sol = integrateVibration(unit, { disp: () => 0, acc: () => 0 })
    expect(sol.travel).toBe(0)
    expect(sol.airborne).toBe(0)
    expect(sol.maxSlide).toBe(0)
    expect(sol.trace.py.every((v) => v === 0)).toBe(true)
    expect(sol.peakF / (unit.m * G)).toBeCloseTo(1, 6)
  })

  it('lifts off only when the deck accelerates downwards faster than g', () => {
    for (const f of [5, 15]) {
      expect(integrateVibration(unit, sine(ampFor(0.8, f), f)).airborne).toBe(0)
      expect(integrateVibration(unit, sine(ampFor(1.3, f), f)).airborne).toBeGreaterThan(0)
    }
    // Same amplitude, higher frequency: (2πf)² grows, so the faster road lifts the unit and the slower does not.
    const A = ampFor(0.8, 8)
    expect(integrateVibration(unit, sine(A, 8)).airborne).toBe(0)
    expect(integrateVibration(unit, sine(A, 12)).airborne).toBeGreaterThan(0)
  })

  it('friction holds the unit exactly below μ·g and lets it slide above, within its walls', () => {
    const f = 6
    expect(integrateVibration(unit, sine(0, 5, ampFor(0.5 * unit.mu, f), f)).travel).toBe(0)
    const slow = integrateVibration(unit, sine(0, 5, ampFor(1.5 * unit.mu, f), f))
    const fast = integrateVibration(unit, sine(0, 5, ampFor(3 * unit.mu, f), f))
    expect(slow.travel).toBeGreaterThan(0)
    expect(fast.travel).toBeGreaterThan(slow.travel)
    // Bounded by the walls: at most the half play plus the wall contact compression.
    expect(fast.maxSlide).toBeLessThan(unit.play / 2 + 0.002)
  })

  it('bumps rise and return, and acceleration is the second derivative of the displayed deck motion', () => {
    const m = baseMotion('rough', 3)
    expect(m.bumps.length).toBeGreaterThan(0)
    const h = 1e-4
    for (const lateral of [false, true])
      for (const t of [0.13, 0.77, 1.91, ...m.bumps.flatMap((b) => [b + 0.005, b + BUMP_S / 2, b + BUMP_S - 0.005])]) {
        const fd = (m.disp(t + h, lateral) - 2 * m.disp(t, lateral) + m.disp(t - h, lateral)) / (h * h)
        expect(Math.abs(fd - m.acc(t, lateral))).toBeLessThan(0.02 * 1.8 * G)
      }
    const dt = 1e-5
    let v = 0
    for (let t = 0; t < 3; t += dt) v += m.acc(t, false) * dt
    const vel = (t: number) => (m.disp(t + 1e-6, false) - m.disp(t - 1e-6, false)) / 2e-6
    expect(v).toBeCloseTo(vel(3) - vel(0), 2)
  })

  it('on a smooth road the unit rests on the floor: never airborne, contact ≈ its own weight', () => {
    for (const ctx of SEEDS) {
      const r = runVibration(ctx, { profile: 'smooth', durationS: 3 }).result
      expect(metric(r, 'air')).toBe(0)
      expect(metric(r, 'peak')).toBeGreaterThan(0.9)
      expect(metric(r, 'peak')).toBeLessThan(1.3)
    }
  })

  it('free play comes from the arrangement geometry along the pack length', () => {
    for (const ctx of SEEDS) {
      const r = runVibration(ctx, { profile: 'normal', durationS: 2 }).result
      expect(metric(r, 'play')).toBeCloseTo(Math.max(0.5, 2 * ctx.pkg.arrangement.clearance.x), 9)
    }
  })
})

describe('stack compression', () => {
  const brief = briefFor('mango', '2026-10-18')
  const carton = analyse(defaultParams('folding_carton', { length: 260, width: 100, height: 90 }), brief).ctx

  it('load is the weight of the packs above; stress is F/A over the load-bearing walls', () => {
    const gross = gToKg(carton.packMassG + carton.unitWeightG * carton.units)
    const one = runStack(carton, { layers: 1, offsetMm: 0 })
    expect(metric(one.result, 'load')).toBe(0)
    expect(one.stressPa).toBe(0)
    const s5 = runStack(carton, { layers: 5, offsetMm: 0 })
    expect(metric(s5.result, 'load')).toBeCloseTo(4 * gross * G, 9)
    const area = mmToM(2 * (carton.pkg.outer.l + carton.pkg.outer.w)) * mmToM(carton.params.wallMm)
    expect(s5.capacity.wallAreaM2).toBeCloseTo(area, 12)
    expect(s5.stressPa).toBeCloseTo((4 * gross * G) / area, 6)
    // Linear in the load: 4 packs above vs 2 packs above.
    expect(s5.stressPa / runStack(carton, { layers: 3, offsetMm: 0 }).stressPa).toBeCloseTo(2, 9)
    expect(metric(s5.result, 'crushRatio')).toBeCloseTo(s5.stressPa / s5.capacity.crushStressPa, 9)
  })

  it('McKee capacity sits below pure edge crush (walls buckle first)', () => {
    for (const ctx of [...SEEDS, carton]) {
      const c = runStack(ctx, { layers: 3, offsetMm: 0 }).capacity
      expect(c.bucklingFactor).toBeGreaterThan(0)
      expect(c.bucklingFactor).toBeLessThan(1)
      expect(c.capacity).toBeCloseTo(c.bucklingFactor * c.perimeter * c.ect, 6)
    }
  })

  it('overhang and the tipping limit use the same outer footprint', () => {
    const narrow = Math.min(carton.pkg.outer.l, carton.pkg.outer.w)
    const s = runStack(carton, { layers: 2, offsetMm: 20 })
    expect(s.supportHalfMm).toBeCloseTo(narrow / 2, 9)
    expect(s.overhangPct).toBeCloseTo((20 / narrow) * 100, 9)
    expect(runStack(carton, { layers: 2, offsetMm: Math.floor(narrow / 2) - 1 }).tipMargin).toBeGreaterThan(0)
    expect(runStack(carton, { layers: 2, offsetMm: Math.ceil(narrow / 2) + 1 }).tipMargin).toBeLessThan(0)
  })

  it('is labelled a static estimate that computes no deformation', () => {
    const r = runStack(carton, { layers: 4, offsetMm: 0 }).result
    expect(r.method).toBe('simplified_estimate')
    expect(r.assumptions.join(' ')).toMatch(/No deformation or strain is computed/)
    expect(r.limitations.join(' ')).toMatch(/placement only/)
  })
})

describe('general stability', () => {
  it('rejects unusable inputs instead of producing NaN', () => {
    const bad: SimContext = { ...strawberries, unitWeightG: Number.NaN }
    expect(() => runDrop(bad, { heightCm: 80, orientation: 'bottom' })).toThrow(RangeError)
    expect(() => runVibration({ ...strawberries, units: 0 }, { profile: 'rough', durationS: 3 })).toThrow(RangeError)
    expect(() => runDrop(strawberries, { heightCm: 0, orientation: 'bottom' })).toThrow(RangeError)
    expect(() => runStack(strawberries, { layers: 0, offsetMm: 0 })).toThrow(RangeError)
    expect(() => runStack(strawberries, { layers: 3, offsetMm: -5 })).toThrow(RangeError)
  })

  it('every metric and trace value is finite across the sample designs, orientations, heights and profiles', () => {
    const finite = (xs: number[]) => xs.every(Number.isFinite)
    for (const ctx of SEEDS) {
      for (const o of ORIENTS)
        for (const h of [15, 60, 120]) {
          const d = runDrop(ctx, { heightCm: h, orientation: o })
          expect(finite(d.result.metrics.map((m) => m.value))).toBe(true)
          expect(finite([...d.trace.t, ...d.trace.y, ...d.trace.rel, ...d.trace.acc, ...d.trace.unitAcc])).toBe(true)
        }
      for (const pr of PROFILES) {
        const v = runVibration(ctx, { profile: pr, durationS: 3 })
        expect(finite(v.result.metrics.map((m) => m.value))).toBe(true)
        expect(finite([...v.trace.base, ...v.trace.baseLat, ...v.trace.px, ...v.trace.py])).toBe(true)
      }
      expect(finite(runStack(ctx, { layers: 8, offsetMm: 15 }).result.metrics.map((m) => m.value))).toBe(true)
    }
  })

  it('identical inputs give identical outputs', () => {
    expect(runDrop(apples, { heightCm: 90, orientation: 'corner' })).toEqual(runDrop(apples, { heightCm: 90, orientation: 'corner' }))
    expect(runVibration(tomatoes, { profile: 'rough', durationS: 3 })).toEqual(runVibration(tomatoes, { profile: 'rough', durationS: 3 }))
  })
})

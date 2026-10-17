import * as THREE from 'three'
import type { Dims } from '../domain/types'
import { G, mmToM } from '../domain/units'

/**
 * Where a dropped package comes to rest after the one-axis impact model has finished.
 *
 * Rigid box (outer dimensions, uniform density so the centre of mass is the box centre) released at
 * rest in its test orientation with its lowest point on the floor. While its centre of mass is not
 * above the support (the floor contacts), gravity rotates it about the support:
 *   - one contact point: about the horizontal axis of the gravity torque through that point;
 *   - an edge (two contacts, or the support edge the centre of mass is beyond): about that edge line;
 * with θ'' = τ / I_pivot, I_pivot = aᵀ·I_cm·a + m·d² (box inertia tensor plus the parallel-axis term).
 * Each new floor contact is treated as perfectly inelastic (rotation stops, no bounce), then the support
 * is re-evaluated. It ends when at least three contacts surround the centre of mass.
 *
 * Fixed 1 ms step; deterministic. Positions are SI (m), the body origin is the centre of its base face.
 */

export interface TopplePose {
  t: number
  q: THREE.Quaternion
  /** Body origin (centre of the base face) in world coordinates, m. */
  p: THREE.Vector3
}

export interface ToppleResult {
  frames: TopplePose[]
  final: TopplePose
  /** True when the package rotated before coming to rest. */
  toppled: boolean
  /** Height of the centre of mass over time, m (for checks: it can only fall). */
  comHeight: number[]
}

const EPS = 1e-4 // 0.1 mm contact tolerance
const DT = 1e-3
const FRAME_DT = 1 / 120
const T_MAX = 5
const GRAV = new THREE.Vector3(0, -G, 0)

function corners(o: { l: number; w: number; h: number }) {
  const out: THREE.Vector3[] = []
  for (const x of [-o.l / 2, o.l / 2]) for (const y of [0, o.h]) for (const z of [-o.w / 2, o.w / 2]) out.push(new THREE.Vector3(x, y, z))
  return out
}

/** Convex hull (x, z) of points, counter-clockwise (monotone chain). */
export function hull2(pts: { x: number; z: number }[]) {
  const p = [...pts].sort((a, b) => a.x - b.x || a.z - b.z)
  if (p.length < 3) return p
  const cross = (o: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)
  const lower: typeof p = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-12) lower.pop()
    lower.push(q)
  }
  const upper: typeof p = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-12) upper.pop()
    upper.push(q)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

export function topple(outerMm: Dims, q0: THREE.Quaternion): ToppleResult {
  const o = { l: mmToM(outerMm.l), w: mmToM(outerMm.w), h: mmToM(outerMm.h) }
  const local = corners(o)
  const comLocal = new THREE.Vector3(0, o.h / 2, 0)
  // Inertia of a uniform box per unit mass about its centre, body axes x (l), y (h), z (w).
  const I = new THREE.Vector3((o.h * o.h + o.w * o.w) / 12, (o.l * o.l + o.w * o.w) / 12, (o.l * o.l + o.h * o.h) / 12)
  const q = q0.clone()
  const p = new THREE.Vector3()
  const world = local.map(() => new THREE.Vector3())
  const com = new THREE.Vector3()
  const place = () => {
    for (let i = 0; i < 8; i++) world[i].copy(local[i]).applyQuaternion(q).add(p)
    com.copy(comLocal).applyQuaternion(q).add(p)
  }
  place()
  p.y -= Math.min(...world.map((v) => v.y))
  place()

  const frames: TopplePose[] = [{ t: 0, q: q.clone(), p: p.clone() }]
  const comHeight = [com.y]
  let omega = 0
  let nextFrame = FRAME_DT
  let toppled = false
  const axis = new THREE.Vector3()
  const pivot = new THREE.Vector3()
  const r = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  const rot = new THREE.Quaternion()
  const qInv = new THREE.Quaternion()
  const q1 = new THREE.Quaternion()
  const p1 = new THREE.Vector3()

  let t = 0
  for (; t < T_MAX; t += DT) {
    const contacts = world.filter((v) => v.y < EPS)
    const h = hull2(contacts.map((v) => ({ x: v.x, z: v.z })))
    // Find the support edge the centre of mass lies beyond (or the single contact point).
    let found = false
    if (h.length >= 3) {
      let outside = -1
      let worst = 0
      for (let i = 0; i < h.length; i++) {
        const a = h[i]
        const b = h[(i + 1) % h.length]
        const c = (b.x - a.x) * (com.z - a.z) - (b.z - a.z) * (com.x - a.x)
        const len = Math.hypot(b.x - a.x, b.z - a.z)
        if (c / len < worst - 1e-9) {
          worst = c / len
          outside = i
        }
      }
      if (outside < 0) break // centre of mass inside the support: at rest
      const a = h[outside]
      const b = h[(outside + 1) % h.length]
      pivot.set(a.x, 0, a.z)
      axis.set(b.x - a.x, 0, b.z - a.z).normalize()
      found = true
    } else if (h.length === 2) {
      pivot.set(h[0].x, 0, h[0].z)
      axis.set(h[1].x - h[0].x, 0, h[1].z - h[0].z).normalize()
      found = true
    } else if (h.length === 1) {
      pivot.set(h[0].x, 0, h[0].z)
      r.subVectors(com, pivot)
      // τ = r × (0, −g, 0) per unit mass = g·(r_z, 0, −r_x)
      axis.set(r.z, 0, -r.x)
      if (axis.lengthSq() < 1e-14) break // balanced exactly over the point (unstable equilibrium)
      axis.normalize()
      found = true
    }
    if (!found) break
    r.subVectors(com, pivot)
    let torque = tmp.crossVectors(r, GRAV).dot(axis)
    if (torque < 0) {
      axis.negate()
      torque = -torque
    }
    if (torque < 1e-9) break
    // I about the pivot axis: aᵀ I_cm a (axis in body frame) + d², d = distance of the centre of mass from the axis line.
    qInv.copy(q).invert()
    const ab = tmp.copy(axis).applyQuaternion(qInv)
    const Icm = ab.x * ab.x * I.x + ab.y * ab.y * I.y + ab.z * ab.z * I.z
    const along = r.dot(axis)
    const d2 = r.lengthSq() - along * along
    omega += (torque / (Icm + d2)) * DT
    q1.copy(q)
    p1.copy(p)
    const turn = (angle: number) => {
      rot.setFromAxisAngle(axis, angle)
      q.copy(q1).premultiply(rot)
      p.copy(p1).sub(pivot).applyQuaternion(rot).add(pivot)
      place()
      return Math.min(...world.map((v) => v.y))
    }
    toppled = true
    // A vertex reaching the floor stops the rotation (inelastic landing): find the angle where it just touches.
    if (turn(omega * DT) < -1e-7) {
      let lo = 0
      let hi = omega * DT
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2
        if (turn(mid) < 0) hi = mid
        else lo = mid
      }
      turn(lo)
      omega = 0
    }
    comHeight.push(com.y)
    if (t + DT >= nextFrame) {
      frames.push({ t: t + DT, q: q.clone(), p: p.clone() })
      nextFrame += FRAME_DT
    }
  }
  const final = { t, q: q.clone(), p: p.clone() }
  if (frames[frames.length - 1].t !== t) frames.push(final)
  return { frames, final, toppled, comHeight }
}

/** Pose at time t (s) by interpolating the frames. */
export function toppleAt(r: ToppleResult, t: number, outQ: THREE.Quaternion, outP: THREE.Vector3) {
  const f = r.frames
  if (t <= 0 || f.length === 1) {
    outQ.copy(f[0].q)
    outP.copy(f[0].p)
    return
  }
  let i = 0
  while (i < f.length - 2 && f[i + 1].t <= t) i++
  const a = f[i]
  const b = f[Math.min(i + 1, f.length - 1)]
  const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1
  outQ.copy(a.q).slerp(b.q, k)
  outP.copy(a.p).lerp(b.p, k)
}

import * as THREE from 'three'
import type { Dims } from '../domain/types'
import { S } from '../three/PackageModel'

/** Pure helpers shared by the lab scenes: trace lookup and the resting pose of a rotated package. */

/** Last sample index whose time is ≤ `time` (binary search; `t` ascending). */
export function sampleIndex(t: number[], time: number) {
  let lo = 0
  let hi = t.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (t[mid] <= time) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Linear interpolation of a trace at `time`. */
export function sample(arr: number[], t: number[], time: number) {
  const i = sampleIndex(t, time)
  if (i >= t.length - 1) return arr[arr.length - 1]
  const f = Math.max(0, Math.min(1, (time - t[i]) / (t[i + 1] - t[i] || 1)))
  return arr[i] + (arr[i + 1] - arr[i]) * f
}

const v = new THREE.Vector3()

/** Lowest corner of the rotated outer box: how far to lift it so it rests on the floor, and where it touches. */
export function lowest(outer: Dims, q: THREE.Quaternion) {
  let min = Infinity
  let x = 0
  let z = 0
  for (const px of [-outer.l / 2, outer.l / 2])
    for (const py of [0, outer.h])
      for (const pz of [-outer.w / 2, outer.w / 2]) {
        v.set(px * S, py * S, pz * S).applyQuaternion(q)
        if (v.y < min - 1e-9) {
          min = v.y
          x = v.x
          z = v.z
        }
      }
  return { lift: -min, x, z }
}

export interface SquashFrame {
  /** Unit vector from the impact face into the pack (package frame). */
  u: THREE.Vector3
  /** u · (contact point): the impact face's position along u, scene units. */
  c: number
  /** Extent of the pack along u, scene units. */
  L: number
}

/** Geometry for drawing the floor-contact compression as a compression of the pack along the impact axis. */
export function squashFrame(outer: Dims, down: THREE.Vector3): SquashFrame {
  const u = down.clone().negate().normalize()
  let lo = Infinity
  let hi = -Infinity
  for (const px of [-outer.l / 2, outer.l / 2])
    for (const py of [0, outer.h])
      for (const pz of [-outer.w / 2, outer.w / 2]) {
        const s = v.set(px * S, py * S, pz * S).dot(u)
        lo = Math.min(lo, s)
        hi = Math.max(hi, s)
      }
  return { u, c: lo, L: hi - lo }
}

/**
 * v' = v − (δ/L)·u·(u·v − c): the impact face stays put and the far side moves δ towards it, so the
 * drawn compression equals the model's contact compression δ (same units, scene = SI × SCENE_PER_M).
 */
export function crushMatrix(f: SquashFrame, delta: number, out: THREE.Matrix4) {
  const k = f.L > 0 ? Math.min(0.5, Math.max(0, delta) / f.L) : 0
  const { x, y, z } = f.u
  return out.set(1 - k * x * x, -k * x * y, -k * x * z, k * f.c * x, -k * y * x, 1 - k * y * y, -k * y * z, k * f.c * y, -k * z * x, -k * z * y, 1 - k * z * z, k * f.c * z, 0, 0, 0, 1)
}

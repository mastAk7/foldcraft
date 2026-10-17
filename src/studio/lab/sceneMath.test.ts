import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ORIENT } from '../domain/sims'
import { S } from '../three/PackageModel'
import { crushMatrix, lowest, sample, sampleIndex, squashFrame } from './sceneMath'
import { dropRate, DROP_SPEED } from './scenes'

describe('scene math', () => {
  it('looks up and interpolates trace samples', () => {
    const t = [0, 0.1, 0.2, 0.4]
    expect(sampleIndex(t, -1)).toBe(0)
    expect(sampleIndex(t, 0.15)).toBe(1)
    expect(sampleIndex(t, 9)).toBe(3)
    expect(sample([0, 10, 20, 0], t, 0.3)).toBeCloseTo(10, 9)
    expect(sample([0, 10, 20, 0], t, 9)).toBe(0)
  })

  it('rests each test orientation with its lowest corner on the floor', () => {
    const outer = { l: 200, w: 120, h: 60 }
    const q = (o: keyof typeof ORIENT) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...ORIENT[o]))
    expect(lowest(outer, q('bottom')).lift).toBeCloseTo(0, 9)
    // Side: rotated 90° about x, so it rests on a length × height face, half the width below the origin.
    expect(lowest(outer, q('side')).lift).toBeCloseTo((outer.w / 2) * S, 9)
    const c = lowest(outer, q('corner'))
    const v = new THREE.Vector3()
    for (const x of [-1, 1]) for (const y of [0, 1]) for (const z of [-1, 1]) {
      v.set((x * outer.l) / 2, y * outer.h, (z * outer.w) / 2).multiplyScalar(S).applyQuaternion(q('corner'))
      expect(v.y + c.lift).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('draws the model compression δ exactly: impact face fixed, far side moved δ along the impact axis', () => {
    const outer = { l: 200, w: 120, h: 60 }
    for (const down of [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.4, -0.7, 0.59).normalize()]) {
      const f = squashFrame(outer, down)
      const delta = 0.004 // scene units = 0.4 mm × SCENE_PER_M
      const m = crushMatrix(f, delta, new THREE.Matrix4())
      const pts: THREE.Vector3[] = []
      for (const x of [-1, 1]) for (const y of [0, 1]) for (const z of [-1, 1]) pts.push(new THREE.Vector3((x * outer.l) / 2, y * outer.h, (z * outer.w) / 2).multiplyScalar(S))
      const along = (p: THREE.Vector3) => p.dot(f.u)
      const near = pts.reduce((a, b) => (along(b) < along(a) ? b : a))
      const far = pts.reduce((a, b) => (along(b) > along(a) ? b : a))
      expect(near.clone().applyMatrix4(m).distanceTo(near)).toBeCloseTo(0, 9)
      expect(along(far) - along(far.clone().applyMatrix4(m))).toBeCloseTo(delta, 9)
    }
    expect(crushMatrix(squashFrame(outer, new THREE.Vector3(0, -1, 0)), 0, new THREE.Matrix4()).equals(new THREE.Matrix4())).toBe(true)
  })

  it('playback rate changes smoothly between free-fall and contact speed', () => {
    const impact = 0.4
    let prev = dropRate(0, impact)
    for (let t = 0; t < 0.6; t += 1e-4) {
      const r = dropRate(t, impact)
      expect(r).toBeGreaterThanOrEqual(DROP_SPEED.impact - 1e-12)
      expect(r).toBeLessThanOrEqual(DROP_SPEED.fall + 1e-12)
      expect(Math.abs(r - prev)).toBeLessThan(0.01)
      prev = r
    }
    expect(dropRate(impact, impact)).toBeCloseTo(DROP_SPEED.impact, 9)
  })
})

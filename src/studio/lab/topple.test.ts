import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ORIENT } from '../domain/sims'
import { mmToM } from '../domain/units'
import { hull2, topple } from './topple'

const qOf = (o: keyof typeof ORIENT) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...ORIENT[o]))
const BOXES = [
  { l: 188, w: 156, h: 51 },
  { l: 251, w: 96, h: 84 },
  { l: 100, w: 100, h: 250 },
]

function vertices(outerMm: { l: number; w: number; h: number }, q: THREE.Quaternion, p: THREE.Vector3) {
  const o = { l: mmToM(outerMm.l), w: mmToM(outerMm.w), h: mmToM(outerMm.h) }
  const out: THREE.Vector3[] = []
  for (const x of [-o.l / 2, o.l / 2]) for (const y of [0, o.h]) for (const z of [-o.w / 2, o.w / 2]) out.push(new THREE.Vector3(x, y, z).applyQuaternion(q).add(p))
  return { out, com: new THREE.Vector3(0, o.h / 2, 0).applyQuaternion(q).add(p) }
}

describe('post-impact topple', () => {
  it('bottom and side poses are already stable: no rotation', () => {
    for (const b of BOXES)
      for (const o of ['bottom', 'side'] as const) {
        const r = topple(b, qOf(o))
        expect(r.toppled).toBe(false)
        expect(r.final.q.angleTo(qOf(o))).toBeCloseTo(0, 9)
      }
  })

  it('a corner drop ends resting on a face with the centre of mass over the support', () => {
    for (const b of BOXES) {
      const r = topple(b, qOf('corner'))
      expect(r.toppled).toBe(true)
      const { out, com } = vertices(b, r.final.q, r.final.p)
      const onFloor = out.filter((v) => Math.abs(v.y) < 2e-4)
      expect(onFloor.length).toBe(4) // a whole face down
      expect(Math.min(...out.map((v) => v.y))).toBeGreaterThan(-1e-6) // nothing below the floor
      const h = hull2(onFloor.map((v) => ({ x: v.x, z: v.z })))
      for (let i = 0; i < h.length; i++) {
        const a = h[i]
        const c = h[(i + 1) % h.length]
        expect((c.x - a.x) * (com.z - a.z) - (c.z - a.z) * (com.x - a.x)).toBeGreaterThan(0)
      }
    }
  })

  it('the centre of mass only falls (gravity does the work, landings absorb it)', () => {
    for (const b of BOXES) {
      const ch = topple(b, qOf('corner')).comHeight
      for (let i = 1; i < ch.length; i++) expect(ch[i]).toBeLessThanOrEqual(ch[i - 1] + 1e-9)
      expect(ch[ch.length - 1]).toBeLessThan(ch[0])
    }
  })

  it('is deterministic', () => {
    const a = topple(BOXES[1], qOf('corner'))
    const b = topple(BOXES[1], qOf('corner'))
    expect(a.final.q.equals(b.final.q)).toBe(true)
    expect(a.final.p.equals(b.final.p)).toBe(true)
    expect(a.frames.length).toBe(b.frames.length)
  })
})

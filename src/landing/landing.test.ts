import { describe, expect, it } from 'vitest'
import { STAGES, stageFocus, stageIndexAt } from './content'
import { textVisibility } from './journey'
import { cavePose } from './scene/Elements'
import { buildWorld, faceDepth, surfaceHeight, WORLD } from './scene/worldgen'
import { ATMOS_KEYS, CAM_KEYS, sampleAtmos, sampleCamera, splineT, vitalityAt } from './timeline'

describe('narrative stages', () => {
  it('tile the whole journey in order', () => {
    expect(STAGES[0].range[0]).toBe(0)
    expect(STAGES[STAGES.length - 1].range[1]).toBe(1)
    for (let i = 1; i < STAGES.length; i++) expect(STAGES[i].range[0]).toBe(STAGES[i - 1].range[1])
  })

  it('keep each text window inside its own stage', () => {
    STAGES.forEach((s, i) => {
      expect(s.text[0]).toBeGreaterThanOrEqual(s.range[0])
      expect(stageIndexAt(stageFocus(i))).toBe(i)
    })
  })

  it('never show two stages’ copy fully at once', () => {
    for (let p = 0; p <= 1; p += 0.001) {
      const visible = STAGES.map((_, i) => textVisibility(i, p)).filter((v) => v > 0.5)
      expect(visible.length).toBeLessThanOrEqual(1)
    }
  })

  it('show the hero at the top and the final CTA at the end', () => {
    expect(textVisibility(0, 0)).toBe(1)
    expect(textVisibility(STAGES.length - 1, 1)).toBe(1)
  })
})

describe('camera timeline', () => {
  it('keyframes are ordered and span 0..1', () => {
    expect(CAM_KEYS[0].p).toBe(0)
    expect(CAM_KEYS[CAM_KEYS.length - 1].p).toBe(1)
    for (let i = 1; i < CAM_KEYS.length; i++) expect(CAM_KEYS[i].p).toBeGreaterThan(CAM_KEYS[i - 1].p)
  })

  it('maps progress to the spline monotonically and hits every keyframe', () => {
    let prev = -1
    for (let p = 0; p <= 1; p += 0.0005) {
      const t = splineT(p)
      expect(t).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = t
    }
    CAM_KEYS.forEach((k) => {
      const s = sampleCamera(k.p)
      expect(s.pos.distanceTo({ x: k.pos[0], y: k.pos[1], z: k.pos[2] } as never)).toBeLessThan(1e-3)
    })
  })

  it('moves continuously (no jumps between adjacent scroll positions)', () => {
    let last = sampleCamera(0)
    let lastPos = last.pos.clone()
    let lastLook = last.look.clone()
    for (let p = 0.0005; p <= 1; p += 0.0005) {
      last = sampleCamera(p)
      expect(last.pos.distanceTo(lastPos)).toBeLessThan(2.5)
      expect(last.look.distanceTo(lastLook)).toBeLessThan(4)
      lastPos = last.pos.clone()
      lastLook = last.look.clone()
    }
  })

  it('never lets the look target collapse onto the camera (no flips through the turn)', () => {
    for (let p = 0; p <= 1; p += 0.001) {
      const s = sampleCamera(p)
      expect(s.look.distanceTo(s.pos)).toBeGreaterThan(8)
    }
  })

  it('is pure, so reversing scroll replays the same frames', () => {
    const a = sampleCamera(0.4321).pos.clone()
    sampleCamera(0.9)
    expect(sampleCamera(0.4321).pos.equals(a)).toBe(true)
  })

  it('keeps the camera above ground while flying over the continent', () => {
    for (let p = 0.13; p <= 0.42; p += 0.002) {
      const { pos } = sampleCamera(p)
      if (pos.z > WORLD.faceZ) continue
      expect(pos.y).toBeGreaterThan(surfaceHeight(Math.round(pos.x), Math.round(pos.z)) + 6)
    }
  })

  it('stays in front of the cut face while descending it', () => {
    for (let p = 0.46; p <= 0.84; p += 0.002) {
      const { pos } = sampleCamera(p)
      const y = Math.round(pos.y)
      const x = Math.round(pos.x)
      // The face is recessed by caves; the camera may enter a recess but never the rock behind it.
      const front = WORLD.faceZ - Math.max(0, faceDepth(x, y, surfaceHeight(x, WORLD.faceZ)))
      expect(pos.z).toBeGreaterThan(front + 1.5)
    }
  })
})

describe('atmosphere', () => {
  it('changes gradually', () => {
    let prev = sampleAtmos(0).nums.sunI
    for (let p = 0.001; p <= 1; p += 0.001) {
      const v = sampleAtmos(p).nums.sunI
      expect(Math.abs(v - prev)).toBeLessThan(0.2)
      prev = v
    }
    expect(ATMOS_KEYS[ATMOS_KEYS.length - 1].p).toBe(1)
  })
})

describe('story beats', () => {
  it('the island blooms only at the end and fully', () => {
    expect(vitalityAt(0.5)).toBe(0)
    expect(vitalityAt(1)).toBe(5)
  })

  it('the parcel unfolds and refolds into a planter, reversibly', () => {
    expect(cavePose(0.5)).toMatchObject({ sides: 1, lid: 1, soil: 0 })
    expect(cavePose(0.64).sides).toBeCloseTo(0)
    const end = cavePose(0.7)
    expect(end.sides).toBe(1)
    expect(end.lid).toBeCloseTo(-2)
    expect(end.soil).toBe(1)
    expect(cavePose(0.6321)).toEqual(cavePose(0.6321))
  })
})

describe('world generation', () => {
  it('is deterministic', () => {
    expect(surfaceHeight(12, -80)).toBe(surfaceHeight(12, -80))
    const a = buildWorld('high')
    expect(a.surface.length + a.face.length).toBeGreaterThan(10000)
  })

  it('stays inside its instance budget', () => {
    const high = buildWorld('high')
    const low = buildWorld('low')
    const count = (w: typeof high) =>
      [w.surface, w.face, w.underside, w.props, w.roots, w.glow, w.crystals, w.lava, w.water, w.pool, w.clouds, ...w.islands.map((i) => i.boxes)].reduce((n, l) => n + l.length, 0)
    expect(count(high)).toBeLessThan(60000)
    expect(count(low)).toBeLessThan(count(high))
  })

  it('has a lava pool and cave crystals on the cut face', () => {
    const w = buildWorld('high')
    expect(w.lava.length).toBeGreaterThan(20)
    expect(w.crystals.length).toBeGreaterThan(20)
  })
})

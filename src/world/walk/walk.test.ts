import { describe, expect, it } from 'vitest'
import { buildProps } from '../propData'
import { ISLAND_RADIUS, LANDMARKS, PADS, terrain, zoneViewpoint } from '../terrainData'
import { HeldKeys, isTypingTarget, shouldIgnoreKey } from './input'
import {
  advance,
  blocked,
  buildWalkWorld,
  createPlayer,
  FIXED_DT,
  floorAt,
  look,
  MAX_FRAME,
  PITCH_LIMIT,
  PLAYER_RADIUS,
  SPEEDS,
  STEP_UP,
  type Player,
} from './walkGrid'

const props = buildProps()
const world = buildWalkWorld(terrain().cells, props.colliders)
const FORWARD = { forward: 1, strafe: 0, turn: 0 }
const k = (x: number, z: number) => `${x},${z}`

function walkFor(p: Player, seconds: number, input = FORWARD, fps = 60, speed = SPEEDS.normal) {
  const frames = Math.round(seconds * fps)
  for (let i = 0; i < frames; i++) advance(world, p, input, speed, 1 / fps)
}

function overlapsCollider(p: Player) {
  return props.colliders.some((c) => {
    const cx = Math.max(c.x0, Math.min(p.x, c.x1))
    const cz = Math.max(c.z0, Math.min(p.z, c.z1))
    return (cx - p.x) ** 2 + (cz - p.z) ** 2 < PLAYER_RADIUS ** 2 - 1e-6
  })
}

describe('the island', () => {
  it('is bounded', () => {
    for (const c of terrain().cells) expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(ISLAND_RADIUS + 3)
  })

  it('never needs a jump: neighbouring walkable cells differ by at most one block', () => {
    for (const c of terrain().cells) {
      const f = floorAt(world, c.x, c.z)
      if (f === undefined) continue
      for (const [dx, dz] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ]) {
        const g = floorAt(world, c.x + dx, c.z + dz)
        if (g !== undefined) expect(Math.abs(f - g)).toBeLessThanOrEqual(STEP_UP)
      }
    }
  })

  it('has no traps: every walkable cell is reachable from the plaza, including every zone and landmark', () => {
    const start = zoneViewpoint('homestead')
    const seen = new Set([k(start.x, start.z)])
    const queue = [[start.x, start.z]]
    while (queue.length) {
      const [x, z] = queue.pop()!
      const f = floorAt(world, x, z)!
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx
        const nz = z + dz
        const g = floorAt(world, nx, nz)
        if (g === undefined || Math.abs(g - f) > STEP_UP || seen.has(k(nx, nz))) continue
        seen.add(k(nx, nz))
        queue.push([nx, nz])
      }
    }
    const walkable = [...world.floor.keys()].length
    // A few single cells boxed in by rock spires or water are fine; nothing bigger may be cut off.
    expect(seen.size).toBeGreaterThan(walkable * 0.97)
    for (const zone of ['frostlands', 'coldgrove', 'plains', 'workshop', 'homestead'] as const) {
      const v = zoneViewpoint(zone)
      expect(seen.has(k(v.x, v.z)), zone).toBe(true)
    }
    for (const [name, l] of Object.entries(LANDMARKS)) {
      const near = [...seen].some((s) => {
        const [x, z] = s.split(',').map(Number)
        return Math.hypot(x - l.x, z - l.z) <= 2
      })
      expect(near, name).toBe(true)
    }
    for (const p of Object.values(PADS)) expect(seen.has(k(Math.round((p.x0 + p.x1) / 2), p.z1))).toBe(true)
  })

  it('every zone viewpoint is a free spot facing its pad', () => {
    for (const zone of ['frostlands', 'coldgrove', 'plains', 'workshop', 'homestead'] as const) {
      const v = zoneViewpoint(zone)
      const f = floorAt(world, v.x, v.z)
      expect(f, zone).toBeDefined()
      expect(blocked(world, v.x, v.z, f!), zone).toBe(false)
    }
  })
})

describe('walking', () => {
  it('cannot pass through the freezer vault', () => {
    const p = PADS.frostlands
    const cx = (p.x0 + p.x1) / 2
    // Stand on the pad, face north (toward the vault behind it) and keep walking.
    const player = createPlayer(world, cx, p.z0 + 0.6, 0)
    walkFor(player, 6)
    expect(overlapsCollider(player)).toBe(false)
    expect(player.z).toBeGreaterThan(p.z0 - 2.2) // still south of the vault's centre
  })

  it('cannot walk through a tree trunk', () => {
    const trunkBox = props.colliders.find((c) => c.x1 - c.x0 < 0.7 && c.x1 - c.x0 > 0.5)!
    const tx = (trunkBox.x0 + trunkBox.x1) / 2
    const tz = (trunkBox.z0 + trunkBox.z1) / 2
    const player = createPlayer(world, tx, tz + 2.5, 0)
    expect(Math.abs(player.x - tx)).toBeLessThan(0.2) // really lined up behind the trunk
    for (let i = 0; i < 600; i++) {
      advance(world, player, FORWARD, SPEEDS.brisk, 1 / 60)
      expect(overlapsCollider(player)).toBe(false)
    }
  })

  it('stays on the island and on the ground when walking at the edge for a long time', () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -3 * Math.PI / 4]) {
      const player = createPlayer(world, 0, 5, yaw)
      for (let i = 0; i < 20 * 60; i++) {
        advance(world, player, FORWARD, SPEEDS.brisk, 1 / 60)
        const f = floorAt(world, player.x, player.z)
        expect(f, `yaw ${yaw} step ${i}`).toBeDefined()
        expect(player.y).toBeGreaterThanOrEqual(1.99)
      }
      expect(Math.hypot(player.x, player.z)).toBeLessThan(ISLAND_RADIUS + 1)
      // Eventually settles exactly on the floor.
      walkFor(player, 1, { forward: 0, strafe: 0, turn: 0 })
      expect(player.y).toBeCloseTo(floorAt(world, player.x, player.z)!, 2)
    }
  })

  it('walks the same distance at 30 fps and 144 fps', () => {
    const a = createPlayer(world, 0, 5, 0)
    const b = createPlayer(world, 0, 5, 0)
    walkFor(a, 1, FORWARD, 30)
    walkFor(b, 1, FORWARD, 144)
    const da = Math.hypot(a.x, a.z - 5)
    const db = Math.hypot(b.x, b.z - 5)
    expect(da).toBeGreaterThan(2)
    expect(Math.abs(da - db) / da).toBeLessThan(0.02)
  })

  it('a long frame (tab switch, debugger) moves at most one clamped frame', () => {
    const p = createPlayer(world, 0, 5, 0)
    walkFor(p, 1)
    const z0 = p.z
    advance(world, p, FORWARD, SPEEDS.normal, 2)
    expect(Math.abs(p.z - z0)).toBeLessThanOrEqual(SPEEDS.normal * (MAX_FRAME + FIXED_DT) + 1e-6)
  })

  it('eases in and out instead of lurching', () => {
    const p = createPlayer(world, 0, 5, 0)
    advance(world, p, FORWARD, SPEEDS.normal, 1 / 60)
    expect(Math.hypot(p.vx, p.vz)).toBeLessThan(SPEEDS.normal * 0.4)
    walkFor(p, 1)
    walkFor(p, 0.6, { forward: 0, strafe: 0, turn: 0 })
    expect(Math.hypot(p.vx, p.vz)).toBe(0)
  })

  it('strafes and turns', () => {
    const p = createPlayer(world, 0, 5, 0)
    walkFor(p, 0.5, { forward: 0, strafe: 1, turn: 0 })
    expect(p.x).toBeGreaterThan(0.5)
    const yaw = p.yaw
    walkFor(p, 0.5, { forward: 0, strafe: 0, turn: 1 })
    expect(p.yaw).toBeLessThan(yaw - 0.5) // turning right lowers yaw
  })

  it('keeps vertical look bounded', () => {
    const v = { yaw: 0, pitch: 0 }
    look(v, 0, 50)
    expect(v.pitch).toBe(PITCH_LIMIT)
    look(v, 0, -100)
    expect(v.pitch).toBe(-PITCH_LIMIT)
  })
})

describe('walk keys', () => {
  it('are ignored while typing, in panels and with shortcuts', () => {
    const el = (tagName: string, inDialog = false) => ({ tagName, closest: () => (inDialog ? {} : null) })
    expect(isTypingTarget(el('INPUT'))).toBe(true)
    expect(isTypingTarget(el('TEXTAREA'))).toBe(true)
    expect(isTypingTarget(el('SELECT'))).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true, closest: () => null })).toBe(true)
    expect(isTypingTarget(el('BUTTON', true))).toBe(true)
    expect(isTypingTarget(el('BUTTON'))).toBe(false)
    expect(isTypingTarget(el('BODY'))).toBe(false)
    expect(shouldIgnoreKey({ code: 'KeyW', target: el('BODY') })).toBe(false)
    expect(shouldIgnoreKey({ code: 'KeyW', target: el('INPUT') })).toBe(true)
    expect(shouldIgnoreKey({ code: 'KeyW', ctrlKey: true, target: el('BODY') })).toBe(true)
    expect(shouldIgnoreKey({ code: 'KeyD', metaKey: true, target: el('BODY') })).toBe(true)
  })

  it('combine and release cleanly, and clear on blur', () => {
    const h = new HeldKeys()
    h.down('KeyW')
    h.down('ArrowUp')
    h.up('KeyW')
    expect(h.axes().forward).toBe(1) // ↑ still held
    h.down('KeyA')
    expect(h.axes()).toEqual({ forward: 1, strafe: -1, turn: 0 })
    h.clear()
    expect(h.any).toBe(false)
    expect(h.axes()).toEqual({ forward: 0, strafe: 0, turn: 0 })
    expect(h.down('KeyQ')).toBe(false)
  })
})

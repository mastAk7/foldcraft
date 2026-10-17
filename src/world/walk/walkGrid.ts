import type { Collider } from '../propData'
import type { Cell } from '../terrainData'
import type { MoveAxes } from './input'

/**
 * Walking on the island without a physics engine: the player is a circle on a height grid.
 *
 * - Terrain cells are 1×1 columns. A cell can be walked on unless it is water, solid rock, or
 *   at the island's edge (so nobody can step off).
 * - Steps of up to one block are climbed automatically (no jumping); anything taller is a wall.
 *   The terrain generator guarantees neighbouring walkable cells differ by at most one block,
 *   so every walkable place can be left the same way it was reached.
 * - Buildings, trunks and posts are axis-aligned footprints the circle can't overlap.
 * - The simulation runs at a fixed 120 Hz, so speed doesn't depend on the frame rate.
 */

export const PLAYER_RADIUS = 0.35
export const STEP_UP = 1.05
export const EYE_HEIGHT = 1.6
export const FIXED_DT = 1 / 120
/** A frame longer than this (a background tab, a debugger pause) is treated as this long. */
export const MAX_FRAME = 0.1
export const PITCH_LIMIT = (65 * Math.PI) / 180
export const TURN_RATE = (100 * Math.PI) / 180
export const ACCEL = 10
export const DECEL = 14

export const SPEEDS = { slow: 2.4, normal: 3.6, brisk: 5 } as const
export type SpeedName = keyof typeof SPEEDS

const key = (x: number, z: number) => x * 4096 + z

export interface WalkWorld {
  /** Floor height of each walkable cell, keyed by integer cell. Missing = can't stand there. */
  floor: Map<number, number>
  colliders: Collider[]
  /** Colliders bucketed by integer cell for quick lookup. */
  buckets: Map<number, number[]>
}

const N8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

export function buildWalkWorld(cells: Cell[], colliders: Collider[]): WalkWorld {
  const exists = new Set(cells.map((c) => key(c.x, c.z)))
  const floor = new Map<number, number>()
  for (const c of cells) {
    if (c.water || c.solid) continue
    // Keep a one-block margin from the island edge.
    if (!N8.every(([dx, dz]) => exists.has(key(c.x + dx, c.z + dz)))) continue
    floor.set(key(c.x, c.z), c.h)
  }
  const buckets = new Map<number, number[]>()
  colliders.forEach((c, i) => {
    for (let x = Math.floor(c.x0) - 1; x <= Math.ceil(c.x1) + 1; x++)
      for (let z = Math.floor(c.z0) - 1; z <= Math.ceil(c.z1) + 1; z++) {
        const k = key(x, z)
        let list = buckets.get(k)
        if (!list) buckets.set(k, (list = []))
        list.push(i)
      }
  })
  return { floor, colliders, buckets }
}

export function floorAt(w: WalkWorld, x: number, z: number): number | undefined {
  return w.floor.get(key(Math.round(x), Math.round(z)))
}

/** Whether a circle at (x, z), standing at height `h`, overlaps something it can't stand in. */
export function blocked(w: WalkWorld, x: number, z: number, h: number, r = PLAYER_RADIUS): boolean {
  const ix0 = Math.round(x - r)
  const ix1 = Math.round(x + r)
  const iz0 = Math.round(z - r)
  const iz1 = Math.round(z + r)
  for (let ix = ix0; ix <= ix1; ix++)
    for (let iz = iz0; iz <= iz1; iz++) {
      // Closest point of this cell's square to the circle centre.
      const cx = Math.max(ix - 0.5, Math.min(x, ix + 0.5))
      const cz = Math.max(iz - 0.5, Math.min(z, iz + 0.5))
      if ((cx - x) ** 2 + (cz - z) ** 2 >= r * r) continue
      const f = w.floor.get(key(ix, iz))
      if (f === undefined || Math.abs(f - h) > STEP_UP) return true
    }
  const near = w.buckets.get(key(Math.round(x), Math.round(z)))
  if (near)
    for (const i of near) {
      const c = w.colliders[i]
      const cx = Math.max(c.x0, Math.min(x, c.x1))
      const cz = Math.max(c.z0, Math.min(z, c.z1))
      if ((cx - x) ** 2 + (cz - z) ** 2 < r * r) return true
    }
  return false
}

/** Highest floor under the player's feet, so a step is climbed as soon as a foot is on it. */
function footFloor(w: WalkWorld, x: number, z: number, fallback: number) {
  let best = -Infinity
  const r = PLAYER_RADIUS * 0.8
  for (const [dx, dz] of [
    [0, 0],
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ]) {
    const f = floorAt(w, x + dx, z + dz)
    if (f !== undefined) best = Math.max(best, f)
  }
  return best === -Infinity ? fallback : best
}

export interface Player {
  x: number
  z: number
  /** Floor height under the player, eased so steps feel like short ramps. */
  y: number
  vx: number
  vz: number
  /** Yaw 0 looks toward -z; positive turns left (three.js convention). */
  yaw: number
  pitch: number
  /** Unspent simulation time carried to the next frame. */
  acc: number
  /** Position before the last fixed step, for smooth rendering between steps. */
  px: number
  pz: number
  py: number
}

export function createPlayer(w: WalkWorld, x: number, z: number, yaw: number): Player {
  const spot = nearestWalkable(w, x, z)
  const y = floorAt(w, spot.x, spot.z) ?? 2
  return { x: spot.x, z: spot.z, y, vx: 0, vz: 0, yaw, pitch: 0, acc: 0, px: spot.x, pz: spot.z, py: y }
}

/** The closest place a player fits, searching outward from (x, z). */
export function nearestWalkable(w: WalkWorld, x: number, z: number): { x: number; z: number } {
  for (let r = 0; r <= 12; r++)
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        const px = r === 0 ? x : Math.round(x) + dx
        const pz = r === 0 ? z : Math.round(z) + dz
        const f = floorAt(w, px, pz)
        if (f !== undefined && !blocked(w, px, pz, f)) return { x: px, z: pz }
      }
  return { x: 0, z: 5 }
}

/** One fixed simulation step. */
export function step(w: WalkWorld, p: Player, input: MoveAxes, speed: number, dt = FIXED_DT) {
  p.px = p.x
  p.pz = p.z
  p.py = p.y
  p.yaw -= input.turn * TURN_RATE * dt

  // Wished velocity in world space; diagonals aren't faster.
  const fx = -Math.sin(p.yaw)
  const fz = -Math.cos(p.yaw)
  const rx = Math.cos(p.yaw)
  const rz = -Math.sin(p.yaw)
  let wx = fx * input.forward + rx * input.strafe
  let wz = fz * input.forward + rz * input.strafe
  const len = Math.hypot(wx, wz)
  if (len > 1) {
    wx /= len
    wz /= len
  }
  wx *= speed
  wz *= speed
  // Ease toward it: gentle starts and stops, no lurch.
  const k = 1 - Math.exp(-(len > 0 ? ACCEL : DECEL) * dt)
  p.vx += (wx - p.vx) * k
  p.vz += (wz - p.vz) * k
  if (len === 0 && Math.hypot(p.vx, p.vz) < 0.02) p.vx = p.vz = 0

  // Move one axis at a time so walls are slid along rather than stuck to.
  const nx = p.x + p.vx * dt
  if (!blocked(w, nx, p.z, p.y)) p.x = nx
  else p.vx = 0
  const nz = p.z + p.vz * dt
  if (!blocked(w, p.x, nz, p.y)) p.z = nz
  else p.vz = 0

  const target = footFloor(w, p.x, p.z, p.y)
  p.y += (target - p.y) * (1 - Math.exp(-14 * dt))
  if (Math.abs(target - p.y) < 0.002) p.y = target
}

/**
 * Advance by one rendered frame: clamp long frames, then run as many fixed steps as fit.
 * Returns the blend factor (0..1) between the previous and current step for rendering.
 */
export function advance(w: WalkWorld, p: Player, input: MoveAxes, speed: number, frameDt: number): number {
  p.acc += Math.min(Math.max(frameDt, 0), MAX_FRAME)
  while (p.acc >= FIXED_DT) {
    step(w, p, input, speed)
    p.acc -= FIXED_DT
  }
  return p.acc / FIXED_DT
}

/** Apply a look change (radians), keeping the view between looking at your feet and the sky. */
export function look(p: { yaw: number; pitch: number }, dYaw: number, dPitch: number) {
  p.yaw += dYaw
  p.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p.pitch + dPitch))
}

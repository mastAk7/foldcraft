import type { ZoneId } from '../domain/types'
import { fbm, hash2, valueNoise } from './noise'

export type Block =
  | 'snow'
  | 'icetile'
  | 'ice'
  | 'frostgrass'
  | 'moss'
  | 'grass'
  | 'deck'
  | 'meadow'
  | 'workfloor'
  | 'plaza'
  | 'path'
  | 'streambed'
  | 'stone'
  | 'forestfloor'
  | 'field'
  | 'marsh'
  | 'bridge'

/**
 * The five storage zones sit in the middle of the island. Around them is an outer ring of
 * landscapes that each relate to the product journey: the highland the cold comes from, the
 * sheltering forest, the orchard and fields pantry food comes from, the river and wetland the
 * workshop drains into, and the meadow you arrive across.
 */
export type Biome = 'highland' | 'forest' | 'orchard' | 'wetland' | 'meadow'
export type Region = ZoneId | 'path' | Biome

export interface Cell {
  x: number
  z: number
  /** Top surface height. */
  h: number
  /** Underside of the floating island. */
  bottom: number
  region: Region
  top: Block
  water?: 'pond' | 'stream' | 'river' | 'marsh'
  pad?: boolean
  /** Rock that can't be walked on (spires on the highland). */
  solid?: boolean
}

export interface Pad {
  x0: number
  x1: number
  z0: number
  z1: number
  h: number
}

/** Flat display pads where product objects stand. */
export const PADS: Record<Exclude<ZoneId, 'homestead'>, Pad> = {
  frostlands: { x0: -18, x1: -10, z0: -15, z1: -10, h: 3 },
  coldgrove: { x0: 10, x1: 18, z0: -15, z1: -10, h: 2 },
  plains: { x0: -18, x1: -10, z0: 10, z1: 15, h: 2 },
  workshop: { x0: 10, x1: 18, z0: 10, z1: 14, h: 2 },
}

export const PLAZA_RADIUS = 5.6
export const ISLAND_RADIUS = 36
/** The storage zones end here (plus a little noise); the outer landscapes begin. */
export const CORE_RADIUS = 24.5
/** A ring path joins the outer landscapes. */
export const RING_RADIUS = 27

export const ZONE_CENTER: Record<ZoneId, [number, number]> = {
  frostlands: [-14, -13],
  coldgrove: [14, -13],
  plains: [-14, 13],
  workshop: [14, 13],
  homestead: [0, 0],
}

/** Named places in the outer ring, used for paths, signposts and the walk-mode compass. */
export const LANDMARKS = {
  lookout: { x: -23, z: -21, name: 'Lookout', blurb: 'Highland lookout over the whole world' },
  forest: { x: 15, z: -27, name: 'Forest clearing', blurb: 'Sheltering birch forest' },
  orchard: { x: -21, z: 23, name: 'Orchard', blurb: 'Orchard and fields, where pantry food grows' },
  wetland: { x: 24, z: 24, name: 'Wetland', blurb: 'Reed beds the workshop stream drains into' },
} as const
export type LandmarkId = keyof typeof LANDMARKS

export const POND = { cx: 24, cz: -17, rx: 3, rz: 2.4, level: 1.72 }
export const STREAM_LEVEL = 1.72
export const LOOKOUT_TOP = 7

export function inPad(x: number, z: number, p: Pad) {
  return x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1
}

/** The workshop stream, which refills as the world recovers. */
export function isStream(x: number, z: number) {
  if (x < 8 || z < 8) return false
  const s = x + z + (valueNoise(x * 0.35, z * 0.35, 77) - 0.5) * 2.4
  return s >= 32.6 && s <= 34.6
}

/** Centre line of the east river, which runs from the forest spring down to the wetland. */
export function riverX(z: number) {
  return 26 + Math.sin(z * 0.16) * 1.6
}

function isRiver(x: number, z: number) {
  return z >= -29 && z <= 16 && Math.abs(x - riverX(z)) <= 1.05
}

function isMarsh(x: number, z: number) {
  const d = Math.hypot(x - LANDMARKS.wetland.x, z - LANDMARKS.wetland.z)
  return d < 8 && valueNoise(x * 0.32, z * 0.32, 41) > 0.56
}

/** Radial path spurs from the ring out to each landmark: [angle, from radius, to radius]. */
const SPURS: [number, number, number][] = Object.values(LANDMARKS).map((l) => [Math.atan2(l.z, l.x), RING_RADIUS, Math.hypot(l.x, l.z)])

function isPath(x: number, z: number, dist: number) {
  // The cross through the plaza, out to the ring.
  if ((Math.abs(x) <= 1 || Math.abs(z) <= 1) && dist <= RING_RADIUS + 1) return true
  if (Math.abs(dist - RING_RADIUS) <= 0.95) return true
  const a = Math.atan2(z, x)
  for (const [sa, r0, r1] of SPURS) {
    if (dist < r0 || dist > r1 + 0.5) continue
    // perpendicular distance from the spur's ray
    const perp = Math.abs(Math.sin(a - sa)) * dist
    if (perp <= 0.95 && Math.cos(a - sa) > 0) return true
  }
  return false
}

function biomeOf(x: number, z: number): Biome {
  if (z > 0 && Math.abs(x) < 9) return 'meadow'
  if (x < 0 && z <= 0) return 'highland'
  if (x >= 0 && z <= 0) return 'forest'
  if (x < 0) return 'orchard'
  return 'wetland'
}

function regionOf(x: number, z: number, dist: number): Region {
  if (dist <= PLAZA_RADIUS) return 'homestead'
  if (isPath(x, z, dist)) return 'path'
  const core = CORE_RADIUS + (fbm(x * 0.13, z * 0.13, 33) - 0.5) * 4
  if (dist > core) return biomeOf(x, z)
  if (x < 0 && z < 0) return 'frostlands'
  if (x > 0 && z < 0) return 'coldgrove'
  if (x < 0 && z > 0) return 'plains'
  return 'workshop'
}

/** The highland is a terraced hill rising to the lookout: one block every 2.4 cells, so it's walkable. */
function hillAt(x: number, z: number) {
  const d = Math.hypot(x - LANDMARKS.lookout.x, z - LANDMARKS.lookout.z)
  if (d < 2.3) return LOOKOUT_TOP
  return Math.max(2, LOOKOUT_TOP - 1 - Math.floor((d - 2.3) / 2.4))
}

interface Raw extends Cell {
  fixed?: boolean
}

function buildCell(x: number, z: number): Raw | null {
  const dist = Math.hypot(x, z)
  const edge = ISLAND_RADIUS - 2.5 + fbm(x * 0.11, z * 0.11, 9) * 5
  if (dist > edge) return null

  const region = regionOf(x, z, dist)
  const n = fbm(x * 0.18, z * 0.18, 21)
  const bottom = Math.round(-2 - Math.pow(Math.max(0, 1 - dist / (ISLAND_RADIUS + 1)), 1.25) * 15 - fbm(x * 0.3, z * 0.3, 5) * 3)

  let h = 2
  let top: Block = 'grass'
  let water: Cell['water']
  let pad = false
  let solid = false
  let fixed = false
  const hill = x < 0 && z < 0 ? hillAt(x, z) : 2

  switch (region) {
    case 'homestead':
      top = 'plaza'
      fixed = true
      break
    case 'path':
      // Paths follow the terrain (terraced up the highland) and become bridges over water.
      h = Math.max(2, hill)
      top = isRiver(x, z) || isMarsh(x, z) || isStream(x, z) ? 'bridge' : 'path'
      if (top === 'bridge') {
        h = 2
        fixed = true
      }
      break
    case 'frostlands': {
      h = Math.max(3 + Math.round(n * 1.6), hill)
      top = hash2(x, z, 3) < 0.07 ? 'ice' : 'snow'
      if (inPad(x, z, PADS.frostlands)) {
        h = PADS.frostlands.h
        top = 'icetile'
        pad = true
      }
      break
    }
    case 'coldgrove': {
      h = 2 + Math.round(n * 1.4)
      top = 'frostgrass'
      if (inPad(x, z, PADS.coldgrove)) {
        h = PADS.coldgrove.h
        top = 'moss'
        pad = true
      }
      break
    }
    case 'plains': {
      h = 2 + (n > 0.68 ? 1 : 0)
      top = 'grass'
      if (inPad(x, z, PADS.plains)) {
        h = PADS.plains.h
        top = 'deck'
        pad = true
      }
      break
    }
    case 'workshop': {
      top = 'meadow'
      if (isStream(x, z)) {
        h = 1
        top = 'streambed'
        water = 'stream'
      } else if (inPad(x, z, PADS.workshop)) {
        h = PADS.workshop.h
        top = 'workfloor'
        pad = true
      }
      break
    }
    case 'highland': {
      h = Math.max(2 + Math.round(n * 1.2), hill)
      top = h >= 5 ? 'snow' : h >= 4 ? (hash2(x, z, 4) < 0.3 ? 'stone' : 'snow') : hash2(x, z, 4) < 0.25 ? 'stone' : 'frostgrass'
      // A few rock spires give the highland a silhouette; they're obstacles, not climbs.
      const dLook = Math.hypot(x - LANDMARKS.lookout.x, z - LANDMARKS.lookout.z)
      if (dLook > 4 && hash2(x, z, 61) < 0.02) {
        solid = true
        h += 3 + Math.floor(hash2(x, z, 62) * 3)
        top = 'stone'
      }
      break
    }
    case 'forest':
      h = 2 + (n > 0.62 ? 1 : 0)
      top = 'forestfloor'
      break
    case 'orchard': {
      h = 2
      // Tilled strips between the orchard rows.
      const inFields = x < -10 && z > 18
      top = inFields && Math.floor((x + 100) / 2) % 3 === 0 ? 'field' : 'grass'
      break
    }
    case 'meadow':
      h = 2 + Math.round(Math.max(0, fbm(x * 0.12, z * 0.12, 15) - 0.4) * 5)
      top = 'grass'
      break
    case 'wetland':
      h = 2
      top = 'moss'
      if (isStream(x, z)) {
        h = 1
        top = 'streambed'
        water = 'stream'
      } else if (isMarsh(x, z)) {
        h = 1
        top = 'marsh'
        water = 'marsh'
      }
      break
  }

  if (!water && region !== 'path' && region !== 'homestead') {
    const pd = ((x - POND.cx) / POND.rx) ** 2 + ((z - POND.cz) / POND.rz) ** 2
    if (pd <= 1 || isRiver(x, z)) {
      h = 1
      top = 'streambed'
      water = pd <= 1 ? 'pond' : 'river'
      solid = false
      pad = false
    }
  }

  return { x, z, h, bottom: Math.min(bottom, h - 3), region, top, water, pad, solid, fixed: fixed || pad || !!water }
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

/**
 * Lower any walkable cell that stands more than one block above a walkable neighbour, so every
 * slope can be walked up and down without jumping (and nothing becomes a trap).
 */
function relax(map: Map<string, Raw>) {
  const walk = (c: Raw | undefined) => !!c && !c.water && !c.solid
  for (let pass = 0; pass < 12; pass++) {
    let changed = false
    for (const c of map.values()) {
      if (c.fixed || !walk(c)) continue
      let min = Infinity
      for (const [dx, dz] of N8) {
        const nb = map.get(`${c.x + dx},${c.z + dz}`)
        if (walk(nb)) min = Math.min(min, nb!.h)
      }
      if (min !== Infinity && c.h > min + 1) {
        c.h = min + 1
        c.bottom = Math.min(c.bottom, c.h - 3)
        changed = true
      }
    }
    if (!changed) break
  }
}

let cache: { cells: Cell[]; map: Map<string, Cell> } | null = null

export function terrain() {
  if (cache) return cache
  const map = new Map<string, Raw>()
  const R = ISLAND_RADIUS + 3
  for (let x = -R; x <= R; x++) {
    for (let z = -R; z <= R; z++) {
      const c = buildCell(x, z)
      if (c) map.set(`${x},${z}`, c)
    }
  }
  relax(map)
  const cells: Cell[] = []
  for (const c of map.values()) {
    delete c.fixed
    cells.push(c)
  }
  cache = { cells, map }
  return cache
}

/** Surface height at a world position (cells are centred on integer coordinates). */
export function heightAt(x: number, z: number): number {
  return terrain().map.get(`${Math.round(x)},${Math.round(z)}`)?.h ?? 2
}

export function cellAt(x: number, z: number): Cell | undefined {
  return terrain().map.get(`${Math.round(x)},${Math.round(z)}`)
}

/** Whether a prop can stand here (not on a pad, path, plaza or water, and away from slots). */
export function isFree(x: number, z: number): boolean {
  const c = cellAt(x, z)
  if (!c || c.pad || c.water || c.solid || c.region === 'path' || c.region === 'homestead') return false
  for (const p of Object.values(PADS)) {
    if (x >= p.x0 - 1 && x <= p.x1 + 1 && z >= p.z0 - 1 && z <= p.z1 + 1) return false
  }
  // Keep the island edge clear so props don't overhang, and keep props off steps.
  return N8.every(([dx, dz]) => {
    const nb = cellAt(x + dx, z + dz)
    return !!nb && !nb.water
  })
}

/**
 * Where to stand to look at a zone: just south of its pad, facing north, the same way the
 * overview camera sees it (each zone's building stands behind its pad). Yaw 0 looks toward -z.
 */
export function zoneViewpoint(zone: ZoneId): { x: number; z: number; yaw: number } {
  // On the south path, looking across the arrivals pad to the counter, with zones either side.
  if (zone === 'homestead') return { x: 0, z: 10, yaw: 0 }
  const p = PADS[zone]
  return { x: (p.x0 + p.x1) / 2, z: p.z1 + 4, yaw: 0 }
}

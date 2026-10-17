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

export type Region = ZoneId | 'path'

export interface Cell {
  x: number
  z: number
  /** Top surface height. */
  h: number
  /** Underside of the floating island. */
  bottom: number
  region: Region
  top: Block
  water?: 'pond' | 'stream'
  pad?: boolean
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
  frostlands: { x0: -15, x1: -7, z0: -12, z1: -7, h: 3 },
  coldgrove: { x0: 7, x1: 15, z0: -12, z1: -7, h: 2 },
  plains: { x0: -15, x1: -7, z0: 7, z1: 12, h: 2 },
  workshop: { x0: 7, x1: 15, z0: 7, z1: 11, h: 2 },
}

export const PLAZA_RADIUS = 5.6
export const ISLAND_RADIUS = 21

export const ZONE_CENTER: Record<ZoneId, [number, number]> = {
  frostlands: [-11, -10],
  coldgrove: [11, -10],
  plains: [-11, 10],
  workshop: [11, 10],
  homestead: [0, 0],
}

export const POND = { cx: 16, cz: -14.5, rx: 2.8, rz: 2.2, level: 1.72 }
export const STREAM_LEVEL = 1.72

export function inPad(x: number, z: number, p: Pad) {
  return x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1
}

export function isStream(x: number, z: number) {
  if (x < 3 || z < 3) return false
  const s = x + z + (valueNoise(x * 0.35, z * 0.35, 77) - 0.5) * 2.4
  return s >= 25 && s <= 27
}

function regionOf(x: number, z: number): Region {
  if (Math.hypot(x, z) <= PLAZA_RADIUS) return 'homestead'
  if (Math.abs(x) <= 1 || Math.abs(z) <= 1) return 'path'
  if (x < 0 && z < 0) return 'frostlands'
  if (x > 0 && z < 0) return 'coldgrove'
  if (x < 0 && z > 0) return 'plains'
  return 'workshop'
}

function buildCell(x: number, z: number): Cell | null {
  const dist = Math.hypot(x, z)
  const edge = ISLAND_RADIUS - 2.5 + fbm(x * 0.11, z * 0.11, 9) * 5
  if (dist > edge) return null

  const region = regionOf(x, z)
  const n = fbm(x * 0.18, z * 0.18, 21)
  const bottom = Math.round(-2 - Math.pow(Math.max(0, 1 - dist / (ISLAND_RADIUS + 1)), 1.25) * 13 - fbm(x * 0.3, z * 0.3, 5) * 3)

  let h = 2
  let top: Block = 'grass'
  let water: Cell['water']
  let pad = false

  switch (region) {
    case 'homestead':
      h = 2
      top = 'plaza'
      break
    case 'path':
      h = 2
      top = 'path'
      break
    case 'frostlands': {
      h = 3 + Math.round(n * 1.6)
      // Mountains rise toward the far corner, giving the island a strong silhouette.
      h += Math.max(0, Math.round((-x - z - 20) / 2.6))
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
      const pd = ((x - POND.cx) / POND.rx) ** 2 + ((z - POND.cz) / POND.rz) ** 2
      if (pd <= 1) {
        h = 1
        top = 'streambed'
        water = 'pond'
      } else if (inPad(x, z, PADS.coldgrove)) {
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
      h = 2
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
  }

  return { x, z, h, bottom: Math.min(bottom, h - 3), region, top, water, pad }
}

let cache: { cells: Cell[]; map: Map<string, Cell> } | null = null

export function terrain() {
  if (cache) return cache
  const cells: Cell[] = []
  const map = new Map<string, Cell>()
  const R = ISLAND_RADIUS + 3
  for (let x = -R; x <= R; x++) {
    for (let z = -R; z <= R; z++) {
      const c = buildCell(x, z)
      if (c) {
        cells.push(c)
        map.set(`${x},${z}`, c)
      }
    }
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
  if (!c || c.pad || c.water || c.region === 'path' || c.region === 'homestead') return false
  for (const p of Object.values(PADS)) {
    if (x >= p.x0 - 1 && x <= p.x1 + 1 && z >= p.z0 - 1 && z <= p.z1 + 1) return false
  }
  // Keep the island edge clear so props don't overhang.
  const n = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  return n.every(([dx, dz]) => !!cellAt(x + dx, z + dz))
}

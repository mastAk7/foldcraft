import type { Box, V3 } from '../../world/propData'
import { fbm, hash2, rng, valueNoise } from '../../world/noise'

/**
 * The landing "continent": a large floating landmass above the consumer island.
 * Its front edge is cut open like a slice of cake, exposing soil, stone, caves and a lava layer.
 * Everything is deterministic and returned as plain box lists so it can be instanced and unit-tested.
 *
 * Blocks are unit cubes centred on integer coordinates (matching the seams in `createVoxelMaterial`).
 */

export const WORLD = {
  x0: -60,
  x1: 60,
  zBack: -170,
  /** The cut face is the plane of cells at this z, facing +z. */
  faceZ: -6,
  plain: 110,
  underside: 46,
  cloudBase: 140,
} as const

/** Main cave on the cut face (the stream drops into it). */
export const CAVE = { cx: 14, cy: 70, rx: 15, ry: 6.5, depth: 11 }
/** Lava gallery near the bottom of the face. */
export const GALLERY = { cx: -2, cy: 52, rx: 36, ry: 4.6, depth: 9, floor: 48 }
/** Second, smaller cave. */
const CAVE2 = { cx: -24, cy: 76, rx: 9, ry: 4, depth: 7 }
/** Where the underground water leaves the continent's underside, above the island pond. */
export const SPRING = { x: 16, z: -14.5 }

export type Tier = 'high' | 'low'

export interface FloatingIsland {
  pos: V3
  /** Distant islands are built coarse and scaled up. */
  scale: number
  boxes: Box[]
}

/** Box lists grouped by where they are seen, so each group can be hidden when the camera is elsewhere. */
export interface WorldData {
  /** Surface heightfield (sky → plains stages). */
  surface: Box[]
  /** The cut face: strata, caves, gallery. */
  face: Box[]
  /** The continent's underside. */
  underside: Box[]
  props: Box[]
  /** Hanging roots and vines under the continent. */
  roots: Box[]
  /** Lit windows on the surface. */
  glow: Box[]
  /** Emissive crystals in the caves. */
  crystals: Box[]
  lava: Box[]
  /** Surface stream. */
  water: Box[]
  /** Underground pool. */
  pool: Box[]
  clouds: Box[]
  islands: FloatingIsland[]
  /** Points of interest used by the scene (parcel stands, vignette lights…). */
  spots: Spots
}

export interface Spots {
  stall: V3
  shed: V3
  cave: V3
  isle: V3
  crates: V3
  springTop: number
  cascadeX: number
}

/* ---------------------------------------------------------------- helpers */

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

const b = (p: V3, s: V3, c: string): Box => ({ p, s, c })

/** Shift a hex colour's lightness by a deterministic jitter. */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = 1 + k
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)))
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)))
  const bl = Math.min(255, Math.max(0, Math.round((n & 255) * f)))
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`
}

function ridged(x: number, z: number, seed: number) {
  let sum = 0
  let amp = 1
  let freq = 1
  let norm = 0
  for (let i = 0; i < 4; i++) {
    const v = 1 - Math.abs(2 * valueNoise(x * freq, z * freq, seed + i * 31) - 1)
    sum += v * v * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

/** The winding path that threads the mountain pass and crosses the plains. */
export function pathX(z: number) {
  return 6 * Math.sin(z * 0.045) + 3 * Math.sin(z * 0.11 + 1)
}

/** The stream runs from the village down to the cliff and pours into the main cave. */
export function streamX(z: number) {
  return CAVE.cx + 1 + 5 * Math.sin((z - WORLD.faceZ) * 0.06)
}

function halfWidth(z: number) {
  return WORLD.x1 - 5 * valueNoise(z * 0.07, 3, 12)
}

function backEdge(x: number) {
  return WORLD.zBack + 7 * valueNoise(x * 0.06, 9, 13)
}

export function inside(x: number, z: number) {
  return z <= WORLD.faceZ && z >= backEdge(x) && Math.abs(x) <= halfWidth(z)
}

/** Mountain influence: 0 over the plains, 1 among the peaks. */
const mountainMask = (z: number) => smoothstep(-48, -112, z)

export function surfaceHeight(x: number, z: number): number {
  const m = mountainMask(z)
  let h = WORLD.plain + (fbm(x * 0.05, z * 0.05, 11) - 0.5) * 4
  const massif = 0.6 + fbm(x * 0.012, z * 0.012, 35) * 0.8
  let mount = m * (6 + Math.pow(ridged(x * 0.021, z * 0.021, 31), 1.7) * 46 * massif)
  const pass = Math.exp(-(((x - pathX(z)) / 18) ** 2))
  mount *= 1 - pass * 0.88
  h += mount
  // The valley eases down towards the plains.
  h -= smoothstep(-40, -70, z) * (1 - m) * 1.5
  if (isStream(x, z)) h -= 1
  return Math.round(h)
}

export function isStream(x: number, z: number) {
  return z > -96 && Math.abs(x - streamX(z)) < 1.1
}

function isPath(x: number, z: number) {
  return z > -160 && z < -16 && Math.abs(x - pathX(z)) < 1.2
}

/* ---------------------------------------------------------------- surface */

const GRASS = '#6f9a46'
const DIRT = '#795438'
const STONE = '#777a76'
const SNOW = '#eef2f2'

function surfaceColumn(out: Box[], x: number, z: number, size: number, H: number, bottom: number) {
  const j = (hash2(x, z, 91) - 0.5) * 0.12
  const slope = Math.max(
    Math.abs(surfaceHeight(x + size, z) - H),
    Math.abs(surfaceHeight(x - size, z) - H),
    Math.abs(surfaceHeight(x, z + size) - H),
    Math.abs(surfaceHeight(x, z - size) - H),
  )
  let top = GRASS
  let body = DIRT
  if (H >= 152 + hash2(x, z, 4) * 5) {
    top = SNOW
    body = STONE
  } else if (H >= 141 + hash2(x, z, 5) * 5 || slope > 3) {
    top = hash2(x, z, 6) < 0.3 ? '#8b8d88' : STONE
    body = STONE
  } else if (isStream(x, z)) {
    top = '#6c7d6a'
  } else if (isPath(x, z)) {
    top = '#b9a27a'
  } else if (H > 126) {
    top = '#7f9b55'
    body = slope > 1 ? STONE : DIRT
  }
  const cx = x + (size - 1) / 2
  const cz = z + (size - 1) / 2
  const height = H - bottom + 1
  if (top === GRASS || top === SNOW || top === '#7f9b55') {
    const cap = 0.34
    out.push(b([cx, H + 0.5 - cap / 2, cz], [size, cap, size], shade(top, j)))
    if (height - cap > 0.01) out.push(b([cx, (H + 0.5 - cap + bottom - 0.5) / 2, cz], [size, height - cap, size], shade(body, j * 0.6)))
  } else {
    out.push(b([cx, (H + 0.5 + bottom - 0.5) / 2, cz], [size, height, size], shade(top, j)))
  }
}

function buildSurface(tier: Tier): Box[] {
  const out: Box[] = []
  const corridor = tier === 'high' ? 26 : 18
  const { x0, x1, zBack, faceZ, underside } = WORLD
  for (let z = zBack - 8; z < faceZ; z++) {
    for (let x = x0 - 6; x <= x1 + 6; x++) {
      const macro = Math.abs(x) > corridor || z < -150 ? 2 : 1
      // Only emit a macro column from its lower corner.
      if (macro === 2 && ((x & 1) !== 0 || (z & 1) !== 0)) continue
      if (!inside(x, z)) continue
      if (macro === 2 && z + 1 >= faceZ) continue
      const H = surfaceHeight(x, z)
      // Extend down to the lowest neighbour so slopes never show gaps; edges become full cliffs.
      let low = H
      let edge = false
      for (const [dx, dz] of [
        [macro, 0],
        [-1, 0],
        [0, macro],
        [0, -1],
      ]) {
        const nx = x + dx
        const nz = z + dz
        if (!inside(nx, nz)) {
          edge = true
          continue
        }
        if (nz === faceZ) continue
        low = Math.min(low, surfaceHeight(nx, nz))
      }
      const bottom = edge ? underside : Math.min(H, low)
      surfaceColumn(out, x, z, macro, H, bottom)
    }
  }
  return out
}

/* ---------------------------------------------------------------- cut face */

function ellipse(x: number, y: number, c: { cx: number; cy: number; rx: number; ry: number }) {
  return 1 - ((x - c.cx) / c.rx) ** 2 - ((y - c.cy) / c.ry) ** 2
}

/** How far a face cell is recessed (positive) or protrudes (negative). */
export function faceDepth(x: number, y: number, top: number): number {
  const wobble = (valueNoise(x * 0.3, y * 0.3, 41) - 0.5) * 0.7
  let d = 0
  for (const c of [CAVE, CAVE2, GALLERY]) {
    const e = ellipse(x, y, c) + wobble
    if (e > 0) d = Math.max(d, Math.max(2, Math.round(c.depth * Math.min(1, e * 2.4))))
  }
  if (d > 0) return d
  if (y >= top - 1) return 0
  const h = hash2(x, y, 77)
  if (h < 0.1) return 1
  if (h > 0.965 && y < top - 4) return -1
  return 0
}

/** Stratum colour for a face cell. Band boundaries wander per column so no layer is a flat rectangle. */
export function stratum(x: number, y: number, top: number, recessed: boolean): string {
  const w = (valueNoise(x * 0.12, 1, 51) - 0.5) * 4
  const w2 = (valueNoise(x * 0.09, 2, 52) - 0.5) * 5
  const h = hash2(x, y, 61)
  const j = (hash2(y, x, 62) - 0.5) * 0.16
  const dTop = top - y
  if (dTop === 0) return shade(GRASS, j)
  if (dTop <= 3 + Math.round(valueNoise(x * 0.4, 3, 53) * 2)) return shade(h < 0.15 ? '#5f4330' : '#6a4a31', j)
  if (y > 96 + w) {
    if (h < 0.07) return shade('#8f8a80', j)
    if (h < 0.1) return shade('#a7774d', j)
    return shade(DIRT, j)
  }
  if (y > 93 + w) return shade('#94674a', j)
  if (y > 82 + w2) {
    if (h < 0.025) return '#4f8f7a'
    if (h < 0.045) return '#b68b6a'
    if (h < 0.065) return '#3b3b3d'
    return shade(h < 0.5 ? STONE : '#7f817c', j)
  }
  if (y > 71 + w) {
    const cobble = ['#6c6e6a', '#868883', '#5b5d5a', '#7a7c77', '#636560']
    return cobble[Math.floor(h * cobble.length)]
  }
  if (y > 58 + w2 * 0.6) {
    if (recessed) return shade(h < 0.5 ? '#4a4d54' : '#53565d', j)
    return shade(h < 0.5 ? '#5d5f66' : '#55585f', j)
  }
  if (y > 50 + w * 0.5) {
    if (h < 0.22) return shade('#2b2534', j)
    return shade(h < 0.6 ? '#45474f' : '#3d3f47', j)
  }
  return shade(h < 0.4 ? '#2b2534' : '#3a2a26', j)
}

function buildFace(tier: Tier, glow: Box[], lava: Box[]): Box[] {
  const out: Box[] = []
  const { faceZ, underside } = WORLD
  const hw = Math.floor(halfWidth(faceZ))
  const xStep = tier === 'high' ? 1 : 1
  const F = new Map<string, number>()
  const tops = new Map<number, number>()
  for (let x = -hw; x <= hw; x += xStep) tops.set(x, surfaceHeight(x, faceZ))
  const key = (x: number, y: number) => `${x},${y}`
  for (let x = -hw; x <= hw; x += xStep) {
    const top = tops.get(x)!
    for (let y = underside; y <= top; y++) F.set(key(x, y), faceZ - faceDepth(x, y, top))
  }
  for (let x = -hw; x <= hw; x += xStep) {
    const top = tops.get(x)!
    for (let y = underside; y <= top; y++) {
      const f = F.get(key(x, y))!
      // Render back from the front cell far enough to close any side exposed by a recessed neighbour.
      let back = f
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nf = F.get(key(x + dx, y + dy))
        if (nf !== undefined) back = Math.min(back, nf + 1)
      }
      back = Math.min(back, f)
      const recessed = f < faceZ
      const color = stratum(x, y, top, recessed)
      out.push(b([x, y, (f + back) / 2], [1, 1, f - back + 1], color))

      // Lava fills the floor of the gallery.
      if (recessed && y === GALLERY.floor && ellipse(x, y, GALLERY) > -0.4) {
        lava.push(b([x, y - 0.15, (f + 0.5 + faceZ + 0.2) / 2], [1, 0.5, faceZ + 0.2 - (f + 0.5)], '#ff782e'))
      }
      // Crystals stud the back walls of the caves.
      if (recessed && y > 58 && y < 82 && f <= faceZ - 4 && hash2(x, y, 88) < 0.06) {
        const tone = hash2(x, y, 89) < 0.7 ? '#6ee7d8' : '#ffd27a'
        glow.push(b([x, y, f + 0.62], [0.42, 0.42, 0.42], tone))
        if (hash2(x, y, 90) < 0.5) glow.push(b([x + 0.2, y + 0.38, f + 0.6], [0.22, 0.5, 0.22], tone))
      }
    }
  }
  // A stone ledge at the gallery's edge where single-use crates wait.
  out.push(b([GALLERY.cx + 11.5, GALLERY.floor + 0.25, faceZ - 1.5], [4.4, 1.5, 3.2], '#3d3f47'))
  // Lava seeps down the back wall of the gallery.
  for (const lx of [-22, -9, 7, 19]) {
    const f = F.get(key(lx, GALLERY.floor + 3)) ?? faceZ - 6
    lava.push(b([lx, GALLERY.floor + 2.6, f + 0.55], [0.7, 4.6, 0.25], '#ffa04a'))
  }
  return out
}

/* ---------------------------------------------------------------- underside */

export function undersideBottom(x: number, z: number) {
  const d = Math.hypot((x - 6) / 52, (z - (WORLD.faceZ - 16)) / 34)
  const t = Math.max(0, 1 - d)
  return WORLD.underside - Math.round(Math.pow(t, 0.85) * 22 + fbm(x * 0.12, z * 0.12, 71) * 6 * t)
}

function buildUnderside(props: Box[]): Box[] {
  const out: Box[] = []
  const { faceZ, underside } = WORLD
  const r = rng(404)
  for (let z = WORLD.zBack - 8; z <= faceZ; z += 2) {
    for (let x = WORLD.x0 - 6; x <= WORLD.x1 + 6; x += 2) {
      if (!inside(x, z) || !inside(x + 1, Math.min(faceZ, z + 1))) continue
      const bottom = undersideBottom(x, z)
      const sz = z + 1 > faceZ ? 1 : 2
      const cz = z + (sz - 1) / 2
      const top = underside - 0.5 + 1 // overlap the ceiling slab
      const lo = bottom - 0.5
      const j = (hash2(x, z, 92) - 0.5) * 0.14
      const deep = bottom < underside - 8
      const moss = hash2(x, z, 93) < 0.14 && !deep
      out.push(b([x + 0.5, (top + lo) / 2, cz], [2, top - lo, sz], shade(moss ? '#5f7a48' : deep ? '#666055' : '#746b5d', j)))
      // Hanging roots and vines, more of them near the front.
      if (z > faceZ - 40 && r() < 0.05) {
        const len = 2 + Math.floor(r() * 7)
        const vine = r() < 0.55
        props.push(b([x + 0.5, lo - len / 2, cz], [0.22, len, 0.22], vine ? '#4f7a3a' : '#6b4a2f'))
        if (vine) props.push(b([x + 0.5, lo - len + 0.2, cz], [0.5, 0.4, 0.5], '#5e8f45'))
      }
    }
  }
  return out
}

/* ---------------------------------------------------------------- props */

function pine(out: Box[], x: number, y: number, z: number, s: number, snowy: boolean) {
  out.push(b([x, y + 0.7 * s, z], [0.45, 1.4 * s, 0.45], '#5b3a25'))
  ;[2.4, 1.8, 1.25, 0.7].forEach((w, i) => {
    const ly = y + (1.3 + i * 0.7) * s
    out.push(b([x, ly, z], [w * s, 0.66 * s, w * s], i % 2 ? '#2c5a49' : '#356a50'))
    if (snowy) out.push(b([x, ly + 0.37 * s, z], [w * s * 0.8, 0.1, w * s * 0.8], '#f3f8fc'))
  })
}

function oak(out: Box[], x: number, y: number, z: number, s: number, tint: number) {
  out.push(b([x, y + 1.1 * s, z], [0.5, 2.2 * s, 0.5], '#6b4428'))
  out.push(b([x, y + 2.7 * s, z], [2.6 * s, 1.6 * s, 2.6 * s], shade('#4f8a3c', tint)))
  out.push(b([x + 0.3, y + 3.7 * s, z - 0.2], [1.6 * s, 0.9 * s, 1.6 * s], shade('#5f9c46', tint)))
}

function birch(out: Box[], x: number, y: number, z: number, s: number) {
  out.push(b([x, y + 1.4 * s, z], [0.42, 2.8 * s, 0.42], '#ece8dc'))
  out.push(b([x, y + 0.9 * s, z + 0.22], [0.2, 0.1, 0.06], '#3a3a3a'))
  out.push(b([x, y + 3.1 * s, z], [2.0 * s, 1.4 * s, 2.0 * s], '#7fb35a'))
  out.push(b([x, y + 4.0 * s, z], [1.2 * s, 0.7 * s, 1.2 * s], '#8cc063'))
}

function house(out: Box[], glow: Box[], x: number, y: number, z: number, w: number, d: number, roof: string) {
  const h = 2.6
  out.push(b([x, y + h / 2, z], [w, h, d], '#e8dcc6'))
  // Timber frame corners
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    out.push(b([x + (sx * (w - 0.3)) / 2, y + h / 2, z + (sz * (d - 0.3)) / 2], [0.32, h + 0.02, 0.32], '#6b4428'))
  // Stepped roof
  for (let i = 0; i < 3; i++) out.push(b([x, y + h + 0.25 + i * 0.5, z], [w + 0.6 - i * 1.1, 0.5, d + 0.6 - i * 0.9], shade(roof, -i * 0.06)))
  out.push(b([x, y + 0.75, z + d / 2 + 0.02], [0.8, 1.5, 0.08], '#5b3a25'))
  glow.push(b([x + w / 2 - 0.9, y + 1.6, z + d / 2 + 0.03], [0.6, 0.6, 0.05], '#ffd58a'))
  glow.push(b([x - w / 2 + 0.9, y + 1.6, z + d / 2 + 0.03], [0.6, 0.6, 0.05], '#ffd58a'))
}

function stall(out: Box[], x: number, y: number, z: number) {
  out.push(b([x, y + 0.5, z], [3, 1, 1.4], '#9a6a42'))
  out.push(b([x, y + 1.02, z], [3.2, 0.08, 1.6], '#c08b55'))
  for (const sx of [-1.45, 1.45]) out.push(b([x + sx, y + 1.6, z - 0.6], [0.18, 3.2, 0.18], '#6b4428'))
  for (let i = 0; i < 6; i++) out.push(b([x - 1.5 + 0.25 + i * 0.5, y + 3.1, z - 0.1], [0.5, 0.16, 1.9], i % 2 ? '#f7f3e8' : '#668b45'))
  // Goods: crates and jars already on display
  out.push(b([x - 1, y + 1.3, z], [0.5, 0.5, 0.5], '#c79a62'))
  out.push(b([x - 0.45, y + 1.25, z + 0.2], [0.35, 0.4, 0.35], '#a7d3e6'))
}

/** Small buildings echoing the app's storage zones (freezer, fridge, pantry, counter). */
function vignettes(out: Box[], glow: Box[], spots: Spots) {
  const defs: { x: number; z: number; kind: 'frost' | 'cool' | 'pantry' | 'home' }[] = [
    { x: -16, z: -30, kind: 'frost' },
    { x: -5, z: -20, kind: 'cool' },
    { x: 7, z: -32, kind: 'pantry' },
    { x: 20, z: -22, kind: 'home' },
  ]
  for (const v of defs) {
    const y = surfaceHeight(v.x, v.z) + 0.5
    if (v.kind === 'frost') {
      out.push(b([v.x, y + 1, v.z], [3.2, 2, 3], '#9fb3c4'))
      out.push(b([v.x, y + 2.25, v.z], [3.6, 0.5, 3.4], '#eef4fa'))
      out.push(b([v.x, y + 0.8, v.z + 1.52], [1, 1.6, 0.06], '#5d7a93'))
      glow.push(b([v.x, y + 1.95, v.z + 1.53], [0.9, 0.12, 0.05], '#bfe6fa'))
    } else if (v.kind === 'cool') {
      out.push(b([v.x, y + 1.1, v.z], [3, 2.2, 2.6], '#d9e6e0'))
      out.push(b([v.x, y + 2.5, v.z], [3.4, 0.6, 3], '#4f8f86'))
      out.push(b([v.x + 2.2, y + 0.3, v.z + 0.6], [1.2, 0.6, 2.2], '#8b8d88'))
      glow.push(b([v.x - 0.6, y + 1.4, v.z + 1.32], [0.7, 0.7, 0.05], '#9ff0e3'))
    } else if (v.kind === 'pantry') {
      out.push(b([v.x, y + 1.3, v.z], [3.4, 2.6, 2.8], '#b5875a'))
      out.push(b([v.x, y + 2.85, v.z], [3.8, 0.5, 3.2], '#7a4b2c'))
      out.push(b([v.x, y + 3.25, v.z], [2.6, 0.4, 2.2], '#7a4b2c'))
      // Open front with shelves
      out.push(b([v.x, y + 1.3, v.z + 1.42], [2.6, 2.0, 0.05], '#3d2a1d'))
      for (const sy of [0.7, 1.5]) out.push(b([v.x, y + sy, v.z + 1.3], [2.5, 0.1, 0.5], '#d9b98a'))
      out.push(b([v.x - 0.8, y + 0.98, v.z + 1.3], [0.4, 0.45, 0.4], '#e0c070'))
      out.push(b([v.x + 0.9, y + 1.8, v.z + 1.3], [0.3, 0.5, 0.3], '#c4613b'))
      glow.push(b([v.x, y + 2.35, v.z + 1.45], [2.2, 0.08, 0.05], '#ffd58a'))
      spots.shed = [v.x - 0.1, y + 1.55, v.z + 1.28]
    } else {
      house(out, glow, v.x, y, v.z, 4, 3.4, '#b04a32')
      out.push(b([v.x, y + 0.15, v.z + 2.4], [4.4, 0.3, 1.4], '#c08b55'))
    }
  }
}

function buildProps(props: Box[], glow: Box[], spots: Spots, tier: Tier) {
  const r = rng(77)
  const corridor = tier === 'high' ? 44 : 30
  // Village at the mouth of the pass
  const vz = -98
  const px = pathX(vz)
  const keepClear = (x: number, z: number) =>
    Math.abs(x - pathX(z)) < 3 ||
    Math.abs(x - streamX(z)) < 2.4 ||
    (Math.abs(z - vz) < 12 && Math.abs(x - px) < 14) ||
    (z > -38 && z < -14 && x > -22 && x < 26) ||
    // Keep the cliff lip open so the cut reads cleanly as the camera swings past it.
    (z > WORLD.faceZ - 9 && Math.abs(x) < 30)

  for (let z = WORLD.zBack + 4; z < WORLD.faceZ - 2; z += 3) {
    for (let x = -corridor; x <= corridor; x += 3) {
      const jx = x + Math.round((hash2(x, z, 1) - 0.5) * 2)
      const jz = z + Math.round((hash2(x, z, 2) - 0.5) * 2)
      if (!inside(jx, jz) || keepClear(jx, jz)) continue
      const H = surfaceHeight(jx, jz)
      const y = H + 0.5
      const m = mountainMask(jz)
      const forest = smoothstep(-28, -46, jz) * (1 - smoothstep(-86, -104, jz))
      const roll = hash2(jx, jz, 3)
      const s = 0.9 + hash2(jx, jz, 4) * 0.5
      if (H >= 146) continue
      if (m > 0.4) {
        if (roll < 0.22 * (H < 134 ? 1 : 0.4)) pine(props, jx, y, jz, s, H > 128)
      } else if (forest > 0.2) {
        if (roll < 0.5 * forest) {
          const kind = hash2(jx, jz, 5)
          if (kind < 0.4) pine(props, jx, y, jz, s, false)
          else if (kind < 0.75) oak(props, jx, y, jz, s, (hash2(jx, jz, 6) - 0.5) * 0.15)
          else birch(props, jx, y, jz, s)
        }
      } else if (roll < 0.07) {
        oak(props, jx, y, jz, s, (hash2(jx, jz, 6) - 0.5) * 0.15)
      } else if (roll < 0.2 && jz > -40) {
        // Flowers and tufts on the plains
        const fc = ['#f2d14b', '#e6edf2', '#d9667a', '#9a7fd1'][Math.floor(hash2(jx, jz, 7) * 4)]
        props.push(b([jx, y + 0.18, jz], [0.3, 0.36, 0.3], fc))
        props.push(b([jx + 0.6, y + 0.12, jz - 0.4], [0.3, 0.24, 0.3], '#5f8f3e'))
      }
      if (roll > 0.985) props.push(b([jx, y + 0.4, jz], [1.4 + r(), 0.9, 1.2 + r()], '#8b8d88'))
    }
  }

  const vy = (x: number, z: number) => surfaceHeight(x, z) + 0.5
  house(props, glow, px - 7, vy(px - 7, vz - 3), vz - 3, 3.6, 3.2, '#b04a32')
  house(props, glow, px + 7, vy(px + 7, vz + 2), vz + 2, 3.2, 3.4, '#7a4b2c')
  house(props, glow, px - 5, vy(px - 5, vz + 7), vz + 7, 3, 3, '#4f6f8f')
  const sx = px + 3.5
  const sz = vz - 6
  stall(props, sx, vy(sx, sz), sz)
  spots.stall = [sx + 0.55, vy(sx, sz) + 1.06, sz + 0.05]

  vignettes(props, glow, spots)

  // Path stones along the plains
  for (let z = -60; z < -16; z += 2) {
    const x = Math.round(pathX(z))
    if (hash2(x, z, 8) < 0.3) props.push(b([x + 1.6, vy(x, z) + 0.1, z], [0.5, 0.2, 0.4], '#a59a86'))
  }
}

/* ---------------------------------------------------------------- sky */

function buildClouds(tier: Tier): Box[] {
  const out: Box[] = []
  const r = rng(1701)
  const n = tier === 'high' ? 340 : 190
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 700
    const z = -560 + r() * 700
    const y = WORLD.cloudBase + Math.floor(r() * 3) * 1.5
    const parts = 2 + Math.floor(r() * 4)
    for (let k = 0; k < parts; k++) {
      const w = 10 + r() * 18
      const d = 8 + r() * 16
      out.push(b([x + (r() - 0.5) * 18, y + Math.floor(r() * 2) * 0.8, z + (r() - 0.5) * 16], [w, 1.4 + r() * 0.8, d], r() < 0.5 ? '#ffffff' : '#f6f8fa'))
    }
  }
  return out
}

function island(seed: number, R: number, peak: number): Box[] {
  const r = rng(seed)
  const boxes: Box[] = []
  for (let dx = -R; dx <= R; dx++) {
    for (let dz = -R; dz <= R; dz++) {
      const d = Math.hypot(dx, dz) / R
      if (d > 1 - valueNoise(dx * 0.4, dz * 0.4, seed) * 0.25) continue
      const top = Math.round(Math.pow(Math.max(0, 1 - d * 1.3), 1.6) * peak + fbm(dx * 0.3, dz * 0.3, seed) * 1.5)
      const depth = Math.round((1 - d) * R * 1.2 + r() * 2) + 1
      const snow = top > peak * 0.7 && peak > 4
      const rock = top > peak * 0.45 && peak > 4
      boxes.push(b([dx, top, dz], [1, 0.34, 1], shade(snow ? SNOW : rock ? '#8b8d88' : GRASS, (r() - 0.5) * 0.12)))
      const h = top + depth
      boxes.push(b([dx, top - 0.17 - h / 2, dz], [1, h, 1], shade(d > 0.6 ? DIRT : STONE, (r() - 0.5) * 0.12)))
    }
  }
  const trees = 1 + Math.floor(R / 4)
  for (let t = 0; t < trees; t++) {
    const tx = Math.round((r() - 0.5) * R)
    const tz = Math.round((r() - 0.5) * R)
    if (Math.hypot(tx, tz) > R * 0.7) continue
    const ty = Math.round(Math.pow(Math.max(0, 1 - (Math.hypot(tx, tz) / R) * 1.3), 1.6) * peak) + 0.17
    if (r() < 0.5) pine(boxes, tx, ty, tz, 0.9, false)
    else oak(boxes, tx, ty, tz, 0.9, 0)
  }
  return boxes
}

function buildIslands(): FloatingIsland[] {
  // [x, y, z, radius, peak, scale]: a few small islands near the opening shot, and a distant archipelago
  // that surrounds the continent (seen beyond the cliff and behind the final scene).
  const defs: [number, number, number, number, number, number][] = [
    [-70, 186, -160, 7, 2, 1],
    [84, 194, -196, 9, 3, 1],
    [-118, 200, -250, 11, 3, 1],
    [130, 176, -120, 6, 2, 1],
    [-260, 150, -40, 9, 9, 4],
    [300, 120, 60, 10, 10, 4],
    [-160, 110, 260, 8, 8, 4],
    [140, 70, 320, 9, 7, 5],
    [-320, 40, -260, 10, 10, 5],
    [260, 30, -340, 9, 9, 5],
    [-90, 10, -420, 8, 6, 5],
  ]
  return defs.map(([x, y, z, R, peak, scale], i) => ({ pos: [x, y, z] as V3, scale, boxes: island(900 + i, R, peak) }))
}

/* ---------------------------------------------------------------- water */

function buildWater(water: Box[], pool: Box[]) {
  for (let z = -95; z < WORLD.faceZ; z++) {
    const x = Math.round(streamX(z))
    for (const dx of [-1, 0, 1]) {
      if (!isStream(x + dx, z) || !inside(x + dx, z)) continue
      const H = surfaceHeight(x + dx, z)
      water.push(b([x + dx, H + 0.38, z], [1, 0.18, 1], '#5cb8dc'))
    }
  }
  // The pool on the main cave floor
  const level = CAVE.cy - CAVE.ry + 0.3
  for (let x = CAVE.cx; x <= CAVE.cx + 8; x++) {
    pool.push(b([x, level, WORLD.faceZ - 3.5], [1, 0.14, 5], '#4fb3c8'))
  }
}

/* ---------------------------------------------------------------- entry */

const cache = new Map<Tier, WorldData>()

export function buildWorld(tier: Tier = 'high'): WorldData {
  const hit = cache.get(tier)
  if (hit) return hit
  const props: Box[] = []
  const roots: Box[] = []
  const glow: Box[] = []
  const crystals: Box[] = []
  const lava: Box[] = []
  const water: Box[] = []
  const pool: Box[] = []
  const spots: Spots = {
    stall: [0, 0, 0],
    shed: [0, 0, 0],
    cave: [CAVE.cx - 6, Math.round(CAVE.cy - CAVE.ry - 0.5) + 0.5, WORLD.faceZ - 1.4],
    isle: [3.2, 2, 3.6],
    crates: [GALLERY.cx + 11, GALLERY.floor + 1, WORLD.faceZ - 1.4],
    springTop: undersideBottom(SPRING.x, SPRING.z),
    cascadeX: Math.round(streamX(WORLD.faceZ)),
  }
  const surface = buildSurface(tier)
  const face = buildFace(tier, crystals, lava)
  const underside = buildUnderside(roots)
  buildProps(props, glow, spots, tier)
  buildWater(water, pool)
  const data: WorldData = {
    surface,
    face,
    underside,
    props,
    roots,
    glow,
    crystals,
    lava,
    water,
    pool,
    clouds: buildClouds(tier),
    islands: buildIslands(),
    spots,
  }
  cache.set(tier, data)
  return data
}

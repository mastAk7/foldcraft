import { hash2, rng } from './noise'
import { COUNTER, ARRIVAL } from './layout'
import { cellAt, heightAt, isFree, PADS, terrain } from './terrainData'

export type V3 = [number, number, number]

export interface Box {
  p: V3
  s: V3
  c: string
  /** Growth origin; boxes scale toward this point while growing in. */
  root?: V3
}

/**
 * Prop groups. Groups with a stage requirement fade/grow in as world vitality rises.
 */
export type PropGroup = 'base' | 'ice' | 'glass' | 'glow' | 'flowers' | 'grown' | 'dead' | 'lanterns'

export type PropSet = Record<PropGroup, Box[]>

const b = (p: V3, s: V3, c: string, root?: V3): Box => ({ p, s, c, root })

/* ---------- individual props ---------- */

function pine(x: number, z: number, scale = 1): Box[] {
  const y = heightAt(x, z)
  const r: V3 = [x, y, z]
  const out: Box[] = [b([x, y + 0.7 * scale, z], [0.45, 1.4 * scale, 0.45], '#5b3a25', r)]
  const layers = [2.4, 1.8, 1.25, 0.7].map((w) => w * scale)
  layers.forEach((w, i) => {
    const ly = y + (1.3 + i * 0.68) * scale
    out.push(b([x, ly, z], [w, 0.62 * scale, w], i % 2 ? '#2c5a49' : '#335f4f', r))
    out.push(b([x, ly + 0.36 * scale, z], [w * 0.82, 0.12, w * 0.82], '#f3f8fc', r))
  })
  return out
}

function iceSpire(x: number, z: number, h: number, seed: number): Box[] {
  const y = heightAt(x, z)
  const r = rng(seed)
  const out: Box[] = []
  let w = 1.3
  let cy = y
  let ox = 0
  let oz = 0
  const steps = Math.round(h)
  for (let i = 0; i < steps; i++) {
    const sh = 0.9 + r() * 0.4
    out.push(b([x + ox, cy + sh / 2, z + oz], [w, sh, w], i % 2 ? '#bfe6fa' : '#a5d8f2'))
    cy += sh
    w *= 0.78
    ox += (r() - 0.5) * 0.2
    oz += (r() - 0.5) * 0.2
  }
  return out
}

function birch(x: number, z: number): Box[] {
  const y = heightAt(x, z)
  const r: V3 = [x, y, z]
  const out: Box[] = [b([x, y + 1.4, z], [0.42, 2.8, 0.42], '#ece8dc', r)]
  for (const sy of [0.6, 1.3, 2.1]) out.push(b([x + 0.01, y + sy, z + 0.2], [0.2, 0.1, 0.06], '#3a3a3a', r))
  out.push(b([x, y + 3.2, z], [2.2, 1.3, 2.2], '#5fbf9f', r))
  out.push(b([x, y + 4.0, z], [1.4, 0.7, 1.4], '#6fd0ad', r))
  out.push(b([x, y + 4.42, z], [1.2, 0.14, 1.2], '#effaf6', r))
  out.push(b([x + 0.6, y + 3.92, z + 0.6], [0.8, 0.12, 0.8], '#effaf6', r))
  return out
}

function shrub(x: number, z: number, color: string, frost: boolean): Box[] {
  const y = heightAt(x, z)
  const out = [b([x, y + 0.4, z], [0.9, 0.8, 0.9], color, [x, y, z])]
  if (frost) out.push(b([x, y + 0.86, z], [0.75, 0.12, 0.75], '#eef8f5', [x, y, z]))
  return out
}

function oak(x: number, z: number, scale = 1): Box[] {
  const y = heightAt(x, z)
  const r: V3 = [x, y, z]
  return [
    b([x, y + 1.1 * scale, z], [0.55 * scale, 2.2 * scale, 0.55 * scale], '#6b4428', r),
    b([x, y + 2.7 * scale, z], [2.6 * scale, 1.4 * scale, 2.6 * scale], '#4f9d3a', r),
    b([x + 0.3 * scale, y + 3.6 * scale, z - 0.2 * scale], [1.7 * scale, 0.9 * scale, 1.7 * scale], '#62b348', r),
    b([x - 0.9 * scale, y + 2.4 * scale, z + 0.7 * scale], [0.9 * scale, 0.8 * scale, 0.9 * scale], '#58a940', r),
  ]
}

function deadBush(x: number, z: number): Box[] {
  const y = heightAt(x, z)
  return [
    b([x, y + 0.35, z], [0.12, 0.7, 0.12], '#7a6248'),
    b([x + 0.18, y + 0.55, z], [0.36, 0.08, 0.08], '#7a6248'),
    b([x - 0.12, y + 0.45, z + 0.1], [0.08, 0.08, 0.3], '#7a6248'),
  ]
}

function rock(x: number, z: number, c: string): Box[] {
  const y = heightAt(x, z)
  return [b([x, y + 0.3, z], [1, 0.6, 0.8], c), b([x + 0.25, y + 0.7, z - 0.1], [0.5, 0.35, 0.5], c)]
}

function crate(x: number, y: number, z: number, s = 0.8): Box[] {
  return [b([x, y + s / 2, z], [s, s, s], '#a87443'), b([x, y + s / 2, z], [s + 0.02, s * 0.15, s + 0.02], '#7a512d')]
}

function barrel(x: number, y: number, z: number): Box[] {
  return [
    b([x, y + 0.45, z], [0.7, 0.9, 0.7], '#8d5b34'),
    b([x, y + 0.25, z], [0.74, 0.08, 0.74], '#55524e'),
    b([x, y + 0.7, z], [0.74, 0.08, 0.74], '#55524e'),
  ]
}

/* ---------- zone structures ---------- */

function freezerVault(): { base: Box[]; ice: Box[]; glow: Box[] } {
  const p = PADS.frostlands
  const cx = (p.x0 + p.x1) / 2
  const z = p.z0 - 2.2
  const y = heightAt(cx, z)
  const ice: Box[] = []
  const base: Box[] = []
  // Stepped ice-block hall.
  ice.push(b([cx, y + 1.2, z], [5.2, 2.4, 2.6], '#d9eff9'))
  ice.push(b([cx, y + 2.7, z], [4.2, 0.6, 2.2], '#c9e7f6'))
  ice.push(b([cx, y + 3.2, z], [3, 0.5, 1.8], '#bfe2f4'))
  base.push(b([cx, y + 0.9, z + 1.31], [1.4, 1.8, 0.05], '#28506e'))
  base.push(b([cx, y + 1.95, z + 1.32], [1.7, 0.25, 0.08], '#e9f6fd'))
  const glow = [b([cx - 1.6, y + 1.4, z + 1.33], [0.35, 0.35, 0.05], '#8fe3ff'), b([cx + 1.6, y + 1.4, z + 1.33], [0.35, 0.35, 0.05], '#8fe3ff')]
  return { base, ice, glow }
}

function coolCellar(): { base: Box[]; glow: Box[] } {
  const p = PADS.coldgrove
  const cx = (p.x0 + p.x1) / 2 - 1
  const z = p.z0 - 2.2
  const y = heightAt(cx, z)
  const base: Box[] = [
    b([cx, y + 1.1, z], [4.6, 2.2, 2.4], '#7d8b93'),
    b([cx, y + 2.45, z], [5, 0.5, 2.8], '#5fbf9f'),
    b([cx, y + 2.8, z], [4, 0.3, 2.2], '#effaf6'),
    b([cx, y + 0.85, z + 1.21], [1.3, 1.7, 0.05], '#2b3a44'),
    b([cx - 1.6, y + 0.6, z + 1.25], [0.6, 1.2, 0.1], '#6c7a82'),
    b([cx + 1.6, y + 0.6, z + 1.25], [0.6, 1.2, 0.1], '#6c7a82'),
  ]
  const glow = [b([cx + 1.0, y + 1.6, z + 1.3], [0.3, 0.4, 0.2], '#9df0e0')]
  return { base, glow }
}

function pantryShed(): { base: Box[]; glass: Box[] } {
  const p = PADS.plains
  const cx = (p.x0 + p.x1) / 2
  const z = p.z0 - 2.4
  const y = heightAt(cx, z)
  const W = 5.6
  const base: Box[] = [
    // floor, back wall, sides
    b([cx, y + 0.08, z], [W, 0.16, 2.2], '#9b6a3f'),
    b([cx, y + 1.4, z - 1.0], [W, 2.6, 0.2], '#b07a48'),
    b([cx - W / 2, y + 1.4, z], [0.2, 2.6, 2.2], '#a06c3e'),
    b([cx + W / 2, y + 1.4, z], [0.2, 2.6, 2.2], '#a06c3e'),
    // roof
    b([cx, y + 2.85, z + 0.1], [W + 0.6, 0.25, 2.8], '#c4563b'),
    b([cx, y + 3.1, z - 0.2], [W + 0.4, 0.25, 1.8], '#b04a32'),
    // shelves
    b([cx, y + 0.9, z - 0.65], [W - 0.4, 0.1, 0.6], '#7a512d'),
    b([cx, y + 1.75, z - 0.65], [W - 0.4, 0.1, 0.6], '#7a512d'),
    // sacks and boxes on shelves
    b([cx - 2, y + 1.15, z - 0.65], [0.6, 0.4, 0.4], '#e6d3a3'),
    b([cx - 1.2, y + 1.1, z - 0.65], [0.5, 0.3, 0.4], '#d9a441'),
    b([cx + 1.6, y + 2.0, z - 0.65], [0.7, 0.4, 0.4], '#e6d3a3'),
    b([cx + 0.6, y + 1.98, z - 0.65], [0.4, 0.36, 0.36], '#c96b3a'),
  ]
  const glass: Box[] = [
    b([cx + 0.2, y + 1.15, z - 0.65], [0.35, 0.4, 0.35], '#cfe9f2'),
    b([cx + 0.75, y + 1.12, z - 0.65], [0.3, 0.34, 0.3], '#cfe9f2'),
    b([cx - 0.7, y + 2.0, z - 0.65], [0.35, 0.4, 0.35], '#cfe9f2'),
  ]
  base.push(...crate(cx + W / 2 + 0.9, y, z + 0.6), ...barrel(cx - W / 2 - 0.8, y, z + 0.5))
  return { base, glass }
}

export const BINS = [
  { key: 'recycle', label: 'Recycle', color: '#3d7cc9' },
  { key: 'compost', label: 'Compost', color: '#4f9a4a' },
  { key: 'return', label: 'Return', color: '#e08a3c' },
  { key: 'general', label: 'General', color: '#55565c' },
] as const

export function binPositions(): V3[] {
  const p = PADS.workshop
  const z = p.z0 - 2.2
  return BINS.map((_, i) => [p.x0 + 2.2 + i * 1.5, heightAt(p.x0 + 2 + i * 1.5, z), z] as V3)
}

function workshop(): { base: Box[]; glass: Box[] } {
  const p = PADS.workshop
  const base: Box[] = []
  const glass: Box[] = []
  // sorting bins
  binPositions().forEach(([x, y, z], i) => {
    const c = BINS[i].color
    base.push(b([x, y + 0.6, z], [1.1, 1.2, 1.0], c))
    base.push(b([x, y + 1.26, z], [1.2, 0.14, 1.1], '#2f3136'))
    base.push(b([x, y + 0.75, z + 0.51], [0.5, 0.35, 0.03], '#f4efe4'))
  })
  // crafting bench
  const bx = p.x0 + 0.2
  const bz = p.z0 - 2.2
  const by = heightAt(bx, bz)
  base.push(b([bx, by + 0.5, bz], [1.6, 1.0, 1.0], '#8b5a3c'), b([bx, by + 1.05, bz], [1.7, 0.12, 1.1], '#c99a6b'))
  base.push(b([bx - 0.4, by + 1.2, bz], [0.5, 0.18, 0.18], '#6f7177'), b([bx + 0.35, by + 1.18, bz + 0.1], [0.12, 0.12, 0.6], '#c9a44a'))
  // reuse shelf with jars
  const sx = p.x1 + 1.8
  const sz = p.z0 + 1
  const sy = heightAt(sx, sz)
  base.push(b([sx, sy + 1.2, sz], [0.9, 2.4, 2.4], '#9a6a3f'))
  base.push(b([sx + 0.05, sy + 1.2, sz], [0.82, 2.2, 2.2], '#5a3d25'))
  for (const ly of [0.55, 1.35]) base.push(b([sx + 0.1, sy + ly, sz], [0.8, 0.08, 2.2], '#b07a48'))
  for (let i = 0; i < 4; i++) {
    glass.push(b([sx + 0.15, sy + 0.78, sz - 0.75 + i * 0.5], [0.32, 0.38, 0.32], '#cfe9f2'))
    if (i % 2 === 0) glass.push(b([sx + 0.15, sy + 1.58, sz - 0.6 + i * 0.5], [0.3, 0.36, 0.3], '#d8efe0'))
  }
  return { base, glass }
}

function homestead(): { base: Box[]; glow: Box[] } {
  const base: Box[] = []
  const { x0, x1, z, depth, top } = COUNTER
  const w = x1 - x0
  const cx = (x0 + x1) / 2
  base.push(b([cx, 2 + (top - 2.15) / 2, z], [w, top - 2.15, depth], '#8b5a3c'))
  base.push(b([cx, top - 0.08, z], [w + 0.2, 0.16, depth + 0.2], '#e2dbcd'))
  for (let i = 0; i < 4; i++) base.push(b([x0 + 0.8 + i * 1.55, 2.5, z + depth / 2 + 0.01], [1.2, 0.6, 0.03], '#6f4630'))
  // awning
  for (const px of [x0 - 0.3, x1 + 0.3]) {
    base.push(b([px, 2 + 2.6, z - 0.9], [0.22, 5.2, 0.22], '#6b4428'))
    base.push(b([px, 2 + 2.2, z + 0.9], [0.22, 4.4, 0.22], '#6b4428'))
  }
  for (let i = 0; i < 8; i++) {
    const ax = x0 - 0.4 + (i + 0.5) * ((w + 0.8) / 8)
    base.push(b([ax, 2 + 4.9, z - 0.2], [(w + 0.8) / 8 + 0.01, 0.16, 1.6], i % 2 ? '#f0e7d3' : '#d9734a'))
  }
  // arrival pad tiles
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++)
      base.push(b([ARRIVAL.x + dx * 1.1, 2.03, ARRIVAL.z + dz * 1.1], [1.05, 0.06, 1.05], (dx + dz) % 2 ? '#d9cdb7' : '#e8dfcc'))
  // banner pole
  base.push(b([4.3, 2 + 2.2, 3.6], [0.18, 4.4, 0.18], '#5b3a25'))
  base.push(b([4.95, 2 + 3.7, 3.6], [1.2, 0.8, 0.06], '#4f9d6a'))
  const glow = [b([x0 - 0.3, 2 + 5.35, z - 0.9], [0.3, 0.3, 0.3], '#ffd27a'), b([x1 + 0.3, 2 + 5.35, z - 0.9], [0.3, 0.3, 0.3], '#ffd27a')]
  return { base, glow }
}

/* ---------- scatter ---------- */

/** Keep tall props out of the corridor between each pad and the default (south-facing) camera. */
function clearView(x: number, z: number): boolean {
  return Object.values(PADS).every((p) => !(x >= p.x0 - 2.5 && x <= p.x1 + 2.5 && z > p.z1 && z < p.z1 + 9))
}

function scatter(
  region: string,
  count: number,
  seed: number,
  minDist: number,
  taken: [number, number][],
  extra?: (x: number, z: number) => boolean,
): [number, number][] {
  const cells = terrain().cells.filter((c) => c.region === region)
  const r = rng(seed)
  const out: [number, number][] = []
  let guard = 0
  while (out.length < count && guard++ < count * 60) {
    const c = cells[Math.floor(r() * cells.length)]
    if (!c || !isFree(c.x, c.z) || (extra && !extra(c.x, c.z))) continue
    if (taken.some(([x, z]) => Math.hypot(x - c.x, z - c.z) < minDist)) continue
    out.push([c.x, c.z])
    taken.push([c.x, c.z])
  }
  return out
}

let cached: PropSet | null = null

export function buildProps(): PropSet {
  if (cached) return cached
  const set: PropSet = { base: [], ice: [], glass: [], glow: [], flowers: [], grown: [], dead: [], lanterns: [] }
  const taken: [number, number][] = []

  // reserve structure footprints
  const reserve = (x: number, z: number, r: number) => {
    for (let a = 0; a < 6.3; a += 0.8) taken.push([x + Math.cos(a) * r, z + Math.sin(a) * r])
    taken.push([x, z])
  }
  reserve((PADS.frostlands.x0 + PADS.frostlands.x1) / 2, PADS.frostlands.z0 - 2.2, 2.6)
  reserve((PADS.coldgrove.x0 + PADS.coldgrove.x1) / 2 - 1, PADS.coldgrove.z0 - 2.2, 2.6)
  reserve((PADS.plains.x0 + PADS.plains.x1) / 2, PADS.plains.z0 - 2.4, 3.2)
  reserve(PADS.workshop.x0 + 4, PADS.workshop.z0 - 2.2, 3.4)
  reserve(PADS.workshop.x1 + 1.8, PADS.workshop.z0 + 1, 1.6)
  reserve(5, 16, 2) // windmill
  reserve(13, 13, 1.6) // waterwheel

  const fv = freezerVault()
  set.base.push(...fv.base)
  set.ice.push(...fv.ice)
  set.glow.push(...fv.glow)
  const cc = coolCellar()
  set.base.push(...cc.base)
  set.glow.push(...cc.glow)
  const ps = pantryShed()
  set.base.push(...ps.base)
  set.glass.push(...ps.glass)
  const ws = workshop()
  set.base.push(...ws.base)
  set.glass.push(...ws.glass)
  const hs = homestead()
  set.base.push(...hs.base)
  set.glow.push(...hs.glow)

  // Frostlands
  scatter('frostlands', 4, 11, 3, taken, clearView).forEach(([x, z], i) => set.ice.push(...iceSpire(x, z, 3 + (i % 3) * 1.5, 100 + i)))
  scatter('frostlands', 9, 12, 2.4, taken, clearView).forEach(([x, z], i) => set.base.push(...pine(x, z, 0.8 + hash2(x, z) * 0.45 + (i % 2) * 0.1)))
  scatter('frostlands', 4, 13, 1.6, taken).forEach(([x, z]) => set.base.push(...rock(x, z, '#a9b8c7')))

  // Cold Grove
  scatter('coldgrove', 8, 21, 2.4, taken, clearView).forEach(([x, z]) => set.base.push(...birch(x, z)))
  scatter('coldgrove', 9, 22, 1.4, taken).forEach(([x, z]) => set.base.push(...shrub(x, z, '#4fa58c', true)))
  scatter('coldgrove', 3, 23, 1.4, taken).forEach(([x, z]) => set.base.push(...rock(x, z, '#8b979e')))

  // Sunlit Plains
  scatter('plains', 6, 31, 3, taken, clearView).forEach(([x, z]) => set.base.push(...oak(x, z, 0.85 + hash2(x, z) * 0.35)))
  const wheat = scatter('plains', 3, 32, 2.2, taken)
  wheat.forEach(([wx, wz]) => {
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const x = wx + dx * 0.45
        const z = wz + dz * 0.45
        const y = heightAt(wx, wz)
        const hh = 0.5 + hash2(Math.round(x * 10), Math.round(z * 10)) * 0.3
        set.base.push(b([x, y + hh / 2, z], [0.16, hh, 0.16], '#e2c35b'))
      }
  })
  scatter('plains', 5, 33, 1.6, taken).forEach(([x, z]) => set.base.push(...shrub(x, z, '#5aa843', false)))

  // Workshop: dry growth that becomes saplings/trees with vitality
  scatter('workshop', 7, 41, 2.2, taken, clearView).forEach(([x, z]) => {
    set.dead.push(...deadBush(x, z))
    set.grown.push(...oak(x, z, 0.7 + hash2(x, z) * 0.25))
  })

  // Flowers across the island (stage 2+)
  const flowerColors = ['#f25f5c', '#ffd23f', '#ffffff', '#b38cff', '#ff9ec7']
  for (const region of ['plains', 'workshop', 'coldgrove', 'path'] as const) {
    const pts = scatter(region, region === 'path' ? 10 : 14, 50 + region.length, 0.9, [...taken], (x, z) => !cellAt(x, z)?.water)
    pts.forEach(([x, z], i) => {
      const y = heightAt(x, z)
      const ox = (hash2(x, z, 7) - 0.5) * 0.5
      const oz = (hash2(x, z, 8) - 0.5) * 0.5
      const r: V3 = [x + ox, y, z + oz]
      set.flowers.push(b([x + ox, y + 0.16, z + oz], [0.06, 0.32, 0.06], '#3f8f3a', r))
      set.flowers.push(b([x + ox, y + 0.38, z + oz], [0.2, 0.16, 0.2], flowerColors[i % flowerColors.length], r))
    })
  }

  // Lanterns along the paths (stage 5)
  const lanternSpots: [number, number][] = [
    [1.8, 8], [-1.8, 8], [1.8, -8], [-1.8, -8], [8, 1.8], [8, -1.8], [-8, 1.8], [-8, -1.8], [1.8, 14], [-1.8, -14], [14, -1.8], [-14, 1.8],
  ]
  for (const [x, z] of lanternSpots) {
    if (!cellAt(x, z)) continue
    const y = heightAt(x, z)
    set.base.push(b([x, y + 0.7, z], [0.14, 1.4, 0.14], '#4a3626'))
    set.lanterns.push(b([x, y + 1.55, z], [0.34, 0.36, 0.34], '#ffd27a', [x, y + 1.4, z]))
  }

  cached = set
  return set
}

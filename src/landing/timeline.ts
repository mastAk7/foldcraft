import * as THREE from 'three'
import { CAVE, GALLERY, pathX, WORLD } from './scene/worldgen'

/**
 * The journey as pure functions of scroll progress (0..1).
 * Nothing here holds state, so scrolling backwards replays the exact same frames in reverse.
 */

export type V3 = [number, number, number]

export interface CamKey {
  p: number
  pos: V3
  look: V3
  fov?: number
}

const F = WORLD.faceZ
const px = (z: number) => Math.round(pathX(z) * 10) / 10

export const CAM_KEYS: CamKey[] = [
  // S1 Sky — just above the cloud sea, peaks breaking through ahead
  { p: 0.0, pos: [0, 206, -252], look: [0, 188, -60], fov: 40 },
  { p: 0.045, pos: [1, 204, -248], look: [0, 185, -60] },
  { p: 0.085, pos: [3, 178, -234], look: [2, 150, -100] },
  // Through the clouds
  { p: 0.108, pos: [5, 143, -218], look: [3, 128, -120] },
  { p: 0.132, pos: [5, 133, -202], look: [px(-120), 124, -110] },
  // S2 Mountains — threading the pass towards the village
  { p: 0.17, pos: [px(-178), 134, -178], look: [px(-120), 124, -112], fov: 40 },
  { p: 0.205, pos: [px(-160), 132, -160], look: [px(-100), 119, -100] },
  { p: 0.24, pos: [px(-142), 131, -142], look: [px(-92), 116, -88] },
  { p: 0.275, pos: [px(-116), 129, -116], look: [px(-60), 113, -56] },
  // S3 Plains & forests
  { p: 0.31, pos: [px(-88), 126, -88], look: [2, 112, -34] },
  { p: 0.345, pos: [-1, 124, -66], look: [2, 111, -26] },
  { p: 0.38, pos: [2, 123, -50], look: [3, 110, -18] },
  // Over the edge: swing out past the cliff lip to a three-quarter view of the cut
  { p: 0.41, pos: [4, 128, -30], look: [3, 109, F + 5] },
  { p: 0.435, pos: [30, 118, F + 14], look: [0, 103, F - 2] },
  { p: 0.46, pos: [16, 110, F + 42], look: [2, 99, F] },
  // S4 Soil & cobblestone — sinking down the cross-section
  { p: 0.49, pos: [8, 104, F + 50], look: [0, 97, F] },
  { p: 0.52, pos: [2, 95, F + 46], look: [-2, 90, F] },
  { p: 0.55, pos: [0, 86, F + 44], look: [2, 80, F] },
  // S5 Caves — push into the main cave
  { p: 0.585, pos: [CAVE.cx - 10, 76, F + 34], look: [CAVE.cx - 2, 70, F - 3] },
  { p: 0.62, pos: [CAVE.cx - 8, 70.5, F + 19], look: [CAVE.cx - 5, 66, F - 4] },
  { p: 0.65, pos: [CAVE.cx - 8, 68.5, F + 12], look: [CAVE.cx - 7.5, 65, F - 3] },
  { p: 0.68, pos: [CAVE.cx - 10, 68, F + 16], look: [CAVE.cx - 8, 65, F - 3] },
  // S6 Lava — down to the gallery
  { p: 0.715, pos: [2, 61, F + 30], look: [0, 53, F - 2] },
  { p: 0.75, pos: [GALLERY.cx, 57.5, F + 27], look: [GALLERY.cx - 1, 48, F - 4] },
  { p: 0.785, pos: [GALLERY.cx - 4, 56, F + 26], look: [GALLERY.cx - 2, 47.5, F - 4] },
  { p: 0.815, pos: [2, 50, F + 32], look: [8, 42, F] },
  // Drop out beneath the continent and follow the spring down to the island
  { p: 0.845, pos: [10, 38, F + 44], look: [15, 22, F - 8] },
  { p: 0.875, pos: [22, 30, F + 62], look: [8, 14, -10] },
  // S7 Renewed world
  { p: 0.91, pos: [31, 25, 70], look: [-2, 9, -5] },
  { p: 0.955, pos: [35, 22.5, 76], look: [-6, 8.5, -6] },
  { p: 1.0, pos: [36, 22, 78], look: [-6, 8.5, -6] },
]

/* ------------------------------------------------------------ remap (C1) */

/** Monotone cubic (Fritsch–Carlson) through (key.p, index) so camera speed never jumps at a keyframe. */
function monotone(xs: number[], ys: number[]) {
  const n = xs.length
  const d: number[] = []
  const m: number[] = new Array(n).fill(0)
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i])
  return (x: number) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let i = 0
    while (i < n - 2 && x > xs[i + 1]) i++
    const h = xs[i + 1] - xs[i]
    const t = (x - xs[i]) / h
    const t2 = t * t
    const t3 = t2 * t
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]
    )
  }
}

const toIndex = monotone(
  CAM_KEYS.map((k) => k.p),
  CAM_KEYS.map((_, i) => i),
)

const posCurve = new THREE.CatmullRomCurve3(
  CAM_KEYS.map((k) => new THREE.Vector3(...k.pos)),
  false,
  'centripetal',
)
const lookCurve = new THREE.CatmullRomCurve3(
  CAM_KEYS.map((k) => new THREE.Vector3(...k.look)),
  false,
  'centripetal',
)
const fovAt = monotone(
  CAM_KEYS.filter((k) => k.fov !== undefined).map((k) => k.p),
  CAM_KEYS.filter((k) => k.fov !== undefined).map((k) => k.fov!),
)

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Spline parameter for a progress value; exposed for tests. */
export function splineT(p: number) {
  return toIndex(clamp01(p)) / (CAM_KEYS.length - 1)
}

export interface CamSample {
  pos: THREE.Vector3
  look: THREE.Vector3
  fov: number
}

export function sampleCamera(p: number, out?: CamSample): CamSample {
  const t = splineT(p)
  const o = out ?? { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 }
  posCurve.getPoint(t, o.pos)
  lookCurve.getPoint(t, o.look)
  o.fov = fovAt(clamp01(p))
  return o
}

/* ------------------------------------------------------------ atmosphere */

export interface Atmos {
  skyTop: string
  skyHorizon: string
  skyBottom: string
  fog: string
  fogNear: number
  fogFar: number
  sun: string
  sunI: number
  hemiSky: string
  hemiGround: string
  hemiI: number
  ambient: number
  exposure: number
  /** Soft light carried with the camera underground so the geometry never disappears into black. */
  lamp: number
  cave: number
  lava: number
}

interface AtmosKey extends Atmos {
  p: number
}

const DAY: Atmos = {
  skyTop: '#5d9bd0',
  skyHorizon: '#fbe3c6',
  skyBottom: '#e6eef2',
  fog: '#e2ebf0',
  fogNear: 160,
  fogFar: 820,
  sun: '#fff0d6',
  sunI: 3.0,
  hemiSky: '#dcefff',
  hemiGround: '#b4a088',
  hemiI: 1.05,
  ambient: 0.22,
  exposure: 1.0,
  lamp: 0,
  cave: 0,
  lava: 0,
}

export const ATMOS_KEYS: AtmosKey[] = [
  { p: 0, ...DAY },
  { p: 0.07, ...DAY },
  // Whiteout inside the cloud sea
  { p: 0.108, ...DAY, fog: '#f6f8f9', fogNear: 2, fogFar: 46, hemiI: 1.25, exposure: 1.3 },
  { p: 0.135, ...DAY, fog: '#d9e5ea', fogNear: 90, fogFar: 560 },
  { p: 0.27, ...DAY, skyHorizon: '#f9e3c2', fog: '#dde6e2', fogNear: 110, fogFar: 600, sun: '#ffebc7', sunI: 3.1 },
  { p: 0.4, ...DAY, skyHorizon: '#fcdfb6', fog: '#e4e3d4', fogNear: 110, fogFar: 600, sun: '#ffe2b0', sunI: 3.1 },
  // The slice: daylight still falls on the upper strata
  {
    p: 0.47,
    ...DAY,
    skyHorizon: '#f2d3b0',
    fog: '#c9cdc8',
    fogNear: 50,
    fogFar: 260,
    sun: '#fff1dc',
    sunI: 2.1,
    hemiI: 0.95,
    lamp: 0.2,
  },
  {
    p: 0.555,
    skyTop: '#2b2d33',
    skyHorizon: '#4a4038',
    skyBottom: '#1e1c1b',
    fog: '#3a352f',
    fogNear: 36,
    fogFar: 150,
    sun: '#fbecd8',
    sunI: 0.95,
    hemiSky: '#c9d6e0',
    hemiGround: '#5a4634',
    hemiI: 0.6,
    ambient: 0.16,
    exposure: 1.02,
    lamp: 1.1,
    cave: 0.15,
    lava: 0,
  },
  {
    p: 0.64,
    skyTop: '#101a1d',
    skyHorizon: '#1d2b2e',
    skyBottom: '#0d1112',
    fog: '#142326',
    fogNear: 26,
    fogFar: 120,
    sun: '#cfe8ff',
    sunI: 0.3,
    hemiSky: '#a9b4bd',
    hemiGround: '#2b2a2c',
    hemiI: 0.34,
    ambient: 0.12,
    exposure: 1.05,
    lamp: 1.2,
    cave: 1,
    lava: 0.15,
  },
  {
    p: 0.765,
    skyTop: '#1c0c08',
    skyHorizon: '#3a160c',
    skyBottom: '#120806',
    fog: '#2b130c',
    fogNear: 24,
    fogFar: 120,
    sun: '#ffb27a',
    sunI: 0.35,
    hemiSky: '#ff9a5a',
    hemiGround: '#2a1a14',
    hemiI: 0.3,
    ambient: 0.1,
    exposure: 1.02,
    lamp: 0.55,
    cave: 0.2,
    lava: 1,
  },
  // Out beneath the continent: ember sky gives way to dawn
  {
    p: 0.845,
    skyTop: '#4a6a9c',
    skyHorizon: '#f7c08e',
    skyBottom: '#ead6c6',
    fog: '#ecd3bd',
    fogNear: 90,
    fogFar: 380,
    sun: '#ffc48a',
    sunI: 1.9,
    hemiSky: '#ffd6b0',
    hemiGround: '#5e5a6a',
    hemiI: 0.75,
    ambient: 0.16,
    exposure: 1.02,
    lamp: 0.25,
    cave: 0,
    lava: 0.35,
  },
  {
    p: 0.91,
    skyTop: '#5d9bd0',
    skyHorizon: '#ffe4c2',
    skyBottom: '#bcd5e6',
    fog: '#dfe6e6',
    fogNear: 110,
    fogFar: 520,
    sun: '#ffe1b6',
    sunI: 3.0,
    hemiSky: '#e4f2ff',
    hemiGround: '#a89478',
    hemiI: 1.05,
    ambient: 0.2,
    exposure: 1.05,
    lamp: 0,
    cave: 0,
    lava: 0,
  },
  {
    p: 1,
    skyTop: '#5d9bd0',
    skyHorizon: '#ffe4c2',
    skyBottom: '#bcd5e6',
    fog: '#dfe6e6',
    fogNear: 110,
    fogFar: 520,
    sun: '#ffe1b6',
    sunI: 3.0,
    hemiSky: '#e4f2ff',
    hemiGround: '#a89478',
    hemiI: 1.05,
    ambient: 0.2,
    exposure: 1.05,
    lamp: 0,
    cave: 0,
    lava: 0,
  },
]

const COLOR_KEYS = ['skyTop', 'skyHorizon', 'skyBottom', 'fog', 'sun', 'hemiSky', 'hemiGround'] as const
const NUM_KEYS = ['fogNear', 'fogFar', 'sunI', 'hemiI', 'ambient', 'exposure', 'lamp', 'cave', 'lava'] as const

export interface AtmosSample {
  colors: Record<(typeof COLOR_KEYS)[number], THREE.Color>
  nums: Record<(typeof NUM_KEYS)[number], number>
}

const ca = new THREE.Color()
const cb = new THREE.Color()

export function createAtmosSample(): AtmosSample {
  return {
    colors: Object.fromEntries(COLOR_KEYS.map((k) => [k, new THREE.Color()])) as AtmosSample['colors'],
    nums: Object.fromEntries(NUM_KEYS.map((k) => [k, 0])) as AtmosSample['nums'],
  }
}

/** Atmosphere at progress p, smoothstepped between neighbouring keys. Colours are mixed in linear space. */
export function sampleAtmos(p: number, out: AtmosSample = createAtmosSample()): AtmosSample {
  const x = clamp01(p)
  let i = 0
  while (i < ATMOS_KEYS.length - 2 && x > ATMOS_KEYS[i + 1].p) i++
  const a = ATMOS_KEYS[i]
  const b = ATMOS_KEYS[i + 1]
  const raw = clamp01((x - a.p) / (b.p - a.p))
  const t = raw * raw * (3 - 2 * raw)
  for (const k of COLOR_KEYS) out.colors[k].copy(ca.set(a[k])).lerp(cb.set(b[k]), t)
  for (const k of NUM_KEYS) out.nums[k] = a[k] + (b[k] - a[k]) * t
  return out
}

/* ------------------------------------------------------------ helpers */

/** 0 → 1 across [a, b], clamped. */
export const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))

export const smooth = (t: number) => t * t * (3 - 2 * t)

/** Whether the scene behind the nav and gauge is dark (underground), so they switch to light ink. */
export const darkSceneAt = (p: number) => p > 0.475 && p < 0.835

/** Island bloom: the consumer world's own growth system, driven by the last stretch of the journey. */
export const vitalityAt = (p: number) => 5 * smooth(seg(p, 0.86, 0.95))

import type { Hole, Plate, Vec3 } from './types'

/* Small vector helpers; the domain layer stays free of three.js so it can be unit-tested in node. */

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

export const DEG = Math.PI / 180

/** Rodrigues rotation of v around unit axis k by angle a. */
export function rotate(v: Vec3, k: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  const kxv = cross(k, v)
  const kdv = dot(k, v)
  return [
    v[0] * c + kxv[0] * s + k[0] * kdv * (1 - c),
    v[1] * c + kxv[1] * s + k[1] * kdv * (1 - c),
    v[2] * c + kxv[2] * s + k[2] * kdv * (1 - c),
  ]
}

/** Rotate a whole plate about an axis through point p. */
export function rotatePlate(pl: Plate, p: Vec3, axis: Vec3, a: number): Plate {
  return {
    ...pl,
    origin: add(p, rotate(sub(pl.origin, p), axis, a)),
    u: rotate(pl.u, axis, a),
    v: rotate(pl.v, axis, a),
  }
}

export const normalOf = (pl: Pick<Plate, 'u' | 'v'>): Vec3 => norm(cross(pl.u, pl.v))

export function rect(x0: number, x1: number, y0: number, y1: number): [number, number][] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]
}

/** Shoelace area of a simple polygon. */
export function polygonArea(poly: [number, number][]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

export function holeArea(h: Hole): number {
  return h.kind === 'circle' ? Math.PI * h.r * h.r : h.w * h.h
}

/** Material area of a plate: outline minus openings, mm². */
export function plateArea(pl: Plate): number {
  return polygonArea(pl.outline) - pl.holes.reduce((s, h) => s + holeArea(h), 0)
}

interface Frame {
  origin: Vec3
  u: Vec3
  v: Vec3
}

/**
 * Attach a flap to a parent plate's edge and fold it.
 * edge 'far' = the parent's y = `at` line, 'near' = its y = 0 hinge line.
 * fold = 0 continues the parent flat; fold = 90° turns it towards `side` × parent normal.
 */
export function hingeFrame(parent: Frame, edge: 'far' | 'near', at: number, fold: number, side: 1 | -1): Frame {
  const n = normalOf(parent)
  const base = edge === 'far' ? parent.v : scale(parent.v, -1)
  const v = add(scale(base, Math.cos(fold)), scale(n, side * Math.sin(fold)))
  const origin = edge === 'far' ? add(parent.origin, scale(parent.v, at)) : parent.origin
  return { origin, u: parent.u, v: norm(v) }
}

/** Evenly spaced grid of circular vents inside a w × h area centred at (cx, cy). */
export function ventGrid(count: number, dia: number, w: number, h: number, cx: number, cy: number): Hole[] {
  if (count <= 0) return []
  const aspect = w / Math.max(h, 1)
  let cols = Math.max(1, Math.round(Math.sqrt(count * aspect)))
  let rows = Math.ceil(count / cols)
  while (cols * rows < count) rows++
  if (cols > count) cols = count
  const holes: Hole[] = []
  const sx = w / cols
  const sy = h / rows
  for (let i = 0; i < count; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    const inRow = r === rows - 1 ? count - r * cols : cols
    const offset = (cols - inRow) * sx * 0.5
    holes.push({ kind: 'circle', x: cx - w / 2 + sx * (c + 0.5) + offset, y: cy - h / 2 + sy * (r + 0.5), r: dia / 2 })
  }
  return holes
}

/** Largest vent count that keeps holes ≥ 1.8 diameters apart inside the area. */
export function maxVents(dia: number, w: number, h: number): number {
  const pitch = dia * 1.8
  return Math.max(0, Math.floor(w / pitch) * Math.floor(h / pitch))
}

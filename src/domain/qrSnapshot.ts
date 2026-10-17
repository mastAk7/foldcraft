import { isValidIsoDate } from './dates'
import type { Category, DateKind, EndOfLifeRoute, PackShape, ProductRecord, StorageKind } from './types'

/**
 * Versioned, compact product snapshot carried in a QR code's URL fragment (#d=…).
 *
 * The fragment never leaves the scanning device (browsers don't send it to servers). It lets a device
 * that has no access to the producer's record import the consumer-facing fields anyway. It is a static
 * copy: later producer updates are not reflected in codes that were already printed.
 *
 * Schema v1 (short keys to keep the code scannable):
 *   { v: 1, id, rv, n, b?, c, s, cl: [color, accent], z?, l?, d: [[kind, yyyy-mm-dd]],
 *     st?: { k, t, ak?, at? }, h?, pk: [[id, name, material, routes, guidance]] }
 */

export const SNAPSHOT_VERSION = 1
/** Encoded characters. Above this the QR becomes too dense to scan reliably from a phone. */
export const SNAPSHOT_MAX = 1400

const CATEGORIES: Category[] = ['Fresh produce', 'Frozen', 'Dairy & alternatives', 'Grains & pasta', 'Sauces & condiments', 'Bakery', 'Spreads', 'Household', 'Other']
const SHAPES: PackShape[] = ['bottle', 'jar', 'carton', 'box', 'bag', 'pouch', 'tub', 'loaf', 'punnet', 'clamshell']
const DATE_KINDS: DateKind[] = ['use_by', 'best_before', 'expiry', 'manufactured']
const STORAGE: StorageKind[] = ['freezer', 'refrigerator', 'pantry', 'room_temperature']
const ROUTES: EndOfLifeRoute[] = ['reuse', 'recycle', 'compost', 'return', 'general_waste']
const COLOR_RE = /^#[0-9a-f]{3,8}$/i
const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/i

interface SnapshotV1 {
  v: 1
  id: string
  rv: number
  n: string
  b?: string
  c: string
  s: string
  cl: [string, string]
  z?: string
  l?: string
  d: [string, string][]
  st?: { k: string; t: string; ak?: string; at?: string }
  h?: string
  pk: [string, string, string, string[], string][]
}

const cut = (s: string | undefined, max: number) => (s && s.length > max ? `${s.slice(0, max - 1)}…` : s)

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

export type EncodeResult = { ok: true; data: string; trimmed: boolean } | { ok: false; reason: string }

/** Encode a record (without its image) into a fragment-safe string, shortening long texts if needed. */
export function encodeSnapshot(r: ProductRecord, recordVersion: number): EncodeResult {
  const build = (textMax: number, guidance: boolean): SnapshotV1 => ({
    v: 1,
    id: r.id,
    rv: recordVersion,
    n: cut(r.name, 60)!,
    ...(r.brand ? { b: cut(r.brand, 40) } : {}),
    c: r.category,
    s: r.shape,
    cl: [r.color, r.accent],
    ...(r.size ? { z: cut(r.size, 30) } : {}),
    ...(r.batch ? { l: cut(r.batch, 30) } : {}),
    d: r.dates.map((d) => [d.kind, d.date]),
    ...(r.storage
      ? { st: { k: r.storage.kind, t: cut(r.storage.text, textMax)!, ...(r.storage.afterOpening ? { ak: r.storage.afterOpening.kind, at: cut(r.storage.afterOpening.text, textMax) } : {}) } }
      : {}),
    ...(r.handling ? { h: cut(r.handling, textMax) } : {}),
    pk: (r.packaging ?? []).map((p) => [p.id, cut(p.name, 30)!, cut(p.material, 40)!, p.routes, guidance ? cut(p.guidance, textMax)! : '']),
  })
  let trimmed = false
  for (const [max, guidance] of [[400, true], [180, true], [100, true], [100, false]] as const) {
    const data = toBase64Url(JSON.stringify(build(max, guidance)))
    if (data.length <= SNAPSHOT_MAX) return { ok: true, data, trimmed }
    trimmed = true
  }
  return { ok: false, reason: 'The record is too large to embed in a scannable code. Shorten the texts or turn the snapshot off.' }
}

export type DecodeResult = { ok: true; record: ProductRecord; recordVersion: number } | { ok: false; reason: string }

const str = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max

/** Strictly validate an embedded snapshot. Anything unexpected is rejected rather than guessed. */
export function decodeSnapshot(data: string): DecodeResult {
  if (!data || data.length > SNAPSHOT_MAX * 1.5) return { ok: false, reason: 'Snapshot is missing or too large.' }
  if (!/^[A-Za-z0-9_-]+$/.test(data)) return { ok: false, reason: 'Snapshot is not valid base64url.' }
  let raw: unknown
  try {
    raw = JSON.parse(fromBase64Url(data))
  } catch {
    return { ok: false, reason: 'Snapshot could not be decoded.' }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, reason: 'Snapshot has the wrong shape.' }
  const s = raw as Partial<SnapshotV1>
  if (s.v !== SNAPSHOT_VERSION) return { ok: false, reason: `Snapshot version ${String(s.v)} is not supported by this app.` }
  if (!str(s.id, 64) || !ID_RE.test(s.id)) return { ok: false, reason: 'Snapshot has an invalid product id.' }
  if (!str(s.n, 80) || !s.n.trim()) return { ok: false, reason: 'Snapshot has no product name.' }
  if (typeof s.rv !== 'number' || !Number.isInteger(s.rv) || s.rv < 1) return { ok: false, reason: 'Snapshot has an invalid record version.' }
  if (!CATEGORIES.includes(s.c as Category) || !SHAPES.includes(s.s as PackShape)) return { ok: false, reason: 'Snapshot has an unknown category or shape.' }
  if (!Array.isArray(s.cl) || !COLOR_RE.test(String(s.cl[0])) || !COLOR_RE.test(String(s.cl[1]))) return { ok: false, reason: 'Snapshot has invalid colours.' }
  if (!Array.isArray(s.d) || s.d.length > 6) return { ok: false, reason: 'Snapshot has invalid dates.' }
  const dates = s.d.filter((d): d is [DateKind, string] => Array.isArray(d) && DATE_KINDS.includes(d[0] as DateKind) && isValidIsoDate(d[1])).map(([kind, date]) => ({ kind, date: date.slice(0, 10) }))
  if (dates.length !== s.d.length) return { ok: false, reason: 'Snapshot has invalid dates.' }
  if (!Array.isArray(s.pk) || s.pk.length > 8) return { ok: false, reason: 'Snapshot has invalid packaging.' }
  const packaging = []
  for (const p of s.pk) {
    if (!Array.isArray(p) || !str(p[0], 40) || !str(p[1], 40) || !str(p[2], 60) || !Array.isArray(p[3]) || !str(p[4], 500)) return { ok: false, reason: 'Snapshot has invalid packaging.' }
    const routes = p[3].filter((x): x is EndOfLifeRoute => ROUTES.includes(x as EndOfLifeRoute))
    if (!routes.length || routes.length !== p[3].length) return { ok: false, reason: 'Snapshot has invalid packaging routes.' }
    packaging.push({ id: p[0], name: p[1], material: p[2], routes, guidance: p[4] || 'See the producer’s label for disposal guidance.' })
  }
  const record: ProductRecord = {
    id: s.id.toLowerCase(),
    name: s.n.trim(),
    category: s.c as Category,
    shape: s.s as PackShape,
    color: s.cl[0],
    accent: s.cl[1],
    dates,
    packaging,
    source: 'producer',
  }
  if (str(s.b, 60)) record.brand = s.b
  if (str(s.z, 40)) record.size = s.z
  if (str(s.l, 40)) record.batch = s.l
  if (str(s.h, 500)) record.handling = s.h
  if (s.st) {
    if (!STORAGE.includes(s.st.k as StorageKind) || !str(s.st.t, 500)) return { ok: false, reason: 'Snapshot has invalid storage instructions.' }
    record.storage = { kind: s.st.k as StorageKind, text: s.st.t }
    if (s.st.ak !== undefined) {
      if (!STORAGE.includes(s.st.ak as StorageKind) || !str(s.st.at, 500)) return { ok: false, reason: 'Snapshot has invalid storage instructions.' }
      record.storage.afterOpening = { kind: s.st.ak as StorageKind, text: s.st.at }
    }
  }
  return { ok: true, record, recordVersion: s.rv }
}

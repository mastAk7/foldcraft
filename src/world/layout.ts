import { currentRecommendation, LOCATION_ZONE, storageStatus, suggestedLocation, zoneForItem } from '../domain/storage'
import type { ConsumerItem, ZoneId } from '../domain/types'
import { PADS, type Pad } from './terrainData'

export type Vec3 = [number, number, number]

export const COUNTER = { x0: -3.2, x1: 3.2, z: -2.4, depth: 1.1, top: 3.05 }
export const ARRIVAL = { x: 0, z: 2.6, y: 2.08 }

function padSlots(p: Pad): Vec3[] {
  const out: Vec3[] = []
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      out.push([p.x0 + 0.5 + col * 1.75, p.h + 0.02, p.z1 - 0.4 - row * 1.75])
    }
  }
  return out
}

const SLOTS: Record<Exclude<ZoneId, 'homestead'>, Vec3[]> = {
  frostlands: padSlots(PADS.frostlands),
  coldgrove: padSlots(PADS.coldgrove),
  plains: padSlots(PADS.plains),
  workshop: padSlots(PADS.workshop),
}

const COUNTER_SLOTS: Vec3[] = [-2.4, -0.8, 0.8, 2.4].map((x) => [x, COUNTER.top, COUNTER.z] as Vec3)
const PLAZA_OVERFLOW: Vec3[] = Array.from({ length: 10 }, (_, i) => [-3.2 + (i % 5) * 1.6, 2.02, i < 5 ? -4.1 : -5.3] as Vec3)

function arrivalSlot(i: number): Vec3 {
  if (i === 0) return [ARRIVAL.x, ARRIVAL.y, ARRIVAL.z]
  const a = ((i - 1) / 6) * Math.PI * 2
  const r = i <= 6 ? 1.25 : 2.2
  return [ARRIVAL.x + Math.cos(a) * r, ARRIVAL.y, ARRIVAL.z + Math.sin(a) * r]
}

/** Fallback when a pad is full: spiral outward along the pad's front edge. */
function overflow(zone: Exclude<ZoneId, 'homestead'>, i: number): Vec3 {
  const p = PADS[zone]
  return [p.x0 + 0.5 + (i % 5) * 1.75, p.h + 0.02, p.z0 + 0.3 + Math.floor(i / 5) * 0.6]
}

export interface Placement {
  pos: Vec3
  zone: ZoneId
}

export interface Layout {
  items: Map<string, Placement>
  /** Where a mismatched item should go, keyed by item id. */
  ghosts: Map<string, Placement>
}

export function layoutWorld(items: ConsumerItem[]): Layout {
  const placed = new Map<string, Placement>()
  const visible = items.filter((i) => i.status !== 'closed').sort((a, b) => a.addedAt.localeCompare(b.addedAt))
  const used: Record<string, number> = {}
  let counterIdx = 0
  let arrivalIdx = 0

  for (const item of visible) {
    const zone = zoneForItem(item)
    if (zone === 'homestead') {
      if (item.actual === 'unconfirmed') {
        placed.set(item.id, { pos: arrivalSlot(arrivalIdx++), zone })
      } else {
        const pos = counterIdx < COUNTER_SLOTS.length ? COUNTER_SLOTS[counterIdx] : PLAZA_OVERFLOW[(counterIdx - COUNTER_SLOTS.length) % PLAZA_OVERFLOW.length]
        counterIdx++
        placed.set(item.id, { pos, zone })
      }
      continue
    }
    const i = used[zone] ?? 0
    used[zone] = i + 1
    const slots = SLOTS[zone]
    placed.set(item.id, { pos: i < slots.length ? slots[i] : overflow(zone, i - slots.length), zone })
  }

  const ghosts = new Map<string, Placement>()
  const ghostUsed: Record<string, number> = {}
  for (const item of visible) {
    if (storageStatus(item) !== 'mismatch') continue
    const rec = currentRecommendation(item)
    if (!rec) continue
    const zone = LOCATION_ZONE[suggestedLocation(rec.kind)]
    if (zone === 'homestead') continue
    const slots = SLOTS[zone]
    const taken = used[zone] ?? 0
    const g = ghostUsed[zone] ?? 0
    ghostUsed[zone] = g + 1
    const idx = Math.min(slots.length - 1, Math.max(taken, slots.length - 1 - g))
    ghosts.set(item.id, { pos: slots[idx], zone })
  }

  return { items: placed, ghosts }
}

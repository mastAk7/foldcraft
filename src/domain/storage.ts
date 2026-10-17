import type { ActualLocation, ConsumerItem, Location, StorageKind, ZoneId } from './types'

export interface ZoneInfo {
  id: ZoneId
  name: string
  /** Plain-language label shown next to the imaginative name. */
  plain: string
  blurb: string
  color: string
}

export const ZONES: Record<ZoneId, ZoneInfo> = {
  frostlands: {
    id: 'frostlands',
    name: 'Frostlands',
    plain: 'Freezer',
    blurb: 'Items you have recorded as stored in the freezer.',
    color: '#6fb8f0',
  },
  coldgrove: {
    id: 'coldgrove',
    name: 'Cold Grove',
    plain: 'Refrigerator',
    blurb: 'Items you have recorded as stored in the fridge.',
    color: '#3fbfa0',
  },
  plains: {
    id: 'plains',
    name: 'Sunlit Plains',
    plain: 'Pantry',
    blurb: 'Dry, room-temperature cupboard or pantry storage.',
    color: '#e8a93a',
  },
  homestead: {
    id: 'homestead',
    name: 'Homestead',
    plain: 'Counter & arrivals',
    blurb: 'The kitchen counter, plus newly added items whose location you have not confirmed yet.',
    color: '#b48a62',
  },
  workshop: {
    id: 'workshop',
    name: 'Circularity Workshop',
    plain: 'Reuse & sort',
    blurb: 'Finished products wait here until you record what happened to their packaging.',
    color: '#d9734a',
  },
}

export const ZONE_ORDER: ZoneId[] = ['frostlands', 'coldgrove', 'homestead', 'plains', 'workshop']

export const LOCATION_LABEL: Record<ActualLocation, string> = {
  freezer: 'Freezer',
  refrigerator: 'Refrigerator',
  pantry: 'Pantry',
  counter: 'Kitchen counter',
  unconfirmed: 'Not confirmed yet',
}

export const STORAGE_LABEL: Record<StorageKind, string> = {
  freezer: 'Freezer',
  refrigerator: 'Refrigerator',
  pantry: 'Pantry (cool, dry)',
  room_temperature: 'Room temperature',
}

export const LOCATIONS: Location[] = ['freezer', 'refrigerator', 'pantry', 'counter']

export const LOCATION_ZONE: Record<Location, ZoneId> = {
  freezer: 'frostlands',
  refrigerator: 'coldgrove',
  pantry: 'plains',
  counter: 'homestead',
}

/** The zone an item is drawn in, based only on what the user has recorded. */
export function zoneForItem(item: ConsumerItem): ZoneId {
  if (item.status === 'finished' || item.status === 'discarded') return 'workshop'
  if (item.actual === 'unconfirmed') return 'homestead'
  return LOCATION_ZONE[item.actual]
}

/** Whether a recorded location satisfies a storage recommendation. */
export function locationSatisfies(kind: StorageKind, loc: Location): boolean {
  switch (kind) {
    case 'freezer':
      return loc === 'freezer'
    case 'refrigerator':
      return loc === 'refrigerator'
    case 'pantry':
      return loc === 'pantry'
    case 'room_temperature':
      return loc === 'pantry' || loc === 'counter'
  }
}

/** The location we suggest moving to for a given recommendation. */
export function suggestedLocation(kind: StorageKind): Location {
  switch (kind) {
    case 'freezer':
      return 'freezer'
    case 'refrigerator':
      return 'refrigerator'
    default:
      return 'pantry'
  }
}

export interface Recommendation {
  kind: StorageKind
  text: string
  phase: 'before_opening' | 'after_opening'
}

/**
 * The storage recommendation that currently applies, taken only from the record.
 * Returns null when the record has no storage instructions.
 */
export function currentRecommendation(item: ConsumerItem): Recommendation | null {
  const s = item.record.storage
  if (!s) return null
  if (item.status === 'opened' && s.afterOpening) {
    return { kind: s.afterOpening.kind, text: s.afterOpening.text, phase: 'after_opening' }
  }
  return { kind: s.kind, text: s.text, phase: 'before_opening' }
}

export type StorageStatus = 'match' | 'mismatch' | 'unconfirmed' | 'unknown' | 'inactive'

export function storageStatus(item: ConsumerItem): StorageStatus {
  if (item.status !== 'unopened' && item.status !== 'opened') return 'inactive'
  if (item.actual === 'unconfirmed') return 'unconfirmed'
  const rec = currentRecommendation(item)
  if (!rec) return 'unknown'
  return locationSatisfies(rec.kind, item.actual) ? 'match' : 'mismatch'
}

export function isActive(item: ConsumerItem): boolean {
  return item.status === 'unopened' || item.status === 'opened'
}

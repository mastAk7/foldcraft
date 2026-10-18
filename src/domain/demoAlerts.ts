import { daysBetween, isoDate } from './dates'
import { isActive } from './storage'
import type { ConsumerItem, ProductDate } from './types'

/**
 * Simulated expiry alerts for presentations. They point at a real item and show its real record
 * date, but they are UI state only: nothing about the item, its record or its history changes.
 */
export type DemoScenario = 'milk' | 'fruit'

export const DEMO_SCENARIOS: DemoScenario[] = ['milk', 'fruit']

export interface DemoAlert {
  id: string
  scenario: DemoScenario
  itemId: string
  /** The item's own printed date, if its record has one. */
  date?: ProductDate
}

const matches: Record<DemoScenario, (i: ConsumerItem) => boolean> = {
  milk: (i) => /\bmilk\b/i.test(i.record.name) && !/\b(oat|soy|soya|almond|coconut|rice|plant)\b/i.test(i.record.name),
  fruit: (i) => i.record.category === 'Fresh produce',
}

/** The date an alert is about: a use-by or expiry first (safety dates), otherwise best-before. */
export function alertDate(item: ConsumerItem, today = isoDate()): ProductDate | undefined {
  const dates = item.record.dates.filter((d) => d.kind !== 'manufactured')
  const safety = dates.filter((d) => d.kind === 'use_by' || d.kind === 'expiry')
  const pool = safety.length ? safety : dates
  return [...pool].sort((a, b) => daysBetween(today, a.date) - daysBetween(today, b.date))[0]
}

/** The in-use item a scenario is about, preferring the one whose date is closest. */
export function findDemoTarget(scenario: DemoScenario, items: ConsumerItem[], today = isoDate()): { item: ConsumerItem; date?: ProductDate } | null {
  const candidates = items.filter((i) => isActive(i) && matches[scenario](i)).map((item) => ({ item, date: alertDate(item, today) }))
  if (!candidates.length) return null
  const far = Number.MAX_SAFE_INTEGER
  candidates.sort((a, b) => (a.date ? daysBetween(today, a.date.date) : far) - (b.date ? daysBetween(today, b.date.date) : far))
  return candidates[0]
}

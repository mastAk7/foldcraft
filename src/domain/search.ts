import { LOCATION_LABEL, ZONES, zoneForItem } from './storage'
import type { ConsumerItem } from './types'

/**
 * Word matching shared by "My items" search and Before You Buy.
 *
 * Only whole words (or a simple plural) count. Numbers and sizes ("1kg", "500 ml", "2") are ignored,
 * so two items never match just because they share a pack size, and a query word never matches a
 * shorter word it happens to start with ("oatmeal" is not "oat").
 */

const UNITS = ['g', 'kg', 'mg', 'ml', 'l', 'cl', 'dl', 'oz', 'lb', 'pk', 'pc', 'pcs', 'x']
const SIZE_RE = new RegExp(`^\\d+(\\.\\d+)?(${UNITS.join('|')})?$`)

export function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !SIZE_RE.test(t) && !UNITS.includes(t))
}

/** A word plus its possible singular forms ("tomatoes" → tomatoe, tomato). */
function forms(w: string): string[] {
  const out = [w]
  if (w.length > 3 && w.endsWith('s')) out.push(w.slice(0, -1))
  if (w.length > 4 && w.endsWith('es')) out.push(w.slice(0, -2))
  return out
}

/** Same word, allowing a simple plural on either side ("pea" / "peas", "tomato" / "tomatoes"). */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  const fb = forms(b)
  return forms(a).some((f) => fb.includes(f))
}

/** True when any query word is one of `text`'s words (no prefixes, no sizes). */
export function sharesWord(query: string, text: string): boolean {
  const t = words(text)
  return words(query).some((w) => t.some((n) => sameWord(w, n)))
}

/** Brand as shown to people, without the "(sample)" marker so it can't match a search for "sample". */
export const plainBrand = (brand?: string) => brand?.replace(/\(sample\)/i, '').trim() || undefined

/**
 * True when every query word appears among `text`'s words. With `prefixLast`, the final query word
 * may be an unfinished prefix of a word (search-as-you-type), once it has at least 3 letters.
 */
export function matchesWords(query: string, text: string, prefixLast = false): boolean {
  const q = words(query)
  if (q.length === 0) return false
  const t = words(text)
  return q.every((w, i) => t.some((n) => sameWord(w, n) || (prefixLast && i === q.length - 1 && w.length >= 3 && n.startsWith(w))))
}

export function itemStatusLabel(item: ConsumerItem): string {
  switch (item.status) {
    case 'unopened':
      return 'Unopened'
    case 'opened':
      return 'Opened'
    case 'finished':
      return 'Used up'
    case 'discarded':
      return 'Discarded'
    case 'closed':
      return 'Finished'
  }
}

/** Text a person might search an item by: what it is, who made it, where it is and its state. */
export function searchText(item: ConsumerItem): string {
  const r = item.record
  const zone = ZONES[zoneForItem(item)]
  return [r.name, plainBrand(r.brand), r.category, LOCATION_LABEL[item.actual], zone.name, zone.plain, itemStatusLabel(item)]
    .filter(Boolean)
    .join(' ')
}

export function searchItems(query: string, items: ConsumerItem[]): ConsumerItem[] {
  if (!query.trim()) return items
  // A query made only of numbers or sizes ("1kg") matches nothing rather than everything.
  if (!words(query).length) return []
  return items.filter((i) => matchesWords(query, searchText(i), true))
}

import type { DateKind } from './types'

const DAY = 86_400_000

/** Local calendar date as yyyy-mm-dd. */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return isoDate(new Date(y, m - 1, d + days))
}

function startOf(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((startOf(to) - startOf(from)) / DAY)
}

export function isValidIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(s)) return false
  return !Number.isNaN(startOf(s))
}

export const DATE_KIND_LABEL: Record<DateKind, string> = {
  use_by: 'Use by',
  best_before: 'Best before',
  expiry: 'Expiry',
  manufactured: 'Manufactured',
}

/** What a date type means, so we never collapse them into a generic "freshness". */
export const DATE_KIND_MEANING: Record<DateKind, string> = {
  use_by: 'A safety date set by the producer. Follow the label.',
  best_before: 'A quality date. The product may still be fine after it, so check it before deciding.',
  expiry: 'The date after which the producer does not recommend use.',
  manufactured: 'When the product was made.',
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function relativeDays(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 0) return `in ${days} days`
  return `${-days} days ago`
}

export function timeAgo(isoDateTime: string, now = Date.now()): string {
  const diff = now - new Date(isoDateTime).getTime()
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return `${d} d ago`
}

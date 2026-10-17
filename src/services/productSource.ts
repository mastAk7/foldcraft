import { CATALOGUE, type CatalogueEntry } from '../data/catalogue'
import { addDays, isoDate } from '../domain/dates'
import { parseQrPayload } from '../domain/qr'
import type { ProductRecord } from '../domain/types'
import { CompositeSource, registry } from './registry'

export type ResolveOrigin = 'registry' | 'snapshot' | 'catalogue'

export type ResolveResult =
  | { ok: true; record: ProductRecord; origin?: ResolveOrigin; recordVersion?: number; note?: string }
  | { ok: false; reason: 'unsupported' | 'not_found' | 'empty' | 'invalid_snapshot'; raw: string; detail?: string }

/**
 * Where product records come from: producer-published records (Producer Studio registry), the
 * snapshot embedded in a QR code, then the local sample catalogue. A producer API could implement
 * the same interface later. The world never talks to this directly.
 */
export interface ProductSource {
  resolveQr(payload: string): Promise<ResolveResult>
  get(id: string): Promise<ProductRecord | null>
  list(): Promise<ProductRecord[]>
}

function materialise(entry: CatalogueEntry, today: string, batch?: string): ProductRecord {
  const { dateOffsets, ...rest } = entry
  return {
    ...structuredClone(rest),
    batch: batch ?? rest.batch,
    dates: dateOffsets.map((d) => ({ kind: d.kind, date: addDays(today, d.days) })),
    source: 'sample',
  }
}

export class LocalCatalogueSource implements ProductSource {
  private readonly entries: CatalogueEntry[]
  constructor(entries: CatalogueEntry[] = CATALOGUE) {
    this.entries = entries
  }

  async resolveQr(payload: string): Promise<ResolveResult> {
    const parsed = parseQrPayload(payload)
    if (!parsed.ok) return { ok: false, reason: parsed.reason, raw: parsed.raw }
    const entry = this.entries.find((e) => e.id === parsed.productId)
    if (!entry) return { ok: false, reason: 'not_found', raw: payload }
    return { ok: true, record: materialise(entry, isoDate(), parsed.batch), origin: 'catalogue' }
  }

  async get(id: string): Promise<ProductRecord | null> {
    const entry = this.entries.find((e) => e.id === id)
    return entry ? materialise(entry, isoDate()) : null
  }

  async list(): Promise<ProductRecord[]> {
    const today = isoDate()
    return this.entries.map((e) => materialise(e, today))
  }

  /** Synchronous access used for seeding the demo world. */
  getSync(id: string, today = isoDate()): ProductRecord | null {
    const entry = this.entries.find((e) => e.id === id)
    return entry ? materialise(entry, today) : null
  }
}

/** The sample catalogue on its own (used to seed the demo world synchronously). */
export const catalogueSource = new LocalCatalogueSource()

export const productSource: ProductSource = new CompositeSource(registry, catalogueSource)

/** True when an id is taken by the sample catalogue. */
export const isCatalogueId = (id: string) => CATALOGUE.some((e) => e.id === id)

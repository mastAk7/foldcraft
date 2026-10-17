import { CATALOGUE, type CatalogueEntry } from '../data/catalogue'
import { addDays, isoDate } from '../domain/dates'
import { parseQrPayload } from '../domain/qr'
import type { ProductRecord } from '../domain/types'

export type ResolveResult =
  | { ok: true; record: ProductRecord }
  | { ok: false; reason: 'unsupported' | 'not_found' | 'empty'; raw: string }

/**
 * Where product records come from. Today: a local sample catalogue.
 * Later: a producer API that resolves the same QR payloads. The world never talks to this directly.
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
    return { ok: true, record: materialise(entry, isoDate(), parsed.batch) }
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

export const productSource = new LocalCatalogueSource()

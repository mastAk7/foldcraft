import { decodeSnapshot } from '../domain/qrSnapshot'
import { parseQrPayload } from '../domain/qr'
import type { ProductRecord } from '../domain/types'
import { safeStorage, sanitizeRecord } from './persistence'
import type { ProductSource, ResolveResult } from './productSource'

/**
 * Published product passports.
 *
 * There is no backend in this prototype: the registry is a localStorage key shared by the Producer
 * Studio (writes on publish) and the consumer world (reads on scan). It is therefore only shared
 * between tabs of the same browser profile. Other devices can import a record from the snapshot
 * embedded in the QR code instead.
 */
export const REGISTRY_KEY = 'foldcraft:registry'
export const REGISTRY_EVENT = 'foldcraft:registry-changed'

export interface PublishedPassport {
  record: ProductRecord
  recordVersion: number
  lotCode?: string
  designVersion: number
  publishedAt: string
  /** Plain summary of the packaging design and its estimates, for the passport page. */
  summary?: { template: string; outerMm: string; material: string; massG: number; tests: { test: string; risk: string; headline: string; method: string; basis?: string; modelVersion?: string; conditions?: string }[] }
}

interface RegistryFile {
  v: 1
  products: Record<string, PublishedPassport[]>
}

export interface KeyValue {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

export class Registry {
  private readonly store: KeyValue
  constructor(store: KeyValue = safeStorage) {
    this.store = store
  }

  read(): RegistryFile {
    try {
      const raw = JSON.parse(this.store.getItem(REGISTRY_KEY) ?? 'null')
      if (!raw || raw.v !== 1 || typeof raw.products !== 'object') return { v: 1, products: {} }
      const products: RegistryFile['products'] = {}
      for (const [id, list] of Object.entries(raw.products as Record<string, unknown>)) {
        if (!Array.isArray(list)) continue
        const clean = list
          .map((p): PublishedPassport | null => {
            const record = sanitizeRecord((p as PublishedPassport)?.record)
            return record ? { ...(p as PublishedPassport), record: { ...record, source: 'producer' } } : null
          })
          .filter((p): p is PublishedPassport => !!p && Number.isInteger(p.recordVersion))
        if (clean.length) products[id] = clean
      }
      return { v: 1, products }
    } catch {
      return { v: 1, products: {} }
    }
  }

  /** Append a new published version. Returns false if storage refused it (e.g. quota). */
  publish(p: PublishedPassport): boolean {
    const file = this.read()
    const list = file.products[p.record.id] ?? []
    file.products[p.record.id] = [...list.filter((x) => x.recordVersion !== p.recordVersion), p].slice(-20)
    const text = JSON.stringify(file)
    this.store.setItem(REGISTRY_KEY, text)
    const ok = this.store.getItem(REGISTRY_KEY) === text
    if (ok && typeof window !== 'undefined') window.dispatchEvent(new Event(REGISTRY_EVENT))
    return ok
  }

  history(productId: string): PublishedPassport[] {
    return this.read().products[productId] ?? []
  }

  latest(productId: string, lot?: string): PublishedPassport | null {
    const list = this.history(productId)
    if (!list.length) return null
    const byVersion = [...list].sort((a, b) => b.recordVersion - a.recordVersion)
    return (lot && byVersion.find((p) => p.lotCode === lot)) || byVersion[0]
  }

  all(): PublishedPassport[] {
    return Object.keys(this.read().products)
      .map((id) => this.latest(id))
      .filter((p): p is PublishedPassport => !!p)
  }
}

export const registry = new Registry()

/** Producer records first, then the embedded QR snapshot, then the fallback source (sample catalogue). */
export class CompositeSource implements ProductSource {
  private readonly reg: Registry
  private readonly fallback: ProductSource
  constructor(reg: Registry, fallback: ProductSource) {
    this.reg = reg
    this.fallback = fallback
  }

  async resolveQr(payload: string): Promise<ResolveResult> {
    const parsed = parseQrPayload(payload)
    if (!parsed.ok) return this.fallback.resolveQr(payload)
    const pub = this.reg.latest(parsed.productId, parsed.batch)
    if (pub) {
      const record = structuredClone(pub.record)
      if (parsed.batch && pub.lotCode !== parsed.batch) record.batch = parsed.batch
      const older = parsed.recordVersion && parsed.recordVersion < pub.recordVersion
      return {
        ok: true,
        record,
        origin: 'registry',
        recordVersion: pub.recordVersion,
        note: older ? `This code was printed from record v${parsed.recordVersion}; showing the producer’s current v${pub.recordVersion}.` : undefined,
      }
    }
    let snapshotError: string | undefined
    if (parsed.snapshot) {
      const snap = decodeSnapshot(parsed.snapshot)
      if (snap.ok && snap.record.id === parsed.productId) {
        return {
          ok: true,
          record: snap.record,
          origin: 'snapshot',
          recordVersion: snap.recordVersion,
          note: `Imported from the copy embedded in the code (record v${snap.recordVersion}). It may be older than the producer’s current record.`,
        }
      }
      snapshotError = snap.ok ? 'The embedded snapshot belongs to a different product.' : snap.reason
    }
    const fb = await this.fallback.resolveQr(payload)
    if (!fb.ok && snapshotError) return { ok: false, reason: 'invalid_snapshot', raw: payload, detail: snapshotError }
    return fb.ok ? { ...fb, origin: fb.origin ?? 'catalogue' } : fb
  }

  async get(id: string): Promise<ProductRecord | null> {
    const pub = this.reg.latest(id)
    return pub ? structuredClone(pub.record) : this.fallback.get(id)
  }

  async list(): Promise<ProductRecord[]> {
    const published = this.reg.all().map((p) => structuredClone(p.record))
    const ids = new Set(published.map((r) => r.id))
    return [...published, ...(await this.fallback.list()).filter((r) => !ids.has(r.id))]
  }
}

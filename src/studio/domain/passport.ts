import { formatDate } from '../../domain/dates'
import type { Category, PackagingComponent, PackShape, ProductRecord, StorageInstruction, StorageKind } from '../../domain/types'
import type { Analysis } from './analysis'
import { FILMS, MATERIALS } from './materials'
import { TEMPLATE_INFO } from './params'
import { PRODUCE } from './produce'
import { describeSettings } from './runs'
import { SIM_MODEL_VERSION, type BreakReport } from './sims'
import type { Batch, BriefCategory, DesignParams, MaterialId, ProductBrief, Risk, TemplateId } from './types'

/**
 * Derives the consumer-facing ProductRecord (the consumer app's own type) from the brief, the final
 * design and a batch. Nothing is invented: absent brief fields stay absent in the record.
 */

const CATEGORY_MAP: Record<BriefCategory, Category> = {
  Berries: 'Fresh produce',
  'Vine fruit': 'Fresh produce',
  'Pome fruit': 'Fresh produce',
  'Tropical fruit': 'Fresh produce',
  Vegetables: 'Fresh produce',
  'Other food': 'Other',
  'Non-food': 'Household',
}

const SHAPE_MAP: Record<TemplateId, PackShape> = {
  folding_carton: 'box',
  produce_tray: 'punnet',
  clamshell: 'clamshell',
  compartment_tray: 'punnet',
}

/** Recommended storage from the stated temperature range (or cold chain), unless overridden. */
export function derivedStorageKind(brief: ProductBrief): StorageKind {
  const m = brief.metadata
  if (m.storageKindOverride) return m.storageKindOverride
  if (m.tempMaxC !== undefined) {
    if (m.tempMaxC <= -15) return 'freezer'
    if (m.tempMaxC <= 8) return 'refrigerator'
    return 'room_temperature'
  }
  return m.coldChain === 'frozen' ? 'freezer' : m.coldChain === 'chilled' ? 'refrigerator' : 'room_temperature'
}

export function storageRule(brief: ProductBrief): string {
  const m = brief.metadata
  if (m.storageKindOverride) return 'Set by the producer (override).'
  if (m.tempMaxC !== undefined) return `From the stated range ${m.tempMinC ?? '?'}–${m.tempMaxC} °C: ≤ −15 °C freezer, ≤ 8 °C refrigerator, otherwise room temperature.`
  return `From the cold-chain setting (${m.coldChain}).`
}

function storageOf(brief: ProductBrief): StorageInstruction | undefined {
  const m = brief.metadata
  const text = m.storageText.trim()
  if (!text) return undefined
  const kind = derivedStorageKind(brief)
  const s: StorageInstruction = { kind, text }
  if (m.afterOpeningText?.trim()) s.afterOpening = { kind: kind === 'room_temperature' || kind === 'pantry' ? 'refrigerator' : kind, text: m.afterOpeningText.trim() }
  return s
}

function componentRoutes(material: MaterialId | 'pet_film' | 'pp_film', template: TemplateId) {
  if (material === 'pet_film' || material === 'pp_film') return { routes: FILMS[material].routes, guidance: FILMS[material].guidance, label: FILMS[material].name }
  const m = MATERIALS[material]
  const rigid = template !== 'folding_carton' && m.kind === 'plastic'
  return {
    routes: rigid ? (['reuse', ...m.routes] as PackagingComponent['routes']) : m.routes,
    guidance: m.guidance,
    label: m.name,
    reuseIdea: rigid ? 'Rinse and reuse for storing small items or as a seed tray.' : undefined,
  }
}

export function packagingOf(params: DesignParams, a: Analysis): PackagingComponent[] {
  const mixed = new Set(a.pkg.components.map((c) => c.material)).size > 1
  return a.pkg.components.map((c) => {
    const r = componentRoutes(c.material, params.template)
    return {
      id: c.id,
      name: c.name,
      material: r.label,
      routes: r.routes,
      guidance: r.guidance + (mixed ? ' Separate from the other parts before sorting.' : ''),
      ...(r.reuseIdea ? { reuseIdea: r.reuseIdea } : {}),
    }
  })
}

export function deriveRecord(brief: ProductBrief, params: DesignParams, a: Analysis, batch?: Pick<Batch, 'lotCode' | 'dates' | 'packedOn'>): ProductRecord {
  const id = brief.identification
  const meta = brief.metadata
  const produce = PRODUCE[id.produce] ?? PRODUCE.generic
  const handlingParts = [meta.handling?.trim(), meta.warnings?.trim(), batch?.packedOn ? `Packed on ${formatDate(batch.packedOn)}.` : undefined].filter(Boolean)
  const net = id.unitWeightG * id.unitsPerPackage
  const record: ProductRecord = {
    id: meta.productId,
    name: id.name.trim(),
    category: CATEGORY_MAP[id.category] ?? 'Other',
    shape: SHAPE_MAP[params.template],
    color: params.template === 'folding_carton' ? params.color : produce.colors[0],
    accent: params.template === 'folding_carton' ? params.accent : MATERIALS[params.material].colour,
    size: `${id.unitsPerPackage > 1 ? `${id.unitsPerPackage} pcs · ` : ''}≈${net >= 1000 ? `${(net / 1000).toFixed(1)} kg` : `${Math.round(net)} g`}`,
    dates: batch?.dates ?? meta.dates,
    packaging: packagingOf(params, a),
    source: 'producer',
  }
  if (meta.brand?.trim()) record.brand = meta.brand.trim()
  if (batch?.lotCode ?? meta.lotId) record.batch = batch?.lotCode ?? meta.lotId
  const storage = storageOf(brief)
  if (storage) record.storage = storage
  if (handlingParts.length) record.handling = handlingParts.join(' ')
  if (id.image) record.image = id.image
  return record
}

export interface PassportSummary {
  template: string
  outerMm: string
  material: string
  wallMm: number
  massG: number
  perPack: number
  /** Model estimates computed from the design when the record was published, not recorded Simulation Lab runs. */
  tests: { test: string; risk: Risk; headline: string; method: string; basis: 'estimate_at_publish'; modelVersion: string; conditions: string }[]
}

export function passportSummary(params: DesignParams, a: Analysis, report?: BreakReport): PassportSummary {
  return {
    template: TEMPLATE_INFO[params.template].name,
    outerMm: `${Math.round(a.pkg.outer.l)} × ${Math.round(a.pkg.outer.w)} × ${Math.round(a.pkg.outer.h)} mm`,
    material: MATERIALS[params.material].name,
    wallMm: params.wallMm,
    massG: a.cost.massG,
    perPack: a.cost.perPack,
    tests: report
      ? [report.drop.result, report.stack.result, report.vibration.result].map((r) => ({ test: r.test, risk: r.risk, headline: r.headline, method: r.method, basis: 'estimate_at_publish' as const, modelVersion: SIM_MODEL_VERSION, conditions: describeSettings(r.test, report.conditions[r.test]) }))
      : [],
  }
}

/** Stable string used to detect whether the derived record differs from what was published. */
export function fingerprint(r: ProductRecord): string {
  const rest: Partial<ProductRecord> = { ...r }
  delete rest.image
  return JSON.stringify(rest) + (r.image ? `|img:${r.image.length}` : '')
}

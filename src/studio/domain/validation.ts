import { isValidIsoDate } from '../../domain/dates'
import { MATERIALS, TEMPLATE_MATERIALS } from './materials'
import type { BriefStage, ProductBrief } from './types'

export interface BriefIssue {
  stage: Exclude<BriefStage, 'review'>
  field: string
  level: 'error' | 'warning'
  message: string
}

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/

/**
 * Brief validation. Errors block design generation; warnings are shown in review.
 * Fields that don't apply to a category are never required.
 */
export function validateBrief(b: ProductBrief, opts: { takenIds?: (id: string) => boolean } = {}): BriefIssue[] {
  const out: BriefIssue[] = []
  const id = b.identification
  const m = b.metadata
  const r = b.requirements
  const err = (stage: BriefIssue['stage'], field: string, message: string) => out.push({ stage, field, level: 'error', message })
  const warn = (stage: BriefIssue['stage'], field: string, message: string) => out.push({ stage, field, level: 'warning', message })
  const pos = (v: number) => Number.isFinite(v) && v > 0

  /* A — identification */
  if (!id.name.trim()) err('A', 'name', 'Product name is required.')
  for (const k of ['l', 'w', 'h'] as const) {
    if (!pos(id.unitDims[k])) err('A', `unitDims.${k}`, 'Unit dimensions must be positive numbers (mm).')
    else if (id.unitDims[k] > 300) err('A', `unitDims.${k}`, 'Unit dimensions above 300 mm are outside the supported templates.')
  }
  if (!pos(id.unitWeightG)) err('A', 'unitWeightG', 'Unit weight must be a positive number (g).')
  if (!Number.isInteger(id.unitsPerPackage) || id.unitsPerPackage < 1 || id.unitsPerPackage > 60) err('A', 'unitsPerPackage', 'Units per package must be a whole number from 1 to 60.')
  if (!Number.isInteger(id.batchPackages) || id.batchPackages < 1) err('A', 'batchPackages', 'Production quantity must be at least 1 package.')
  if (pos(id.unitWeightG) && id.unitWeightG * id.unitsPerPackage > 5000) warn('A', 'unitWeightG', 'More than 5 kg per package: these templates are intended for retail packs.')

  /* B — metadata */
  if (!ID_RE.test(m.productId)) err('B', 'productId', 'Product ID: lowercase letters, numbers and hyphens, 2–64 characters.')
  else if (opts.takenIds?.(m.productId)) err('B', 'productId', 'This product ID is already used by a sample catalogue product.')
  if (m.tempMinC !== undefined && m.tempMaxC !== undefined && m.tempMinC > m.tempMaxC) err('B', 'tempMinC', 'Minimum temperature is above the maximum.')
  if (m.humidityMinPct !== undefined && m.humidityMaxPct !== undefined && m.humidityMinPct > m.humidityMaxPct) err('B', 'humidityMinPct', 'Minimum humidity is above the maximum.')
  for (const h of [m.humidityMinPct, m.humidityMaxPct]) if (h !== undefined && (h < 0 || h > 100)) err('B', 'humidityMaxPct', 'Humidity must be 0–100%.')
  if (m.coldChain === 'frozen' && m.tempMaxC !== undefined && m.tempMaxC > -15) err('B', 'tempMaxC', 'Frozen cold chain but the stated maximum is above −15 °C.')
  if (m.coldChain === 'ambient' && m.tempMaxC !== undefined && m.tempMaxC <= 8) warn('B', 'coldChain', 'The temperature range is refrigerated but the cold chain is set to ambient.')
  if (m.packedOn && !isValidIsoDate(m.packedOn)) err('B', 'packedOn', 'Packing date is not a valid date.')
  for (const d of m.dates) {
    if (!isValidIsoDate(d.date)) err('B', 'dates', 'Every date needs a valid calendar date.')
    else if (m.packedOn && isValidIsoDate(m.packedOn) && d.kind !== 'manufactured' && d.date < m.packedOn) err('B', 'dates', 'A best-before/use-by/expiry date is earlier than the packing date.')
  }
  if (!m.storageText.trim()) warn('B', 'storageText', 'No storage instructions: consumers will see “not provided”.')
  if (m.shelfLifeDays !== undefined && (!Number.isFinite(m.shelfLifeDays) || m.shelfLifeDays < 0)) err('B', 'shelfLifeDays', 'Shelf life must be zero or more days.')

  /* C — requirements */
  if (!r.permittedMaterials.length) err('C', 'permittedMaterials', 'Choose at least one permitted material.')
  else if (!r.permittedMaterials.some((x) => TEMPLATE_MATERIALS[r.template].includes(x)))
    err('C', 'permittedMaterials', `None of the permitted materials can be used for this template. Supported: ${TEMPLATE_MATERIALS[r.template].map((x) => MATERIALS[x].short).join(', ')}.`)
  if (!Number.isInteger(r.stackLayers) || r.stackLayers < 1 || r.stackLayers > 12) err('C', 'stackLayers', 'Stack layers must be a whole number from 1 to 12.')
  if (r.wallMm !== undefined && !pos(r.wallMm)) err('C', 'wallMm', 'Wall thickness must be positive.')
  if (r.targetCostPerPack !== undefined && !(r.targetCostPerPack >= 0)) err('C', 'targetCostPerPack', 'Target cost must be zero or more.')
  const t = r.targetDims
  if (t) {
    const u = id.unitDims
    if (t.h !== undefined && pos(u.h) && t.h < u.h) err('C', 'targetDims', `Target height ${t.h} mm is lower than one unit (${u.h} mm).`)
    if (t.l !== undefined && t.w !== undefined && pos(u.l) && pos(u.w)) {
      const perLayer = Math.max(Math.floor(t.l / u.l) * Math.floor(t.w / u.w), Math.floor(t.l / u.w) * Math.floor(t.w / u.l))
      const layers = t.h !== undefined && pos(u.h) ? Math.max(1, Math.floor(t.h / u.h)) : 1
      if (perLayer * layers < id.unitsPerPackage) err('C', 'targetDims', `Target size holds at most ${perLayer * layers} of ${id.unitsPerPackage} units.`)
    }
  }
  if (r.monoMaterial && r.template === 'folding_carton' && r.ventilation === 'high') warn('C', 'ventilation', 'Folding cartons have no vent openings in this studio.')
  if (r.template === 'folding_carton' && r.ventilation === 'high') warn('C', 'ventilation', 'High ventilation is not supported by the folding carton template.')
  if (m.coldChain !== 'ambient' && r.permittedMaterials.length && r.permittedMaterials.every((x) => MATERIALS[x].kind === 'fibre'))
    warn('C', 'permittedMaterials', `Only fibre materials are permitted for ${m.coldChain} storage; they lose stiffness when cold and damp. Check the stack test.`)
  if (r.preferFibre && r.permittedMaterials.length && r.permittedMaterials.every((x) => MATERIALS[x].kind === 'plastic'))
    warn('C', 'preferFibre', 'Fibre is preferred, but only plastics are permitted.')
  return out
}

export const stageIssues = (issues: BriefIssue[], stage: BriefIssue['stage']) => issues.filter((i) => i.stage === stage)
export const hasErrors = (issues: BriefIssue[]) => issues.some((i) => i.level === 'error')

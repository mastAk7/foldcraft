import { estimateCost } from './cost'
import { MATERIALS } from './materials'
import { TEMPLATE_INFO } from './params'
import type { SimContext } from './sims'
import { buildPackage, type BuiltPackage, type ViewState } from './templates'
import type { AssumptionOverrides, CostEstimate, DesignParams, ProductBrief, Suggestion } from './types'

export interface Analysis {
  pkg: BuiltPackage
  cost: CostEstimate
  ctx: SimContext
}

export function contentsOf(brief: ProductBrief) {
  return { unit: brief.identification.unitDims, units: brief.identification.unitsPerPackage }
}

/** Geometry + cost + simulation context for one parameter set. Pure; memoise in the UI. */
export function analyse(params: DesignParams, brief: ProductBrief, assumptions: AssumptionOverrides = {}, view: ViewState = { open: 0 }): Analysis {
  const pkg = buildPackage(params, contentsOf(brief), view)
  const cost = estimateCost(params, pkg, brief.identification.batchPackages, assumptions)
  const ctx: SimContext = {
    params,
    pkg,
    packMassG: cost.massG,
    produce: brief.identification.produce,
    fragility: brief.identification.fragility,
    unitWeightG: brief.identification.unitWeightG,
    unit: brief.identification.unitDims,
    units: brief.identification.unitsPerPackage,
    coldChain: brief.metadata.coldChain,
    humidityMaxPct: brief.metadata.humidityMaxPct,
    transport: brief.requirements.transport,
    stackLayers: brief.requirements.stackLayers,
  }
  return { pkg, cost, ctx }
}

export interface DesignNote {
  id: string
  level: 'error' | 'warning' | 'info'
  text: string
  suggestion?: Suggestion
}

/**
 * Deterministic design rules evaluated on every change (no simulation needed).
 * Each note cites the parameter values it is based on.
 */
export function designNotes(params: DesignParams, brief: ProductBrief, a: Analysis): DesignNote[] {
  const notes: DesignNote[] = []
  const { arrangement: arr } = a.pkg
  const req = brief.requirements
  const mat = MATERIALS[params.material]
  const unit = brief.identification.unitDims

  if (!arr.fits) notes.push({ id: 'fit', level: 'error', text: arr.message ?? 'Contents do not fit.', suggestion: fitSuggestion(params, brief, a) })
  else if (arr.voidPct > 45) {
    const s = fitSuggestion(params, brief, a)
    notes.push({ id: 'void', level: 'warning', text: `About ${arr.voidPct.toFixed(0)}% of the inner volume is empty (by bounding boxes). Loose units can move and the pack uses more material than needed.`, suggestion: s })
  }
  if (arr.fits && arr.clearance.y > unit.h * 0.6)
    notes.push({ id: 'headspace', level: 'info', text: `Headspace of ${arr.clearance.y.toFixed(0)} mm above the contents. Reducing height saves material and limits bouncing.`, suggestion: { id: 'trim-height', title: `Height ${Math.round(params.height - arr.clearance.y + 6)} mm`, reason: 'Leaves 6 mm headspace.', patch: { height: Math.round(params.height - arr.clearance.y + 6) } } })

  if (req.monoMaterial && !a.cost.monoMaterial)
    notes.push({ id: 'mono', level: 'warning', text: 'The brief prefers a single material stream, but this design combines different materials (e.g. film or insert).', suggestion: monoSuggestion(params) })
  if (req.preferFibre && mat.kind !== 'fibre')
    notes.push({ id: 'fibre', level: 'info', text: `The brief prefers fibre-based materials; ${mat.short} is a plastic.` })
  if (brief.metadata.coldChain !== 'ambient' && mat.kind === 'fibre')
    notes.push({ id: 'cold', level: 'info', text: `${mat.short} loses stiffness in ${brief.metadata.coldChain} storage (factor ${brief.metadata.coldChain === 'frozen' ? mat.frozenFactor : mat.chilledFactor} in the stack model). Run the stack test.` })
  const vented = 'ventCount' in params ? params.ventCount : 0
  if (req.ventilation === 'high' && params.template === 'folding_carton')
    notes.push({ id: 'vent-carton', level: 'warning', text: 'High ventilation was requested, but the folding carton template has no vent openings. Consider a tray or clamshell.', suggestion: { id: 'to-tray', title: 'Switch to a produce tray', reason: 'Trays support vent holes.', patch: { template: 'produce_tray' } } })
  else if (req.ventilation !== 'none' && 'ventCount' in params && vented === 0)
    notes.push({ id: 'vent-none', level: 'warning', text: 'The brief asks for ventilation but this design has no vent holes.', suggestion: { id: 'vents', title: 'Add 8 vents', reason: 'Matches a standard ventilation request.', patch: { ventCount: 8 } } })
  if ('ventCount' in params && params.ventCount > 0) {
    const openPct = (params.ventCount * Math.PI * (params.ventDiaMm / 2) ** 2) / (params.length * params.width) * 100
    if (req.ventilation === 'high' && openPct < 2)
      notes.push({ id: 'vent-low', level: 'info', text: `Vent openings are ${openPct.toFixed(1)}% of the footprint; high ventilation usually needs more open area.`, suggestion: { id: 'vents-more', title: 'More vents', reason: 'Raise open area.', patch: { ventCount: Math.min(params.ventCount + 6, 40) } } })
  }
  if (req.targetCostPerPack && a.cost.perPack > req.targetCostPerPack)
    notes.push({ id: 'cost', level: 'warning', text: `Estimated €${a.cost.perPack.toFixed(3)} per pack is above the €${req.targetCostPerPack.toFixed(3)} target (indicative prices).` })
  if (req.targetDims) {
    const t = req.targetDims
    const over = (['l', 'w', 'h'] as const).filter((k) => t[k] && a.pkg.outer[k] > (t[k] as number) + 0.5)
    if (over.length) notes.push({ id: 'target', level: 'info', text: `Outer size exceeds the target in ${over.map((k) => ({ l: 'length', w: 'width', h: 'height' })[k]).join(', ')}.` })
  }
  if (params.template === 'folding_carton' && brief.identification.fragility === 'high' && params.insert === 'none')
    notes.push({ id: 'fragile', level: 'info', text: 'Fragile produce in a carton without an insert relies on the carton walls alone.', suggestion: { id: 'cells', title: 'Add a cell insert', reason: 'Keeps units apart.', patch: { insert: 'cells' } } })
  notes.push({ id: 'dieline', level: 'info', text: TEMPLATE_INFO[params.template].dieline === 'concept' ? 'This template has a generated flat blank (concept dieline). It is not validated for production tooling.' : 'Formed template: 3D geometry only. No flat layout is exported for it.' })
  return notes
}

/** Smallest outer size that holds the contents with ~4 mm clearance per side (same template). */
export function fitSuggestion(params: DesignParams, brief: ProductBrief, a: Analysis): Suggestion | undefined {
  const u = brief.identification.unitDims
  const n = brief.identification.unitsPerPackage
  const cols = Math.max(1, Math.ceil(Math.sqrt((n * u.w) / u.l)))
  const rows = Math.max(1, Math.ceil(n / cols))
  const wall = params.wallMm * 2
  const drift = a.pkg.outer.l - a.pkg.inner.l
  const driftW = a.pkg.outer.w - a.pkg.inner.w
  let length = Math.round(Math.max(cols * u.l, rows * u.w) + 8 + Math.max(wall, drift))
  let width = Math.round(Math.min(cols * u.l, rows * u.w) + 8 + Math.max(wall, driftW))
  if (width > length) [length, width] = [width, length]
  const height = Math.round(u.h + 6 + (params.template === 'folding_carton' ? wall : params.wallMm) + ('insert' in params && params.insert === 'pad' ? 4 : 0))
  if (Math.abs(length - params.length) < 2 && Math.abs(width - params.width) < 2 && Math.abs(height - params.height) < 2) return undefined
  return { id: 'fit-size', title: `Resize to ${length} × ${width} × ${height} mm`, reason: `Fits ${n} units in one layer of ${cols} × ${rows} with about 4 mm clearance.`, patch: { length: clamp(length, 60, 400), width: clamp(width, 40, 300), height: clamp(height, 20, 250) } }
}

function monoSuggestion(p: DesignParams): Suggestion | undefined {
  if (p.template === 'folding_carton' && p.window) return { id: 'no-window', title: 'Remove the window', reason: 'The PET window film is a second material.', patch: { window: false } }
  if ('filmLid' in p && p.filmLid) return { id: 'no-film', title: 'Remove lidding film', reason: 'Film is a second material stream.', patch: { filmLid: false } }
  if ('insert' in p && p.insert === 'pad' && MATERIALS[p.material].kind === 'plastic') return { id: 'no-pad', title: 'Remove the fibre pad', reason: 'A pulp pad in a PET tray is a second material.', patch: { insert: 'none' } }
  return undefined
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

import { estimateCost } from './cost'
import { MATERIALS, TEMPLATE_MATERIALS } from './materials'
import { applyPatch, BOUNDS, validateParams, wallBound } from './params'
import { PRODUCE } from './produce'
import { stackCapacityN } from './sims'
import { buildPackage, type Contents } from './templates'
import type { AssumptionOverrides, DesignParams, MaterialId, ParamChange, ProductBrief } from './types'

/**
 * Rule-based design assistant. NOT an AI model: a bounded set of recognised phrasings, each mapped
 * to explicit parameter changes that are validated before they are offered. Anything else gets an
 * honest "not supported" with examples.
 */

export type AssistantReply =
  | { kind: 'change'; intent: string; summary: string; changes: ParamChange[]; params: DesignParams; warnings: string[] }
  | { kind: 'info'; intent: string; summary: string; table: { label: string; a: string; b: string }[]; headers: [string, string] }
  | { kind: 'unsupported'; summary: string }

export const EXAMPLES = [
  'Add more ventilation holes',
  'Make the tray wider',
  'Add dividers for strawberries',
  'Reduce material usage',
  'Compare recyclable paperboard with food-grade PET',
  'Make the package more stackable',
  'Add cushioning around fragile produce',
  'Make it 20 mm taller',
  'Use moulded pulp',
]

const MATERIAL_WORDS: [RegExp, MaterialId][] = [
  [/recycled (paper)?board|gd2/, 'recycled_board'],
  [/corrugat|cardboard|flute/, 'corrugated_e'],
  [/pulp|moulded fib|molded fib/, 'moulded_pulp'],
  [/rpet|recycled pet/, 'rpet'],
  [/\bpet\b|plastic/, 'pet'],
  [/paperboard|boxboard|board|carton ?board|paper/, 'fbb_board'],
]

function findMaterials(text: string): MaterialId[] {
  const found: MaterialId[] = []
  let rest = text
  for (const [re, id] of MATERIAL_WORDS) {
    const m = re.exec(rest)
    if (m) {
      found.push(id)
      rest = rest.slice(0, m.index) + ' '.repeat(m[0].length) + rest.slice(m.index + m[0].length)
    }
  }
  // Keep the order in which they appear in the request.
  return found.sort((a, b) => indexOfMaterial(text, a) - indexOfMaterial(text, b))
}

function indexOfMaterial(text: string, id: MaterialId) {
  const re = MATERIAL_WORDS.find(([, m]) => m === id)![0]
  return re.exec(text)?.index ?? 999
}

/** "by 20 mm", "to 180 mm", "20%". */
function amount(text: string, current: number): { value: number; how: string } | null {
  const to = /\bto (\d+(?:\.\d+)?)\s*(mm|cm)?/.exec(text)
  if (to) return { value: +to[1] * (to[2] === 'cm' ? 10 : 1), how: `to ${to[1]} ${to[2] ?? 'mm'}` }
  const pct = /(\d+(?:\.\d+)?)\s*%/.exec(text)
  if (pct) return { value: +pct[1] / 100 * current, how: `by ${pct[1]}%` }
  const by = /(?:by )?(\d+(?:\.\d+)?)\s*(mm|cm)\b/.exec(text)
  if (by) return { value: +by[1] * (by[2] === 'cm' ? 10 : 1), how: `by ${by[1]} ${by[2]}` }
  return null
}

interface Ctx {
  params: DesignParams
  brief: ProductBrief
  assumptions: AssumptionOverrides
}

export function diff(before: DesignParams, after: DesignParams, reasons: Record<string, string>, fallback: string): ParamChange[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const out: ParamChange[] = []
  for (const k of keys) {
    const a = (before as unknown as Record<string, unknown>)[k]
    const b = (after as unknown as Record<string, unknown>)[k]
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ key: k, from: a, to: b, reason: reasons[k] ?? fallback })
  }
  return out
}

function propose(ctx: Ctx, intent: string, summary: string, patch: Partial<Record<string, unknown>>, reasons: Record<string, string>, warnings: string[] = []): AssistantReply {
  const next = applyPatch(ctx.params, patch)
  const issues = validateParams(next)
  if (issues.length) {
    return { kind: 'unsupported', summary: `I can’t apply that: ${issues.map((i) => i.message).join(' ')}` }
  }
  const changes = diff(ctx.params, next, reasons, summary)
  if (!changes.length) return { kind: 'unsupported', summary: `No change needed: ${summary.charAt(0).toLowerCase()}${summary.slice(1)} is already the case, or the parameter is at its limit.` }
  return { kind: 'change', intent, summary, changes, params: next, warnings }
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))
const roundTo = (n: number, step: number) => +(Math.round(n / step) * step).toFixed(3)

export function interpret(input: string, ctx: Ctx): AssistantReply {
  const text = input.toLowerCase().trim()
  const p = ctx.params
  if (!text) return { kind: 'unsupported', summary: 'Type a request, for example “Add more ventilation holes”.' }

  /* compare materials */
  if (/\b(compare|vs|versus)\b/.test(text)) {
    const mats = findMaterials(text)
    if (mats.length >= 2) return compareMaterials(ctx, mats[0], mats[1])
    if (mats.length === 1) return compareMaterials(ctx, p.material, mats[0])
    return { kind: 'unsupported', summary: 'Name two materials to compare, e.g. “Compare recyclable paperboard with food-grade PET”.' }
  }

  /* ventilation */
  if (/vent|air ?holes?|holes?|breath/.test(text)) {
    if (!('ventCount' in p)) return { kind: 'unsupported', summary: 'The folding carton template has no vent openings. Switch to a produce tray or clamshell for ventilation.' }
    if (/bigger|larger|wider/.test(text)) {
      const d = clamp(p.ventDiaMm + 2, BOUNDS.ventDiaMm.min, BOUNDS.ventDiaMm.max)
      return propose(ctx, 'vents-larger', `Larger vent holes (${p.ventDiaMm} → ${d} mm)`, { ventDiaMm: d }, { ventDiaMm: 'More open area per hole for air exchange.' })
    }
    const less = /fewer|less|reduce|remove|no vent/.test(text)
    const n = /(\d+)/.exec(text)
    const delta = n ? +n[1] : 4
    const target = clamp(less ? p.ventCount - delta : p.ventCount + delta, 0, BOUNDS.ventCount.max)
    return propose(ctx, less ? 'vents-fewer' : 'vents-more', `${less ? 'Fewer' : 'More'} vent holes (${p.ventCount} → ${target})`, { ventCount: target }, {
      ventCount: less ? 'Fewer openings keep more wall material and stiffness.' : 'More openings increase air exchange around respiring produce.',
    })
  }

  /* dividers / compartments */
  if (/divider|compartment|cells?\b|separat/.test(text)) {
    const kind = Object.values(PRODUCE).find((pr) => text.includes(pr.label.toLowerCase().split(' ')[0].replace(/s$/, '')))
    const unit = kind?.unit ?? ctx.brief.identification.unitDims
    const forWhat = kind ? ` for ${kind.label.toLowerCase()}` : ''
    if (p.template === 'folding_carton') return propose(ctx, 'dividers', `Add a cell insert${forWhat}`, { insert: 'cells' }, { insert: 'Board cells keep units apart; the grid follows the unit layout.' })
    const lb = p.length - 12
    const wb = p.width - 12
    const cellsX = clamp(Math.floor(lb / (unit.l + 4)), 1, 6)
    const cellsY = clamp(Math.floor(wb / (unit.w + 4)), 1, 5)
    if (p.template === 'compartment_tray')
      return propose(ctx, 'dividers', `Cells sized${forWhat} (${cellsX} × ${cellsY})`, { cellsX, cellsY }, { cellsX: `About ${unit.l} mm units plus 4 mm play along the length.`, cellsY: `About ${unit.w} mm units plus 4 mm play across the width.` })
    return propose(ctx, 'dividers', `Switch to a compartment tray${forWhat} (${cellsX} × ${cellsY} cells)`, { template: 'compartment_tray', cellsX, cellsY }, { template: `${p.template === 'clamshell' ? 'Clamshells' : 'Open trays'} in this studio have no dividers; the compartment template has formed cells.`, cellsX: 'Cells sized to one unit plus 4 mm play.', cellsY: 'Cells sized to one unit plus 4 mm play.' }, p.template === 'clamshell' ? ['The hinged lid is removed; consider lidding film for closure.'] : [])
  }

  /* reduce material */
  if (/(reduce|less|lower|cut|save|minimi[sz]e).*(material|weight|plastic|board)|lighter|lightweight/.test(text)) {
    const mat = MATERIALS[p.material]
    const wall = roundTo(Math.max(mat.wall.min, p.wallMm * 0.85), mat.wall.step)
    const pkg = buildPackage(p, contents(ctx))
    const patch: Record<string, unknown> = { wallMm: wall }
    const reasons: Record<string, string> = { wallMm: `Thinner wall within the ${mat.short} range (${mat.wall.min}–${mat.wall.max} mm).` }
    const extraH = pkg.arrangement.clearance.y - 6
    if (pkg.arrangement.fits && extraH > 3) {
      patch.height = Math.round(p.height - extraH)
      reasons.height = `Removes ${extraH.toFixed(0)} mm of unused headspace (keeps 6 mm).`
    }
    if (p.template === 'folding_carton' && p.window) {
      patch.window = false
      reasons.window = 'Drops the PET window film.'
    }
    const before = estimateCost(p, pkg, 1, ctx.assumptions).massG
    const nextP = applyPatch(p, patch)
    const after = estimateCost(nextP, buildPackage(nextP, contents(ctx)), 1, ctx.assumptions).massG
    return propose(ctx, 'reduce-material', `Reduce material (${before.toFixed(1)} g → ${after.toFixed(1)} g per pack)`, patch, reasons, ['Thinner walls lower stacking capacity and can raise drop risk. Re-run the Simulation Lab.'])
  }

  /* stackable */
  if (/stack|strong|stiff|rigid|compression/.test(text)) {
    const mat = MATERIALS[p.material]
    const patch: Record<string, unknown> = {}
    const reasons: Record<string, string> = {}
    if (p.wallMm < mat.wall.max) {
      patch.wallMm = roundTo(Math.min(mat.wall.max, p.wallMm * 1.25), mat.wall.step)
      reasons.wallMm = 'Capacity grows roughly with wall^1.5 in the McKee-form estimate.'
    }
    if ('cornerRibs' in p && !p.cornerRibs) {
      patch.cornerRibs = true
      reasons.cornerRibs = 'Corner ribs add about 25% capacity in the model.'
    }
    if (!Object.keys(patch).length && p.template === 'folding_carton' && p.material !== 'corrugated_e') {
      patch.material = 'corrugated_e'
      reasons.material = 'Board is at its thickest; corrugated carries much more load.'
    }
    if (!Object.keys(patch).length) return { kind: 'unsupported', summary: 'This design is already at the strongest supported settings for its material.' }
    const before = stackCapacityN(p).capacity
    const after = stackCapacityN(applyPatch(p, patch)).capacity
    return propose(ctx, 'stackable', `More stackable (capacity estimate ${before.toFixed(0)} N → ${after.toFixed(0)} N)`, patch, reasons, ['Uses more material. Check the cost panel.'])
  }

  /* cushioning */
  if (/cushion|padding|\bpad\b|protect|fragile|soft/.test(text)) {
    if (p.template === 'compartment_tray') return { kind: 'unsupported', summary: 'Compartment trays already separate units with formed cells; pads are not supported in this template.' }
    if (p.insert === 'pad') return { kind: 'unsupported', summary: 'This design already has a cushioning pad.' }
    return propose(ctx, 'cushion', 'Add a cushioning pad under the produce', { insert: 'pad' }, { insert: 'A 4 mm fibre pad adds compliance under the produce in drop and vibration models.' }, p.material !== 'moulded_pulp' && MATERIALS[p.material].kind === 'plastic' ? ['Adds a second material (fibre pad in a plastic tray).'] : [])
  }

  /* explicit material switch */
  if (/\b(use|switch|change|make it|try)\b/.test(text)) {
    const mats = findMaterials(text)
    if (mats.length) {
      const m = mats[0]
      if (!TEMPLATE_MATERIALS[p.template].includes(m)) return { kind: 'unsupported', summary: `${MATERIALS[m].short} is not supported for this template. Supported: ${TEMPLATE_MATERIALS[p.template].map((x) => MATERIALS[x].short).join(', ')}.` }
      return propose(ctx, 'material', `Switch material to ${MATERIALS[m].short}`, { material: m, wallMm: MATERIALS[m].wall.default }, { material: MATERIALS[m].name, wallMm: `Default wall for ${MATERIALS[m].short}.` })
    }
  }

  /* dimensions */
  const dims: [RegExp, 'length' | 'width' | 'height', 1 | -1, string][] = [
    [/wider|widen|broader/, 'width', 1, 'Wider'],
    [/narrower|slimmer/, 'width', -1, 'Narrower'],
    [/longer|lengthen/, 'length', 1, 'Longer'],
    [/taller|higher|deeper/, 'height', 1, 'Taller'],
    [/shorter|lower|shallower|less tall/, 'height', -1, 'Lower'],
  ]
  for (const [re, key, sign, word] of dims) {
    if (re.test(text)) {
      const cur = p[key]
      const amt = amount(text, cur)
      let target = amt ? (amt.how.startsWith('to') ? amt.value : cur + sign * amt.value) : cur * (1 + sign * 0.1)
      target = Math.round(clamp(target, BOUNDS[key].min, BOUNDS[key].max))
      return propose(ctx, `dim-${key}`, `${word} (${key} ${cur} → ${target} mm)`, { [key]: target }, { [key]: amt ? `Requested ${amt.how}.` : 'Default step of 10%.' })
    }
  }
  if (/bigger|larger|smaller/.test(text)) {
    const s = /smaller/.test(text) ? 0.9 : 1.1
    return propose(ctx, 'scale', `${s > 1 ? 'Larger' : 'Smaller'} overall (×${s})`, { length: Math.round(clamp(p.length * s, 60, 400)), width: Math.round(clamp(p.width * s, 40, 300)), height: Math.round(clamp(p.height * s, 20, 250)) }, {})
  }
  if (/thick/.test(text)) {
    const b = wallBound(p.material)
    const thinner = /thinner|less thick/.test(text)
    const w = roundTo(clamp(p.wallMm * (thinner ? 0.85 : 1.15), b.min, b.max), b.step)
    return propose(ctx, 'wall', `Wall ${p.wallMm} → ${w} mm`, { wallMm: w }, { wallMm: thinner ? 'Less material.' : 'More stiffness.' })
  }
  return { kind: 'unsupported', summary: 'I don’t recognise that request. This is a rule-based assistant with a fixed set of supported commands.' }
}

function contents(ctx: Ctx): Contents {
  return { unit: ctx.brief.identification.unitDims, units: ctx.brief.identification.unitsPerPackage }
}

function compareMaterials(ctx: Ctx, a: MaterialId, b: MaterialId): AssistantReply {
  const row = (id: MaterialId) => {
    const m = MATERIALS[id]
    const supported = TEMPLATE_MATERIALS[ctx.params.template].includes(id)
    const pa = applyPatch(ctx.params, { material: id, wallMm: m.wall.default })
    const valid = supported && validateParams(pa).length === 0
    const pkg = buildPackage(pa, contents(ctx))
    const cost = estimateCost(pa, pkg, ctx.brief.identification.batchPackages, ctx.assumptions)
    return { m, supported: valid, cost, cap: stackCapacityN(pa).capacity }
  }
  const A = row(a)
  const B = row(b)
  const fmt = (r: ReturnType<typeof row>, f: (r: ReturnType<typeof row>) => string) => (r.supported ? f(r) : 'not supported for this template')
  return {
    kind: 'info',
    intent: 'compare-materials',
    summary: `${A.m.short} vs ${B.m.short} on the current ${ctx.params.template.replace('_', ' ')} at default wall thickness. Estimates only.`,
    headers: [A.m.short, B.m.short],
    table: [
      { label: 'Wall', a: `${A.m.wall.default} mm`, b: `${B.m.wall.default} mm` },
      { label: 'Mass per pack', a: fmt(A, (r) => `${r.cost.massG.toFixed(1)} g`), b: fmt(B, (r) => `${r.cost.massG.toFixed(1)} g`) },
      { label: 'Cost per pack', a: fmt(A, (r) => `€${r.cost.perPack.toFixed(3)}`), b: fmt(B, (r) => `€${r.cost.perPack.toFixed(3)}`) },
      { label: 'Stack capacity (dry, est.)', a: fmt(A, (r) => `${r.cap.toFixed(0)} N`), b: fmt(B, (r) => `${r.cap.toFixed(0)} N`) },
      { label: 'Chilled strength factor', a: `${A.m.chilledFactor}`, b: `${B.m.chilledFactor}` },
      { label: 'Producer-stated routes', a: A.m.routes.join(', '), b: B.m.routes.join(', ') },
      { label: 'Note', a: A.m.guidance, b: B.m.guidance },
    ],
  }
}

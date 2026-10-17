import { maxVents } from './geometry'
import { MATERIALS, TEMPLATE_MATERIALS } from './materials'
import type { DesignParams, MaterialId, TemplateId } from './types'

export const TEMPLATE_INFO: Record<TemplateId, { name: string; short: string; blurb: string; dieline: 'concept' | 'outline' | 'none' }> = {
  folding_carton: {
    name: 'Folding carton (reverse tuck end)',
    short: 'Folding carton',
    blurb: 'Board body with tuck-in closures. Flattens for shipping and has a true flat blank.',
    dieline: 'concept',
  },
  produce_tray: {
    name: 'Fresh-produce tray',
    short: 'Produce tray',
    blurb: 'Open tray with drafted walls, rim and base vents. Optional lidding film or pad.',
    dieline: 'none',
  },
  clamshell: {
    name: 'Hinged clamshell',
    short: 'Clamshell',
    blurb: 'Tray and lid joined by a hinge with a front latch. Vents in base and lid.',
    dieline: 'none',
  },
  compartment_tray: {
    name: 'Compartment tray',
    short: 'Compartments',
    blurb: 'Tray with formed cells that keep each unit apart.',
    dieline: 'none',
  },
}

export const TEMPLATE_IDS = Object.keys(TEMPLATE_INFO) as TemplateId[]

export interface Bound {
  min: number
  max: number
  step: number
  unit: string
  label: string
}

/** Supported ranges. Outside these the template is not considered credible and edits are rejected. */
export const BOUNDS: Record<string, Bound> = {
  length: { min: 60, max: 400, step: 1, unit: 'mm', label: 'Length' },
  width: { min: 40, max: 300, step: 1, unit: 'mm', label: 'Width' },
  height: { min: 20, max: 250, step: 1, unit: 'mm', label: 'Height' },
  tuckMm: { min: 10, max: 40, step: 1, unit: 'mm', label: 'Tuck flap depth' },
  draftDeg: { min: 0, max: 12, step: 0.5, unit: '°', label: 'Wall draft' },
  ventCount: { min: 0, max: 40, step: 1, unit: '', label: 'Vent holes' },
  ventDiaMm: { min: 3, max: 16, step: 0.5, unit: 'mm', label: 'Vent diameter' },
  lidHeightPct: { min: 15, max: 70, step: 1, unit: '%', label: 'Lid depth' },
  cellsX: { min: 1, max: 6, step: 1, unit: '', label: 'Cells along length' },
  cellsY: { min: 1, max: 5, step: 1, unit: '', label: 'Cells along width' },
}

export const RIM_MM = 6

export function wallBound(material: MaterialId): Bound {
  const w = MATERIALS[material].wall
  return { min: w.min, max: w.max, step: w.step, unit: 'mm', label: 'Wall thickness' }
}

/** Floor size of drafted trays, mm. */
export function trayBase(p: { length: number; width: number; height: number; draftDeg: number }) {
  const inset = p.height * Math.tan((p.draftDeg * Math.PI) / 180)
  return { lb: p.length - 2 * RIM_MM - 2 * inset, wb: p.width - 2 * RIM_MM - 2 * inset }
}

export interface ParamIssue {
  key: string
  message: string
}

/** Check one candidate parameter set. Returns every problem; an empty list means it can be committed. */
export function validateParams(p: DesignParams): ParamIssue[] {
  const issues: ParamIssue[] = []
  if (!TEMPLATE_MATERIALS[p?.template]) return [{ key: 'template', message: 'Unknown packaging template.' }]
  const check = (key: string, value: number, b: Bound) => {
    if (!Number.isFinite(value)) issues.push({ key, message: `${b.label} must be a number.` })
    else if (value < b.min || value > b.max)
      issues.push({ key, message: `${b.label} must be between ${b.min} and ${b.max}${b.unit ? ` ${b.unit}` : ''}.` })
  }
  check('length', p.length, BOUNDS.length)
  check('width', p.width, BOUNDS.width)
  check('height', p.height, BOUNDS.height)
  if (!TEMPLATE_MATERIALS[p.template].includes(p.material))
    issues.push({ key: 'material', message: `${MATERIALS[p.material]?.short ?? p.material} is not supported for this template.` })
  else check('wallMm', p.wallMm, wallBound(p.material))
  if (p.width > p.length) issues.push({ key: 'width', message: 'Width should not exceed length (rotate the pack instead).' })

  if (p.template === 'folding_carton') {
    check('tuckMm', p.tuckMm, BOUNDS.tuckMm)
    if (p.tuckMm > p.width * 0.6) issues.push({ key: 'tuckMm', message: 'Tuck flap is too deep for this width (max 60% of width).' })
  } else {
    check('draftDeg', p.draftDeg, BOUNDS.draftDeg)
    check('ventCount', p.ventCount, BOUNDS.ventCount)
    check('ventDiaMm', p.ventDiaMm, BOUNDS.ventDiaMm)
    const { lb, wb } = trayBase(p)
    if (lb < 30 || wb < 20) issues.push({ key: 'draftDeg', message: 'Draft is too steep for this height: the floor would be too small.' })
    else {
      const max = maxVents(p.ventDiaMm, lb - 10, wb - 10)
      if (p.ventCount > max)
        issues.push({ key: 'ventCount', message: `Only ${max} vents of ${p.ventDiaMm} mm fit this floor with safe spacing.` })
    }
    if (p.template === 'clamshell') check('lidHeightPct', p.lidHeightPct, BOUNDS.lidHeightPct)
    if (p.template === 'compartment_tray') {
      check('cellsX', p.cellsX, BOUNDS.cellsX)
      check('cellsY', p.cellsY, BOUNDS.cellsY)
      if (Number.isInteger(p.cellsX) === false || Number.isInteger(p.cellsY) === false)
        issues.push({ key: 'cellsX', message: 'Cell counts must be whole numbers.' })
    }
  }
  return issues
}

/** Default parameters for a template, sized around an outer target. */
export function defaultParams(template: TemplateId, size: { length: number; width: number; height: number }, material?: MaterialId): DesignParams {
  const mat = material && TEMPLATE_MATERIALS[template].includes(material) ? material : TEMPLATE_MATERIALS[template][0]
  const common = { ...size, wallMm: MATERIALS[mat].wall.default, material: mat, color: '#e94b4b', accent: '#2f6b4f' }
  switch (template) {
    case 'folding_carton':
      return { ...common, template, tuckMm: Math.min(20, Math.round(size.width * 0.3)), window: false, insert: 'none' }
    case 'produce_tray':
      return { ...common, template, draftDeg: 6, ventCount: 8, ventDiaMm: 6, cornerRibs: false, filmLid: false, insert: 'none' }
    case 'clamshell':
      return { ...common, template, draftDeg: 6, ventCount: 8, ventDiaMm: 6, cornerRibs: false, lidHeightPct: 35, insert: 'none' }
    case 'compartment_tray':
      return { ...common, template, draftDeg: 5, ventCount: 0, ventDiaMm: 6, cornerRibs: false, cellsX: 3, cellsY: 2, filmLid: false }
  }
}

/**
 * Switch template while keeping the shared parameters. Fields the new template doesn't have are dropped;
 * missing ones come from its defaults.
 */
export function convertTemplate(p: DesignParams, template: TemplateId): DesignParams {
  if (p.template === template) return p
  const base = defaultParams(template, { length: p.length, width: p.width, height: p.height }, p.material)
  const carry: Record<string, unknown> = { color: p.color, accent: p.accent }
  for (const k of ['draftDeg', 'ventCount', 'ventDiaMm', 'cornerRibs', 'filmLid'] as const) {
    if (k in p && k in base) carry[k] = (p as unknown as Record<string, unknown>)[k]
  }
  if (base.material === p.material) carry.wallMm = p.wallMm
  return { ...base, ...carry } as DesignParams
}

/** Apply a loose patch (assistant/recommendation) and normalise template + material consistency. */
export function applyPatch(p: DesignParams, patch: Partial<Record<string, unknown>>): DesignParams {
  let next = (patch.template && patch.template !== p.template ? convertTemplate(p, patch.template as TemplateId) : p) as DesignParams
  const rest = { ...patch }
  delete rest.template
  next = { ...next, ...rest } as DesignParams
  if (!TEMPLATE_MATERIALS[next.template].includes(next.material)) {
    next = { ...next, material: TEMPLATE_MATERIALS[next.template][0] }
  }
  if (rest.material && rest.wallMm === undefined) {
    const w = MATERIALS[next.material].wall
    if (next.wallMm < w.min || next.wallMm > w.max) next = { ...next, wallMm: w.default }
  }
  return next
}

export function round(n: number, step = 1) {
  return Math.round(n / step) * step
}

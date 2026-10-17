import type { EndOfLifeRoute } from '../../domain/types'
import type { AssumptionOverrides, MaterialAssumption, MaterialId, TemplateId } from './types'

/**
 * Material table. Every number here is an ASSUMPTION for comparative, early-stage estimates:
 * typical published ranges rounded for clarity, not supplier data, not measured, not certified.
 * The studio shows these values next to every estimate and lets the producer override prices.
 */
export interface MaterialSpec {
  id: MaterialId
  name: string
  short: string
  kind: 'fibre' | 'plastic'
  densityKgM3: number
  wall: { min: number; max: number; default: number; step: number }
  /** Edge-crush coefficient: ECT (N/mm) per mm of wall. Used in the McKee-form stacking estimate. */
  ectPerMm: number
  /** Contact stiffness against a hard floor, N/m, bottom-face reference. Used in the drop motion model. */
  contactStiffness: number
  /** Deformation (mm) beyond which the model flags likely permanent damage. */
  elasticLimitMm: number
  /** Strength retained in chilled / humid storage (fibre loses stiffness when it takes up moisture). */
  chilledFactor: number
  frozenFactor: number
  /** Sheet-to-part yield for formed parts. Board cartons use the real dieline instead. */
  processYield: number
  defaults: MaterialAssumption
  routes: EndOfLifeRoute[]
  guidance: string
  colour: string
  note: string
}

export const MATERIALS: Record<MaterialId, MaterialSpec> = {
  fbb_board: {
    id: 'fbb_board',
    name: 'Folding boxboard (virgin fibre)',
    short: 'Folding boxboard',
    kind: 'fibre',
    densityKgM3: 700,
    wall: { min: 0.35, max: 0.7, default: 0.5, step: 0.05 },
    ectPerMm: 5,
    contactStiffness: 6e4,
    elasticLimitMm: 5,
    chilledFactor: 0.6,
    frozenFactor: 0.5,
    processYield: 0.8,
    defaults: { pricePerKg: 1.4, convertingPerPack: 0.02 },
    routes: ['recycle'],
    guidance: 'Paper and card. Flatten and recycle with card if it is clean and dry.',
    colour: '#f3efe6',
    note: '0.5 mm ≈ 350 g/m²',
  },
  recycled_board: {
    id: 'recycled_board',
    name: 'Recycled-fibre board (GD2-type)',
    short: 'Recycled board',
    kind: 'fibre',
    densityKgM3: 730,
    wall: { min: 0.4, max: 0.8, default: 0.55, step: 0.05 },
    ectPerMm: 4.2,
    contactStiffness: 5.5e4,
    elasticLimitMm: 5,
    chilledFactor: 0.55,
    frozenFactor: 0.45,
    processYield: 0.8,
    defaults: { pricePerKg: 0.95, convertingPerPack: 0.02 },
    routes: ['recycle'],
    guidance: 'Paper and card. Flatten and recycle with card if it is clean and dry.',
    colour: '#d9cbb0',
    note: '0.55 mm ≈ 400 g/m²',
  },
  corrugated_e: {
    id: 'corrugated_e',
    name: 'Corrugated board (E/B flute)',
    short: 'Corrugated',
    kind: 'fibre',
    densityKgM3: 300,
    wall: { min: 1.2, max: 3.2, default: 1.6, step: 0.1 },
    ectPerMm: 3,
    contactStiffness: 3.5e4,
    elasticLimitMm: 8,
    chilledFactor: 0.6,
    frozenFactor: 0.5,
    processYield: 0.82,
    defaults: { pricePerKg: 0.8, convertingPerPack: 0.025 },
    routes: ['recycle'],
    guidance: 'Cardboard. Flatten and recycle with card if it is clean and dry.',
    colour: '#c9a46b',
    note: '1.6 mm ≈ E flute, 3 mm ≈ B flute',
  },
  moulded_pulp: {
    id: 'moulded_pulp',
    name: 'Moulded fibre (pulp)',
    short: 'Moulded pulp',
    kind: 'fibre',
    densityKgM3: 400,
    wall: { min: 1, max: 3, default: 1.8, step: 0.1 },
    ectPerMm: 1.6,
    contactStiffness: 2.5e4,
    elasticLimitMm: 8,
    chilledFactor: 0.65,
    frozenFactor: 0.55,
    processYield: 0.92,
    defaults: { pricePerKg: 1.2, convertingPerPack: 0.03 },
    routes: ['recycle', 'compost'],
    guidance:
      'Moulded fibre. Often accepted with paper and card; home composting only if the producer has certified it. Check local rules.',
    colour: '#cbbfa4',
    note: 'Wet-formed, wall set by the tool',
  },
  rpet: {
    id: 'rpet',
    name: 'Recycled PET (rPET), food grade',
    short: 'rPET',
    kind: 'plastic',
    densityKgM3: 1340,
    wall: { min: 0.18, max: 0.5, default: 0.25, step: 0.01 },
    ectPerMm: 7,
    contactStiffness: 9e4,
    elasticLimitMm: 6,
    chilledFactor: 0.95,
    frozenFactor: 0.85,
    processYield: 0.65,
    defaults: { pricePerKg: 1.8, convertingPerPack: 0.015 },
    routes: ['recycle', 'general_waste'],
    guidance:
      'PET tray. Many areas collect PET bottles but not trays; check whether your local collection accepts pots, tubs and trays.',
    colour: '#d7ece8',
    note: 'Thermoformed from sheet',
  },
  pet: {
    id: 'pet',
    name: 'Virgin PET, food grade',
    short: 'PET',
    kind: 'plastic',
    densityKgM3: 1340,
    wall: { min: 0.18, max: 0.5, default: 0.25, step: 0.01 },
    ectPerMm: 7.5,
    contactStiffness: 1e5,
    elasticLimitMm: 6,
    chilledFactor: 0.95,
    frozenFactor: 0.85,
    processYield: 0.65,
    defaults: { pricePerKg: 1.5, convertingPerPack: 0.015 },
    routes: ['recycle', 'general_waste'],
    guidance:
      'PET tray. Many areas collect PET bottles but not trays; check whether your local collection accepts pots, tubs and trays.',
    colour: '#e6f4f8',
    note: 'Thermoformed from sheet',
  },
}

export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[]

/** Which materials each template supports. */
export const TEMPLATE_MATERIALS: Record<TemplateId, MaterialId[]> = {
  folding_carton: ['fbb_board', 'recycled_board', 'corrugated_e'],
  produce_tray: ['rpet', 'pet', 'moulded_pulp', 'corrugated_e', 'recycled_board'],
  clamshell: ['rpet', 'pet', 'moulded_pulp'],
  compartment_tray: ['moulded_pulp', 'rpet', 'pet'],
}

/** Films are minor components with their own fixed assumptions. */
export const FILMS = {
  pet_film: { name: 'PET film', thicknessMm: 0.04, densityKgM3: 1390, pricePerKg: 2.5, routes: ['general_waste'] as EndOfLifeRoute[], guidance: 'Thin plastic film. Peel off; most kerbside collections do not accept it.' },
  pp_film: { name: 'PP lidding film', thicknessMm: 0.035, densityKgM3: 905, pricePerKg: 2.2, routes: ['recycle', 'general_waste'] as EndOfLifeRoute[], guidance: 'Soft plastic film. Some areas collect it at drop-off points, many do not.' },
}

export function assumptionFor(id: MaterialId, overrides: AssumptionOverrides = {}): MaterialAssumption {
  return { ...MATERIALS[id].defaults, ...overrides[id] }
}

export function isFibre(id: MaterialId) {
  return MATERIALS[id].kind === 'fibre'
}

import type { BriefCategory, Dims, Fragility, ProduceKind } from './types'

/**
 * Representative produce characteristics. TYPICAL values for pre-filling a brief and for ranking
 * designs in the simplified models: not measurements of any real crop, and not produce science.
 * `sensitivityG` is an assumed peak-deceleration level above which the drop model reports elevated risk.
 */
export interface ProduceSpec {
  kind: ProduceKind
  label: string
  category: BriefCategory
  unit: Dims
  unitWeightG: number
  unitsPerPackage: number
  fragility: Fragility
  /** Contact stiffness of the produce itself, N/m (soft fruit is compliant). */
  stiffness: number
  sensitivityG: number
  /** Lateral sliding (mm per second of transport) above which abrasion risk is reported. */
  abrasionMmS: number
  colors: [string, string]
}

export const PRODUCE: Record<ProduceKind, ProduceSpec> = {
  strawberry: { kind: 'strawberry', label: 'Strawberries', category: 'Berries', unit: { l: 40, w: 32, h: 32 }, unitWeightG: 18, unitsPerPackage: 14, fragility: 'high', stiffness: 8e3, sensitivityG: 150, abrasionMmS: 6, colors: ['#e0393e', '#3f8f3a'] },
  cherry_tomato: { kind: 'cherry_tomato', label: 'Cherry tomatoes', category: 'Vine fruit', unit: { l: 28, w: 28, h: 26 }, unitWeightG: 15, unitsPerPackage: 16, fragility: 'medium', stiffness: 2e4, sensitivityG: 180, abrasionMmS: 12, colors: ['#e5482f', '#4c8a33'] },
  apple: { kind: 'apple', label: 'Apples', category: 'Pome fruit', unit: { l: 78, w: 78, h: 72 }, unitWeightG: 180, unitsPerPackage: 4, fragility: 'medium', stiffness: 6e4, sensitivityG: 150, abrasionMmS: 10, colors: ['#c8312f', '#7aa63a'] },
  mango: { kind: 'mango', label: 'Mangoes', category: 'Tropical fruit', unit: { l: 120, w: 85, h: 75 }, unitWeightG: 320, unitsPerPackage: 2, fragility: 'medium', stiffness: 4e4, sensitivityG: 160, abrasionMmS: 10, colors: ['#f2a93b', '#6f9d3b'] },
  grape: { kind: 'grape', label: 'Grapes (bunch)', category: 'Vine fruit', unit: { l: 160, w: 100, h: 60 }, unitWeightG: 500, unitsPerPackage: 1, fragility: 'high', stiffness: 1e4, sensitivityG: 150, abrasionMmS: 6, colors: ['#7b3f8f', '#5f8f3a'] },
  generic: { kind: 'generic', label: 'Other product', category: 'Other food', unit: { l: 60, w: 60, h: 60 }, unitWeightG: 120, unitsPerPackage: 4, fragility: 'medium', stiffness: 3e4, sensitivityG: 200, abrasionMmS: 15, colors: ['#c9a46b', '#5a4a3a'] },
}

export const PRODUCE_KINDS = Object.keys(PRODUCE) as ProduceKind[]

/** Fragility the producer chose shifts the assumed threshold. */
export function sensitivity(kind: ProduceKind, fragility: Fragility) {
  const base = PRODUCE[kind] ?? PRODUCE.generic
  const f = fragility === 'high' ? 0.85 : fragility === 'low' ? 1.25 : 1
  return { g: base.sensitivityG * f, abrasion: base.abrasionMmS * f, stiffness: base.stiffness }
}

import { assumptionFor, FILMS, MATERIALS } from './materials'
import type { AssumptionOverrides, CostEstimate, DesignParams, MaterialId, PackageGeometry } from './types'

/**
 * Material, mass and cost estimate from the generated geometry.
 *
 *   mass (g)      = area (m²) × thickness (m) × density (kg/m³) × 1000
 *   blank mass    = carton: dieline bounding rectangle × thickness × density (single-up blank, no nesting)
 *                   formed parts: mass ÷ process yield (sheet or pulp lost to trim)
 *   material cost = blank mass (kg) × price (€/kg)          ← indicative assumption, editable
 *   per pack      = Σ material cost + converting cost per pack ← indicative assumption, editable
 *   per batch     = per pack × packages in the batch
 */
export function estimateCost(p: DesignParams, geo: PackageGeometry, batchPackages: number, overrides: AssumptionOverrides = {}): CostEstimate {
  const assumptions: string[] = []
  const parts: { name: string; material: string; massG: number; blankG: number; cost: number; fibre: boolean; stream: string }[] = []

  for (const c of geo.components) {
    const areaM2 = c.areaMm2 / 1e6
    if (c.material === 'pet_film' || c.material === 'pp_film') {
      const f = FILMS[c.material]
      const mass = areaM2 * (f.thicknessMm / 1000) * f.densityKgM3 * 1000
      const blank = mass / 0.9
      parts.push({ name: c.name, material: f.name, massG: mass, blankG: blank, cost: (blank / 1000) * f.pricePerKg, fibre: false, stream: c.material })
      continue
    }
    const m = MATERIALS[c.material as MaterialId]
    const a = assumptionFor(m.id, overrides)
    const mass = areaM2 * (c.thicknessMm / 1000) * m.densityKgM3 * 1000
    let blank = mass / m.processYield
    if (c.id === 'body' && geo.dieline) {
      blank = ((geo.dieline.width * geo.dieline.height) / 1e6) * (c.thicknessMm / 1000) * m.densityKgM3 * 1000
    }
    parts.push({ name: c.name, material: m.short, massG: mass, blankG: blank, cost: (blank / 1000) * a.pricePerKg, fibre: m.kind === 'fibre', stream: m.kind === 'fibre' ? 'fibre' : m.id === 'pet' || m.id === 'rpet' ? 'pet' : m.id })
  }

  const body = MATERIALS[p.material]
  const bodyA = assumptionFor(p.material, overrides)
  const massG = parts.reduce((s, x) => s + x.massG, 0)
  const blankMassG = parts.reduce((s, x) => s + x.blankG, 0)
  const materialCost = parts.reduce((s, x) => s + x.cost, 0)
  const convertingCost = bodyA.convertingPerPack
  const perPack = materialCost + convertingCost
  const netAreaM2 = geo.components.reduce((s, c) => s + c.areaMm2, 0) / 1e6
  const blankAreaM2 = geo.dieline ? (geo.dieline.width * geo.dieline.height) / 1e6 : netAreaM2 / body.processYield
  const fibreMass = parts.filter((x) => x.fibre).reduce((s, x) => s + x.massG, 0)

  assumptions.push(`${body.short}: density ${body.densityKgM3} kg/m³, ${p.wallMm} mm wall, €${bodyA.pricePerKg.toFixed(2)}/kg (indicative, not a quote).`)
  if (geo.dieline) assumptions.push('Carton blank: one blank per rectangle of board, no nesting on the sheet. Real layouts usually waste less.')
  else assumptions.push(`${body.short}: ${Math.round(body.processYield * 100)}% of the sheet or pulp ends up in the part (assumed process yield).`)
  assumptions.push(`Converting (forming, cutting, printing) €${convertingCost.toFixed(3)} per pack (assumed flat rate).`)
  if (parts.some((x) => x.stream === 'pet_film' || x.stream === 'pp_film')) assumptions.push('Films: 90% yield, prices from the material table.')

  return {
    method: 'simplified_estimate',
    netAreaM2,
    blankAreaM2,
    massG,
    blankMassG,
    utilisationPct: blankMassG > 0 ? (massG / blankMassG) * 100 : 0,
    trimWastePct: blankMassG > 0 ? (1 - massG / blankMassG) * 100 : 0,
    materialCost,
    convertingCost,
    perPack,
    perBatch: perPack * batchPackages,
    wastePerBatchKg: ((blankMassG - massG) * batchPackages) / 1000,
    components: parts.map(({ name, material, massG: g }) => ({ name, material, massG: g })),
    fibreSharePct: massG > 0 ? (fibreMass / massG) * 100 : 0,
    monoMaterial: new Set(parts.map((x) => x.stream)).size === 1,
    assumptions,
  }
}

export const euro = (n: number, digits = 3) => `€${n.toFixed(digits)}`

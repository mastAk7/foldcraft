import { addDays, isoDate } from '../../domain/dates'
import { analyse, fitSuggestion } from './analysis'
import { MATERIALS, TEMPLATE_MATERIALS } from './materials'
import { applyPatch, defaultParams } from './params'
import { PRODUCE } from './produce'
import type { DesignParams, DesignVersion, ParamChange, ProduceKind, ProductBrief, Project, ProjectStatus, VersionSource } from './types'

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

/** A brief pre-filled with TYPICAL values for a produce kind. Everything stays editable. */
export function briefFor(kind: ProduceKind, today = isoDate()): ProductBrief {
  const pr = PRODUCE[kind]
  const chilled = kind === 'strawberry' || kind === 'grape' || kind === 'apple'
  const name = kind === 'generic' ? '' : pr.label
  return {
    identification: {
      name,
      category: pr.category,
      produce: kind,
      unitDims: { ...pr.unit },
      unitWeightG: pr.unitWeightG,
      unitsPerPackage: pr.unitsPerPackage,
      batchPackages: 2000,
      fragility: pr.fragility,
    },
    metadata: {
      productId: name ? slug(name) : '',
      dates: [{ kind: 'best_before', date: addDays(today, chilled ? 5 : 7) }],
      packedOn: today,
      shelfLifeDays: chilled ? 5 : 7,
      ...(chilled ? { tempMinC: 0, tempMaxC: 4 } : { tempMinC: 12, tempMaxC: 20 }),
      storageText: '',
      coldChain: chilled ? 'chilled' : 'ambient',
    },
    requirements: {
      template: kind === 'apple' || kind === 'mango' ? 'compartment_tray' : 'produce_tray',
      permittedMaterials: ['rpet', 'moulded_pulp', 'recycled_board', 'corrugated_e', 'fbb_board'],
      cushioning: pr.fragility === 'high' ? 'pad' : 'none',
      ventilation: 'standard',
      stackLayers: 5,
      transport: 'regional',
      monoMaterial: false,
      preferFibre: false,
    },
  }
}

export function emptyBrief(today = isoDate()): ProductBrief {
  const b = briefFor('strawberry', today)
  return { ...b, identification: { ...b.identification, name: '' }, metadata: { ...b.metadata, productId: '', storageText: '' } }
}

/**
 * Generate an initial design from the brief: first permitted material the template supports,
 * size fitted to the contents, then the brief's requested options. Deterministic.
 */
export function generateParams(brief: ProductBrief): { params: DesignParams; changeLog: ParamChange[] } {
  const r = brief.requirements
  const material = r.permittedMaterials.find((m) => TEMPLATE_MATERIALS[r.template].includes(m)) ?? TEMPLATE_MATERIALS[r.template][0]
  const log: ParamChange[] = []
  let p = defaultParams(r.template, { length: 180, width: 120, height: 70 }, material)
  log.push({ key: 'template', from: undefined, to: r.template, reason: 'Template from the brief.' })
  log.push({ key: 'material', from: undefined, to: material, reason: `First permitted material this template supports (${MATERIALS[material].short}).` })
  if (r.wallMm !== undefined) {
    const w = MATERIALS[material].wall
    const wall = Math.max(w.min, Math.min(w.max, r.wallMm))
    p = { ...p, wallMm: wall }
    log.push({ key: 'wallMm', from: undefined, to: wall, reason: wall === r.wallMm ? 'Wall thickness from the brief.' : `Brief wall clamped to the ${MATERIALS[material].short} range.` })
  }
  const pr = PRODUCE[brief.identification.produce] ?? PRODUCE.generic
  // Cartons print in the produce's accent so the contents stay distinguishable in the 3D view.
  p = p.template === 'folding_carton' ? { ...p, color: pr.colors[1], accent: pr.colors[0] } : { ...p, color: pr.colors[0], accent: pr.colors[1] }
  if (r.cushioning === 'pad' && 'insert' in p) {
    p = { ...p, insert: 'pad' } as DesignParams
    log.push({ key: 'insert', from: 'none', to: 'pad', reason: 'Cushioning requested in the brief.' })
  }
  if (r.cushioning === 'cells' && p.template === 'folding_carton') {
    p = { ...p, insert: 'cells' }
    log.push({ key: 'insert', from: 'none', to: 'cells', reason: 'Cell insert requested in the brief.' })
  }
  if ('ventCount' in p) {
    const vents = r.ventilation === 'none' ? 0 : r.ventilation === 'high' ? 14 : 8
    p = { ...p, ventCount: vents } as DesignParams
    log.push({ key: 'ventCount', from: undefined, to: vents, reason: `Ventilation “${r.ventilation}” in the brief.` })
  }
  // Size to the contents (one pass for the template's own geometry, then the compartment grid).
  if (p.template === 'compartment_tray') {
    const u = brief.identification.unitDims
    const n = brief.identification.unitsPerPackage
    const cellsX = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(n * (u.w / u.l)))))
    const cellsY = Math.max(1, Math.min(5, Math.ceil(n / cellsX)))
    const length = Math.round(Math.min(400, cellsX * (u.l + 6) + 2 * 6 + 2 * p.height * Math.tan((p.draftDeg * Math.PI) / 180) + 10))
    const width = Math.round(Math.min(300, cellsY * (u.w + 6) + 2 * 6 + 2 * p.height * Math.tan((p.draftDeg * Math.PI) / 180) + 10))
    p = { ...p, cellsX, cellsY, length: Math.max(length, width), width: Math.min(length, width), height: Math.round(u.h * 0.75 + 8) }
    log.push({ key: 'cells', from: undefined, to: `${cellsX} × ${cellsY}`, reason: `One cell per unit for ${n} units.` })
  }
  for (let i = 0; i < 3; i++) {
    const s = fitSuggestion(p, brief, analyse(p, brief))
    if (!s || p.template === 'compartment_tray') break
    p = applyPatch(p, s.patch)
  }
  if (r.targetDims?.h && p.height > r.targetDims.h) log.push({ key: 'height', from: undefined, to: p.height, reason: `Contents need ${p.height} mm; the ${r.targetDims.h} mm target is too low.` })
  log.push({ key: 'size', from: undefined, to: `${p.length} × ${p.width} × ${p.height} mm`, reason: 'Fitted to the contents with about 4 mm clearance.' })
  return { params: p, changeLog: log }
}

export function makeVersion(params: DesignParams, n: number, source: VersionSource, label: string, changeLog: ParamChange[], parentId?: string): DesignVersion {
  return { id: uid(), n, params, label, source, changeLog, createdAt: new Date().toISOString(), final: false, ...(parentId ? { parentId } : {}) }
}

export function projectStatus(p: Project): ProjectStatus {
  if (p.published) return 'published'
  if (p.versions.some((v) => v.final)) return 'final'
  if (p.testedVersionIds.length) return 'tested'
  if (p.versions.length) return 'designing'
  return 'brief'
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  brief: 'Brief in progress',
  designing: 'Designing',
  tested: 'Tested',
  final: 'Finalised',
  published: 'Published',
}

export function currentVersion(p: Project): DesignVersion | undefined {
  return p.versions.find((v) => v.id === p.currentVersionId) ?? p.versions[p.versions.length - 1]
}

export function finalVersion(p: Project): DesignVersion | undefined {
  return [...p.versions].reverse().find((v) => v.final)
}

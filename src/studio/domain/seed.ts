import { addDays, isoDate } from '../../domain/dates'
import type { PublishedPassport } from '../../services/registry'
import { analyse } from './analysis'
import { applyPatch } from './params'
import { deriveRecord, fingerprint, passportSummary } from './passport'
import { briefFor, generateParams, makeVersion, uid } from './project'
import { breakMyDesign } from './sims'
import type { ProductBrief, Project } from './types'

/**
 * SAMPLE projects for demonstrations. Brands are fictional; values are typical, not measured.
 * They cover every project state so the whole workflow can be shown without typing.
 */

const SAMPLE = '(sample)'

function project(name: string, brief: ProductBrief, now: string): Project {
  return { id: uid(), name, createdAt: now, updatedAt: now, briefStage: 'review', briefComplete: true, brief, versions: [], testedVersionIds: [], batches: [], assumptions: {}, seed: true }
}

function withDesign(p: Project, ...patches: { label: string; patch: Record<string, unknown>; source?: 'assistant' | 'recommendation' | 'manual' }[]): Project {
  const gen = generateParams(p.brief)
  const v1 = makeVersion(gen.params, 1, 'generated', 'Generated from brief', gen.changeLog)
  const versions = [v1]
  for (const step of patches) {
    const prev = versions[versions.length - 1]
    const params = applyPatch(prev.params, step.patch)
    const log = Object.entries(step.patch).map(([key, to]) => ({ key, from: (prev.params as unknown as Record<string, unknown>)[key], to, reason: step.label }))
    versions.push(makeVersion(params, versions.length + 1, step.source ?? 'recommendation', step.label, log, prev.id))
  }
  return { ...p, versions, currentVersionId: versions[versions.length - 1].id }
}

export function sampleProjects(today = isoDate()): { projects: Project[]; passports: PublishedPassport[] } {
  const now = new Date().toISOString()

  /* 1 — strawberries: designed, tested, improved, finalised and published */
  const sb = briefFor('strawberry', today)
  sb.identification.name = 'Hillside Strawberries 250 g'
  sb.identification.description = 'Field-grown strawberries in a vented clamshell.'
  sb.metadata = {
    ...sb.metadata,
    productId: 'hillside-strawberries-250g',
    brand: `Hillside Farm ${SAMPLE}`,
    lotId: 'HS-1017-A',
    humidityMinPct: 90,
    humidityMaxPct: 95,
    storageText: 'Keep refrigerated at 0–4 °C. Rinse just before eating, not before storing.',
    handling: 'Handle gently and keep the pack level.',
    warnings: 'Remove any soft or mouldy berries from the pack.',
  }
  sb.requirements = { ...sb.requirements, template: 'clamshell', permittedMaterials: ['rpet', 'moulded_pulp'], cushioning: 'none', stackLayers: 6, transport: 'regional' }
  let strawberries = withDesign(project('Hillside Strawberries 250 g', sb, now), { label: 'Break My Design: add cushioning pad and corner ribs', patch: { insert: 'pad', cornerRibs: true } })
  const sFinal = strawberries.versions[strawberries.versions.length - 1]
  sFinal.final = true
  const batch = { id: uid(), lotCode: 'HS-1017-A', packedOn: today, dates: [{ kind: 'best_before' as const, date: addDays(today, 5) }], designVersionId: sFinal.id, recordVersion: 1, createdAt: now }
  const sa = analyse(sFinal.params, sb)
  const sRecord = deriveRecord(sb, sFinal.params, sa, batch)
  strawberries = {
    ...strawberries,
    testedVersionIds: strawberries.versions.map((v) => v.id),
    batches: [batch],
    published: { recordVersion: 1, publishedAt: now, lotCode: batch.lotCode, fingerprint: fingerprint(sRecord) },
  }
  const passport: PublishedPassport = { record: sRecord, recordVersion: 1, lotCode: batch.lotCode, designVersion: sFinal.n, publishedAt: now, summary: passportSummary(sFinal.params, sa, breakMyDesign(sa.ctx)) }

  /* 2 — cherry tomatoes: tested, not final */
  const tb = briefFor('cherry_tomato', today)
  tb.identification.name = 'Vine Cherry Tomatoes 250 g'
  tb.metadata = { ...tb.metadata, productId: 'vine-cherry-tomatoes-250g', brand: `Redbank Growers ${SAMPLE}`, storageText: 'Store at room temperature, out of direct sunlight, for the best flavour.', handling: 'Do not store below 10 °C unless very ripe.' }
  tb.requirements = { ...tb.requirements, template: 'produce_tray', permittedMaterials: ['moulded_pulp', 'recycled_board'], preferFibre: true, monoMaterial: true }
  let tomatoes = withDesign(project('Vine Cherry Tomatoes 250 g', tb, now), { label: 'Assistant: more ventilation holes', patch: { ventCount: 12 }, source: 'assistant' })
  tomatoes = { ...tomatoes, testedVersionIds: [tomatoes.versions[0].id] }

  /* 3 — apples: finalised, not yet published */
  const ab = briefFor('apple', today)
  ab.identification.name = 'Orchard Apples 4-pack'
  ab.metadata = { ...ab.metadata, productId: 'orchard-apples-4', brand: `Westvale Orchards ${SAMPLE}`, lotId: 'WV-42', storageText: 'Store in the refrigerator or a cool, dark place.' }
  ab.requirements = { ...ab.requirements, template: 'compartment_tray', permittedMaterials: ['moulded_pulp'], preferFibre: true, monoMaterial: true }
  const apples = withDesign(project('Orchard Apples 4-pack', ab, now))
  apples.versions[0].final = true
  apples.testedVersionIds = [apples.versions[0].id]

  /* 4 — mangoes: designing */
  const mb = briefFor('mango', today)
  mb.identification.name = 'Ripe & Ready Mangoes ×2'
  mb.metadata = {
    ...mb.metadata,
    productId: 'ripe-ready-mangoes-2',
    brand: `Sunreach ${SAMPLE}`,
    storageText: 'Store at room temperature until ripe. Do not refrigerate unripe fruit.',
    afterOpeningText: 'Once cut, refrigerate and eat within 2 days.',
  }
  mb.requirements = { ...mb.requirements, template: 'folding_carton', permittedMaterials: ['corrugated_e', 'recycled_board'], cushioning: 'cells', ventilation: 'none', transport: 'long_haul' }
  const mangoes = withDesign(project('Ripe & Ready Mangoes ×2', mb, now))

  /* 5 — grapes: brief in progress */
  const gb = briefFor('grape', today)
  gb.identification.name = 'Seedless Grapes 500 g'
  gb.metadata = { ...gb.metadata, productId: 'seedless-grapes-500g', storageText: '' }
  const grapes: Project = { ...project('Seedless Grapes 500 g', gb, now), briefStage: 'B', briefComplete: false }

  return { projects: [strawberries, tomatoes, apples, mangoes, grapes], passports: [passport] }
}

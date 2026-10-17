import jsQR from 'jsqr'
import QRCode from 'qrcode'
import { describe, expect, it } from 'vitest'
import { buildQrPayload, parseQrPayload } from '../../domain/qr'
import { decodeSnapshot, encodeSnapshot, SNAPSHOT_MAX } from '../../domain/qrSnapshot'
import { catalogueSource } from '../../services/productSource'
import { CompositeSource, Registry, type KeyValue } from '../../services/registry'
import { sanitizeStudio } from '../store'
import { analyse, designNotes } from './analysis'
import { diff, interpret } from './assistant'
import { compareDesigns } from './compare'
import { estimateCost } from './cost'
import { polygonArea } from './geometry'
import { MATERIALS } from './materials'
import { applyPatch, defaultParams, validateParams } from './params'
import { deriveRecord, derivedStorageKind } from './passport'
import { briefFor, generateParams } from './project'
import { sampleProjects } from './seed'
import { breakMyDesign, runDrop, runStack, runVibration, stackCapacityN } from './sims'
import { buildPackage, cartonDieline } from './templates'
import type { CartonParams, DesignParams, TrayParams } from './types'
import { validateBrief } from './validation'

const TODAY = '2026-10-17'
const memStore = (): KeyValue => {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}
const brief = briefFor('strawberry', TODAY)
const contents = { unit: brief.identification.unitDims, units: brief.identification.unitsPerPackage }

describe('parametric templates', () => {
  it('geometry follows the parameters', () => {
    const p = defaultParams('produce_tray', { length: 180, width: 120, height: 60 }, 'rpet')
    const a = buildPackage(p, contents)
    const b = buildPackage({ ...p, length: 220 } as DesignParams, contents)
    expect(b.outer.l).toBe(220)
    expect(b.inner.l - a.inner.l).toBeCloseTo(40, 5)
    const vents = (pp: DesignParams) => buildPackage(pp, contents).plates.find((x) => x.kind === 'base')!.holes.length
    expect(vents({ ...p, ventCount: 4 } as TrayParams)).toBe(4)
    expect(vents({ ...p, ventCount: 12 } as TrayParams)).toBe(12)
  })

  it('every template builds and reports a fit', () => {
    for (const t of ['folding_carton', 'produce_tray', 'clamshell', 'compartment_tray'] as const) {
      const p = generateParams({ ...brief, requirements: { ...brief.requirements, template: t } }).params
      expect(validateParams(p)).toEqual([])
      const g = buildPackage(p, contents)
      expect(g.plates.length).toBeGreaterThan(4)
      expect(g.arrangement.fits).toBe(true)
      expect(g.arrangement.placements.length).toBe(contents.units)
    }
  })

  it('reports contents that do not fit', () => {
    const p = defaultParams('folding_carton', { length: 80, width: 60, height: 30 })
    const g = buildPackage(p, contents)
    expect(g.arrangement.fits).toBe(false)
    expect(g.arrangement.message).toMatch(/Fits|larger|shallower/)
  })

  it('carton dieline: net area equals the panels, creases are shared edges', () => {
    const p = defaultParams('folding_carton', { length: 150, width: 100, height: 60 }) as CartonParams
    const d = cartonDieline(p)
    expect(d.netAreaMm2).toBeCloseTo(d.panels.reduce((s, x) => s + polygonArea(x.polygon), 0), 6)
    expect(d.width).toBe(15 + 2 * 150 + 2 * 100)
    expect(d.creases.length).toBeGreaterThan(10)
    expect(d.cuts.length).toBeGreaterThan(d.creases.length)
    expect(d.netAreaMm2).toBeLessThan(d.width * d.height)
  })

  it('opening the clamshell moves the lid, not the base', () => {
    const p = generateParams({ ...brief, requirements: { ...brief.requirements, template: 'clamshell' } }).params
    const closed = buildPackage(p, contents, { open: 0 })
    const open = buildPackage(p, contents, { open: 1 })
    const base = (g: typeof closed) => g.plates.find((x) => x.id === 'base')!.origin
    const lid = (g: typeof closed) => g.plates.find((x) => x.id === 'lid-base')!.origin
    expect(base(open)).toEqual(base(closed))
    expect(lid(open)).not.toEqual(lid(closed))
  })

  it('rejects out-of-range and contradictory parameters', () => {
    const p = defaultParams('produce_tray', { length: 180, width: 120, height: 60 }, 'rpet') as TrayParams
    expect(validateParams({ ...p, length: 900 })[0].key).toBe('length')
    expect(validateParams({ ...p, ventCount: 40, ventDiaMm: 16 }).some((i) => i.key === 'ventCount')).toBe(true)
    expect(validateParams({ ...p, material: 'fbb_board' } as DesignParams).some((i) => i.key === 'material')).toBe(true)
  })
})

describe('cost estimate', () => {
  it('mass = area × thickness × density, and cost follows the price assumption', () => {
    const p = defaultParams('produce_tray', { length: 180, width: 120, height: 60 }, 'rpet')
    const g = buildPackage(p, contents)
    const body = g.components.find((c) => c.id === 'body')!
    const c = estimateCost(p, g, 1000)
    expect(c.massG).toBeCloseTo((body.areaMm2 / 1e6) * (p.wallMm / 1000) * MATERIALS.rpet.densityKgM3 * 1000, 6)
    expect(c.blankMassG).toBeCloseTo(c.massG / MATERIALS.rpet.processYield, 6)
    const dearer = estimateCost(p, g, 1000, { rpet: { pricePerKg: 3.6 } })
    expect(dearer.materialCost).toBeCloseTo(c.materialCost * 2, 6)
    expect(c.perBatch).toBeCloseTo(c.perPack * 1000, 6)
    expect(c.monoMaterial).toBe(true)
  })

  it('a window makes the carton multi-material', () => {
    const p = { ...defaultParams('folding_carton', { length: 150, width: 100, height: 60 }), window: true } as CartonParams
    expect(estimateCost(p, buildPackage(p, contents), 1).monoMaterial).toBe(false)
  })
})

describe('simulations', () => {
  const p = generateParams({ ...brief, requirements: { ...brief.requirements, template: 'clamshell', cushioning: 'none' } }).params
  const a = analyse(p, brief)

  it('are deterministic', () => {
    expect(runDrop(a.ctx, { heightCm: 80, orientation: 'corner' }).result).toEqual(runDrop(a.ctx, { heightCm: 80, orientation: 'corner' }).result)
    expect(runVibration(a.ctx, { profile: 'rough', durationS: 2 }).result).toEqual(runVibration(a.ctx, { profile: 'rough', durationS: 2 }).result)
  })

  it('drop: impact speed is √(2gh), higher drops hit harder, a pad softens the unit', () => {
    const lo = runDrop(a.ctx, { heightCm: 30, orientation: 'bottom' }).result
    const hi = runDrop(a.ctx, { heightCm: 100, orientation: 'bottom' }).result
    expect(hi.metrics.find((m) => m.key === 'v0')!.value).toBeCloseTo(Math.sqrt(2 * 9.81 * 1), 6)
    const g = (r: typeof lo) => r.metrics.find((m) => m.key === 'prodG')!.value
    expect(g(hi)).toBeGreaterThan(g(lo))
    const padded = analyse(applyPatch(p, { insert: 'pad' }), brief)
    expect(g(runDrop(padded.ctx, { heightCm: 80, orientation: 'bottom' }).result)).toBeLessThan(g(runDrop(a.ctx, { heightCm: 80, orientation: 'bottom' }).result))
  })

  it('stack: McKee form and load are computed as stated', () => {
    const { capacity, ect, perimeter, form } = stackCapacityN(p)
    expect(capacity).toBeCloseTo(5.87 * ect * Math.sqrt(p.wallMm * perimeter) * form, 6)
    const s = runStack(a.ctx, { layers: 5, offsetMm: 0 })
    const gross = (a.cost.massG + brief.identification.unitWeightG * brief.identification.unitsPerPackage) / 1000
    expect(s.result.metrics.find((m) => m.key === 'load')!.value).toBeCloseTo(4 * gross * 9.81, 6)
    expect(s.utilisation[0]).toBeGreaterThan(s.utilisation[4])
    expect(s.utilisation[4]).toBe(0)
    expect(runStack(a.ctx, { layers: 5, offsetMm: 40 }).result.concerns.some((c) => /lean|topple/.test(c))).toBe(true)
  })

  it('vibration: cells reduce sliding compared with loose fill', () => {
    const loose = runVibration(a.ctx, { profile: 'rough', durationS: 3 }).result.metrics.find((m) => m.key === 'travel')!.value
    const cells = analyse(applyPatch(p, { template: 'compartment_tray', cellsX: 4, cellsY: 4 }), brief)
    const sep = runVibration(cells.ctx, { profile: 'rough', durationS: 3 }).result.metrics.find((m) => m.key === 'travel')!.value
    expect(sep).toBeLessThan(loose)
  })

  it('break my design: every result carries method, assumptions and limitations', () => {
    const r = breakMyDesign(a.ctx)
    for (const x of [r.drop.result, r.stack.result, r.vibration.result]) {
      expect(x.assumptions.length).toBeGreaterThan(0)
      expect(x.limitations.join(' ')).toMatch(/Not a validated/)
      expect(['calculated', 'simplified_estimate', 'simplified_motion_model']).toContain(x.method)
    }
    for (const s of r.suggestions) expect(validateParams(applyPatch(p, s.patch))).toEqual([])
  })
})

describe('design assistant (rule-based)', () => {
  const p = generateParams(brief).params
  const ctx = { params: p, brief, assumptions: {} }
  it('maps supported requests to validated changes', () => {
    const more = interpret('Add more ventilation holes', ctx)
    expect(more.kind).toBe('change')
    if (more.kind === 'change') expect((more.params as TrayParams).ventCount).toBe((p as TrayParams).ventCount + 4)
    const wider = interpret('Make the tray 20 mm wider', ctx)
    if (wider.kind !== 'change') throw new Error('expected change')
    expect(wider.params.width).toBe(p.width + 20)
    const div = interpret('Add dividers for strawberries', ctx)
    expect(div.kind === 'change' && div.params.template).toBe('compartment_tray')
    const less = interpret('Reduce material usage', ctx)
    if (less.kind !== 'change') throw new Error('expected change')
    expect(estimateCost(less.params, buildPackage(less.params, contents), 1).massG).toBeLessThan(estimateCost(p, buildPackage(p, contents), 1).massG)
    expect(interpret('Compare recyclable paperboard with food-grade PET', ctx).kind).toBe('info')
    expect(interpret('Make the package more stackable', ctx).kind).toBe('change')
  })
  it('is honest about unsupported requests', () => {
    expect(interpret('Write me a poem', ctx).kind).toBe('unsupported')
    // Clamped to the supported range, then rejected with a reason because width may not exceed length.
    const huge = interpret('Make it 5000 mm wider', ctx)
    if (huge.kind === 'change') expect(huge.params.width).toBeLessThanOrEqual(300)
    else expect(huge.summary).toMatch(/Width/)
  })
})

describe('comparison', () => {
  it('names a trade-off instead of claiming superiority', () => {
    const p = generateParams(brief).params
    const thin = applyPatch(p, { wallMm: MATERIALS[p.material].wall.min })
    const A = analyse(p, brief)
    const B = analyse(thin, brief)
    const c = compareDesigns(p, A, breakMyDesign(A.ctx), thin, B, breakMyDesign(B.ctx))
    expect(c.statements.join(' ')).toMatch(/less material/)
    expect(['tradeoff', 'recommend', 'equal']).toContain(c.verdict.kind)
    expect(c.rows.find((r) => r.label === 'Material per pack')!.better).toBe('b')
  })
})

describe('brief validation and passport', () => {
  it('flags missing and contradictory requirements', () => {
    const bad = { ...brief, identification: { ...brief.identification, name: '' }, metadata: { ...brief.metadata, productId: 'Bad Id', tempMinC: 8, tempMaxC: 2 } }
    const fields = validateBrief(bad).map((i) => i.field)
    expect(fields).toEqual(expect.arrayContaining(['name', 'productId', 'tempMinC']))
    expect(validateBrief({ ...brief, metadata: { ...brief.metadata, productId: 'whole-milk-1l' } }, { takenIds: (id) => id === 'whole-milk-1l' }).some((i) => i.field === 'productId')).toBe(true)
  })

  it('derives storage from the temperature range', () => {
    expect(derivedStorageKind(brief)).toBe('refrigerator')
    expect(derivedStorageKind({ ...brief, metadata: { ...brief.metadata, tempMinC: 12, tempMaxC: 20 } })).toBe('room_temperature')
    expect(derivedStorageKind({ ...brief, metadata: { ...brief.metadata, tempMinC: -25, tempMaxC: -18 } })).toBe('freezer')
  })

  it('does not fabricate absent fields', () => {
    const p = generateParams(brief).params
    const r = deriveRecord({ ...brief, metadata: { ...brief.metadata, productId: 'x-test', storageText: '', dates: [] } }, p, analyse(p, brief))
    expect(r.storage).toBeUndefined()
    expect(r.dates).toEqual([])
    expect(r.brand).toBeUndefined()
    expect(r.source).toBe('producer')
    expect(r.packaging!.length).toBeGreaterThan(0)
  })
})

describe('QR snapshot and consumer resolution', () => {
  const { projects, passports } = sampleProjects(TODAY)
  const pp = passports[0]

  it('round-trips the record (without image) under the size cap', () => {
    const enc = encodeSnapshot(pp.record, 3)
    expect(enc.ok).toBe(true)
    if (!enc.ok) return
    expect(enc.data.length).toBeLessThanOrEqual(SNAPSHOT_MAX)
    const dec = decodeSnapshot(enc.data)
    expect(dec).toMatchObject({ ok: true, recordVersion: 3 })
    if (dec.ok) expect(dec.record).toEqual({ ...pp.record, image: undefined, packaging: pp.record.packaging!.map((c) => ({ id: c.id, name: c.name, material: c.material, routes: c.routes, guidance: c.guidance })) })
  })

  it('rejects malformed, oversized and unknown-version snapshots', () => {
    expect(decodeSnapshot('!!!').ok).toBe(false)
    expect(decodeSnapshot('a'.repeat(5000)).ok).toBe(false)
    expect(decodeSnapshot(btoa(JSON.stringify({ v: 2, id: 'x' })).replace(/=+$/, '')).ok).toBe(false)
    const enc = encodeSnapshot({ ...pp.record, storage: { kind: 'lava' as never, text: 'x' } }, 1)
    if (enc.ok) expect(decodeSnapshot(enc.data).ok).toBe(false)
  })

  it('resolves registry first, then snapshot, then catalogue', async () => {
    const empty = new CompositeSource(new Registry(memStore()), catalogueSource)
    const enc = encodeSnapshot(pp.record, 1)
    if (!enc.ok) throw new Error('encode')
    const payload = buildQrPayload(pp.record.id, pp.lotCode, { recordVersion: 1, snapshot: enc.data })
    expect(parseQrPayload(payload)).toMatchObject({ ok: true, productId: pp.record.id, batch: pp.lotCode, recordVersion: 1, snapshot: enc.data })
    expect(await empty.resolveQr(payload)).toMatchObject({ ok: true, origin: 'snapshot', record: { name: pp.record.name } })
    expect(await empty.resolveQr(buildQrPayload(pp.record.id))).toMatchObject({ ok: false, reason: 'not_found' })
    expect(await empty.resolveQr(buildQrPayload('whole-milk-1l'))).toMatchObject({ ok: true, origin: 'catalogue' })
    expect(await empty.resolveQr(buildQrPayload(pp.record.id, undefined, { snapshot: 'garbage!' }))).toMatchObject({ ok: false })

    const reg = new Registry(memStore())
    reg.publish(pp)
    reg.publish({ ...pp, recordVersion: 2, record: { ...pp.record, name: 'Renamed' } })
    const src = new CompositeSource(reg, catalogueSource)
    const r = await src.resolveQr(payload)
    expect(r).toMatchObject({ ok: true, origin: 'registry', recordVersion: 2, record: { name: 'Renamed' } })
    if (r.ok) expect(r.note).toMatch(/v1/)
    expect((await src.list()).some((x) => x.id === pp.record.id)).toBe(true)
  })

  it('a generated QR image decodes back to the same record', async () => {
    const reg = new Registry(memStore())
    reg.publish(pp)
    const enc = encodeSnapshot(pp.record, 1)
    if (!enc.ok) throw new Error('encode')
    const payload = buildQrPayload(pp.record.id, pp.lotCode, { recordVersion: 1, snapshot: enc.data })
    const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' })
    const n = qr.modules.size
    const scale = 4
    const margin = 4
    const size = (n + margin * 2) * scale
    const px = new Uint8ClampedArray(size * size * 4).fill(255)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if (qr.modules.get(x, y))
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) {
              const i = (((y + margin) * scale + dy) * size + (x + margin) * scale + dx) * 4
              px[i] = px[i + 1] = px[i + 2] = 0
            }
    const read = jsQR(px, size, size)
    expect(read?.data).toBe(payload)
    // Same device: the registry record. Clean device: the embedded copy. Both match the producer record.
    const same = await new CompositeSource(reg, catalogueSource).resolveQr(read!.data)
    expect(same.ok && same.record).toEqual(pp.record)
    const clean = await new CompositeSource(new Registry(memStore()), catalogueSource).resolveQr(read!.data)
    expect(clean.ok && clean.record.storage).toEqual(pp.record.storage)
    expect(clean.ok && clean.record.dates).toEqual(pp.record.dates)
  })

  it('sample projects cover every status and survive sanitisation', () => {
    expect(projects).toHaveLength(5)
    const clean = sanitizeStudio({ projects, drafts: { x: { nonsense: true } }, seeded: true })
    expect(clean.projects).toHaveLength(5)
    expect(clean.drafts).toEqual({})
    expect(sanitizeStudio('garbage').projects).toEqual([])
    for (const p of projects) for (const v of p.versions) expect(validateParams(v.params)).toEqual([])
  })

  it('design notes offer applicable fixes', () => {
    const p = applyPatch(generateParams(brief).params, { height: 120 })
    const notes = designNotes(p, brief, analyse(p, brief))
    const fix = notes.find((n) => n.suggestion)
    expect(fix).toBeTruthy()
    expect(validateParams(applyPatch(p, fix!.suggestion!.patch))).toEqual([])
    expect(diff(p, applyPatch(p, fix!.suggestion!.patch), {}, 'r').length).toBeGreaterThan(0)
  })
})
